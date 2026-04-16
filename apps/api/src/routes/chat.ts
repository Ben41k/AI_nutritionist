import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChatRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { openRouterRateLimitKey } from '../lib/rateLimitKeys.js';
import { clampLimit, decodeCursor, encodeCursor } from '../lib/cursorPagination.js';
import { createChatCompletion, createEmbedding } from '../lib/openrouter.js';
import {
  searchSimilarChunks,
  searchSimilarThreadMessages,
  setChatMessageEmbedding,
} from '../lib/vectorSearch.js';
import type { RetrievedThreadMessage } from '../lib/vectorSearch.js';
import { clampClientRationText, loadChatUserExtendedContext } from '../lib/chatUserContext.js';

const createThreadBody = z.object({
  title: z.string().max(200).optional(),
});

const patchThreadBody = z.object({
  title: z.string().min(1).max(200),
});

const postMessageBody = z.object({
  content: z.string().min(1).max(8000),
  /** Текст сохранённого рациона с устройства (sessionStorage), чтобы ИИ видел составленный план. */
  clientRationPlanText: z.string().max(24_000).optional(),
});

const messagesListQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().optional(),
});

function formatDialogMemoryForPrompt(rows: RetrievedThreadMessage[]): string {
  if (rows.length === 0) return '';
  const maxLen = 600;
  return rows
    .map((r) => {
      const tag = r.role === 'USER' ? 'USER' : 'ASSISTANT';
      const body = r.content.length > maxLen ? `${r.content.slice(0, maxLen)}…` : r.content;
      return `[${tag}]\n${body}`;
    })
    .join('\n---\n');
}

function buildSystemPrompt(params: {
  profileSummary: string;
  metricsBlock: string;
  diaryBlock: string;
  rationFromClient: string;
  knowledgeContext: string;
  dialogMemoryContext: string;
}): string {
  const kb = params.knowledgeContext.trim();
  const mem = params.dialogMemoryContext.trim();
  return [
    'You are an AI nutrition assistant (not a medical professional).',
    'Speak in Russian.',
    'Use only normal Cyrillic and Latin (for abbreviations, units, or established loanwords when natural), digits 0-9, and standard punctuation and Markdown symbols. Do not output CJK (Chinese/Japanese/Korean) characters, Hebrew or Arabic script, rare ornamental Unicode, or other hieroglyph-like clutter in your own explanations (verbatim quotes of what the user already wrote are fine). If retrieved excerpts contain non-Cyrillic script, paraphrase into Russian instead of copying those characters.',
    'Format replies in Markdown (CommonMark + GitHub-style pipe tables when comparing numbers or meal options). The client renders Markdown, so use it for clarity: short paragraphs separated by a blank line, bullet or numbered lists for plans and options, **bold** for key takeaways and warnings, `inline code` sparingly for numbers or labels when it helps scanning.',
    'For longer answers, add ### section headings. Prefer compact pipe tables over code blocks for small numeric grids; use fenced code blocks (triple backticks) for long structured snippets. Avoid decorative ASCII art.',
    'Do not diagnose diseases or prescribe medications.',
    'If the user describes acute or alarming symptoms, tell them to seek urgent in-person medical care.',
    'Prefer practical meal planning and general wellness guidance.',
    'When "Knowledge base excerpts" are provided, ground answers in them when relevant; if they are empty, answer from general nutrition principles.',
    'When "Earlier related turns from this thread" lists past lines, they are semantically similar to the current question; use them to stay consistent with facts the user stated earlier (names, goals, constraints). Do not contradict the explicit chat history you see in the messages list.',
    'The sections "User profile", "Metrics", "Food diary", and "Saved ration from app" describe the same real user; use them as ground truth when answering. If something is missing, say so briefly and ask only what is truly needed.',
    '',
    'Knowledge base excerpts:',
    kb || '(none retrieved)',
    '',
    'Earlier related turns from this thread (vector recall):',
    mem || '(none — first messages in thread or embeddings not available yet)',
    '',
    'User profile (JSON, may be incomplete):',
    params.profileSummary,
    '',
    'Metrics (weight, daily water, body measurements from the app):',
    params.metricsBlock,
    '',
    'Food diary (recent meal log entries from the app):',
    params.diaryBlock,
    '',
    'Saved ration from app (rolling plan text from the user device when they sent this message):',
    params.rationFromClient,
  ].join('\n');
}

function isPlaceholderThreadTitle(title: string | null | undefined): boolean {
  if (title == null) return true;
  const t = title.trim();
  if (t.length === 0) return true;
  return t.toLowerCase() === 'новый чат';
}

function sanitizeGeneratedThreadTitle(raw: string): string {
  let t = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^["«'"`]+|["»'"`]+$/g, '').trim();
  if (t.length === 0) return '';
  const max = 80;
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return t;
}

async function generateThreadTitleFromFirstTurn(params: {
  userContent: string;
  assistantContent: string;
}): Promise<string | null> {
  const u = params.userContent.slice(0, 1200);
  const a = params.assistantContent.slice(0, 800);
  try {
    const raw = await createChatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'Ты придумываешь короткое название чата для списка диалогов. Ответь одной строкой: 2–7 слов на русском, без кавычек, без эмодзи, без префикса «Чат:» или «Тема:». Суть — по первому вопросу пользователя и по началу ответа ассистента.',
        },
        {
          role: 'user',
          content: `Вопрос пользователя:\n${u}\n\nНачало ответа ассистента:\n${a}`,
        },
      ],
      temperature: 0.25,
    });
    const cleaned = sanitizeGeneratedThreadTitle(raw);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/chat/threads', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const threads = await prisma.chatThread.findMany({
      where: { userId: u.sub },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    await reply.send({ threads });
  });

  app.post('/chat/threads', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const parsed = createThreadBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const thread = await prisma.chatThread.create({
      data: { userId: u.sub, title: parsed.data.title ?? 'Новый чат' },
    });
    await reply.status(201).send({ thread });
  });

  app.get('/chat/threads/:threadId/messages', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { threadId } = req.params as { threadId: string };
    const qParsed = messagesListQuery.safeParse(req.query);
    if (!qParsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid query', qParsed.error.flatten());
      return;
    }
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: u.sub },
    });
    if (!thread) {
      sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
      return;
    }
    const limit = clampLimit(qParsed.data.limit);
    const rawCursor = qParsed.data.cursor?.trim();
    const cur = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && cur == null) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid cursor');
      return;
    }
    const take = limit + 1;
    const cursorWhere =
      cur != null
        ? {
            OR: [
              { createdAt: { gt: new Date(cur.t) } },
              { AND: [{ createdAt: new Date(cur.t) }, { id: { gt: cur.id } }] },
            ],
          }
        : {};

    const messages = await prisma.chatMessage.findMany({
      where: { threadId, ...cursorWhere },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
        : undefined;

    await reply.send({ messages: page, hasMore, nextCursor });
  });

  app.get('/chat/threads/:threadId', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { threadId } = req.params as { threadId: string };
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: u.sub },
      select: { id: true, title: true, updatedAt: true },
    });
    if (!thread) {
      sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
      return;
    }
    await reply.send({ thread });
  });

  app.patch('/chat/threads/:threadId', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { threadId } = req.params as { threadId: string };
    const parsed = patchThreadBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const title = parsed.data.title.trim();
    if (title.length === 0) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Title is empty');
      return;
    }
    try {
      const thread = await prisma.chatThread.update({
        where: { id: threadId, userId: u.sub },
        data: { title },
        select: { id: true, title: true, updatedAt: true },
      });
      await reply.send({ thread });
    } catch {
      sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
    }
  });

  app.post(
    '/chat/threads/:threadId/messages',
    {
      config: {
        rateLimit: {
          max: config.apiLlmRateLimitMax,
          timeWindow: config.apiLlmRateLimitWindow,
          hook: 'preHandler',
          keyGenerator: openRouterRateLimitKey,
          groupId: 'openrouter-llm',
        },
      },
    },
    async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { threadId } = req.params as { threadId: string };
    const parsed = postMessageBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: u.sub },
    });
    if (!thread) {
      sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
      return;
    }

    const priorMessageCount = await prisma.chatMessage.count({ where: { threadId } });
    const shouldAutoTitle =
      priorMessageCount === 0 && isPlaceholderThreadTitle(thread.title);

    const content = parsed.data.content;
    const clientRationSafe = clampClientRationText(parsed.data.clientRationPlanText);

    const userMessage = await prisma.chatMessage.create({
      data: { threadId, role: ChatRole.USER, content },
    });

    const { profileJson, metricsBlock, diaryBlock, rationFromClient } = await loadChatUserExtendedContext(
      prisma,
      u.sub,
      clientRationSafe,
    );

    let knowledgeContext = '';
    let dialogMemoryContext = '';
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await createEmbedding(content);
    } catch {
      /* no user embedding / no KB query */
    }
    if (queryEmbedding) {
      try {
        await setChatMessageEmbedding(prisma, userMessage.id, queryEmbedding);
      } catch {
        /* message row exists; embedding write failed */
      }
      try {
        const chunks = await searchSimilarChunks(prisma, queryEmbedding, 6);
        knowledgeContext = chunks.map((c) => c.content).join('\n---\n');
      } catch {
        /* continue without retrieval */
      }
      try {
        const remembered = await searchSimilarThreadMessages(prisma, {
          threadId,
          excludeMessageId: userMessage.id,
          embedding: queryEmbedding,
          limit: 8,
        });
        dialogMemoryContext = formatDialogMemoryForPrompt(remembered);
      } catch {
        /* continue without dialog vector memory */
      }
    }

    const history = await prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    history.reverse();

    const system = buildSystemPrompt({
      profileSummary: profileJson,
      metricsBlock,
      diaryBlock,
      rationFromClient,
      knowledgeContext,
      dialogMemoryContext,
    });

    const completionMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: system },
      ...history
        .filter((m) => m.role === ChatRole.USER || m.role === ChatRole.ASSISTANT)
        .map((m) => ({
          role: m.role === ChatRole.USER ? ('user' as const) : ('assistant' as const),
          content: m.content,
        })),
    ];

    const assistantText = await createChatCompletion({
      messages: completionMessages,
      temperature: 0.35,
    });

    const assistantMessage = await prisma.chatMessage.create({
      data: { threadId, role: ChatRole.ASSISTANT, content: assistantText },
    });

    try {
      const assistantEmbedding = await createEmbedding(assistantText);
      await setChatMessageEmbedding(prisma, assistantMessage.id, assistantEmbedding);
    } catch {
      /* assistant reply stays without embedding */
    }

    let threadTitle: string | undefined;
    const threadUpdate: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
    if (shouldAutoTitle) {
      const generated = await generateThreadTitleFromFirstTurn({
        userContent: content,
        assistantContent: assistantText,
      });
      if (generated) {
        threadUpdate.title = generated;
        threadTitle = generated;
      }
    }

    await prisma.chatThread.update({
      where: { id: threadId },
      data: threadUpdate,
    });

    await reply.send({
      message: { role: 'ASSISTANT', content: assistantText },
      retrievalUsed: knowledgeContext.length > 0,
      dialogMemoryUsed: dialogMemoryContext.length > 0,
      ...(threadTitle ? { threadTitle } : {}),
    });
  });

  app.delete('/chat/threads/:threadId', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { threadId } = req.params as { threadId: string };
    const removed = await prisma.chatThread.deleteMany({
      where: { id: threadId, userId: u.sub },
    });
    if (removed.count === 0) {
      sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
      return;
    }
    await reply.send({ ok: true });
  });
}
