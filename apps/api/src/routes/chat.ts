import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChatRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { createChatCompletion, createEmbedding } from '../lib/openrouter.js';
import {
  searchSimilarChunks,
  searchSimilarThreadMessages,
  setChatMessageEmbedding,
} from '../lib/vectorSearch.js';
import type { RetrievedThreadMessage } from '../lib/vectorSearch.js';

const createThreadBody = z.object({
  title: z.string().max(200).optional(),
});

const postMessageBody = z.object({
  content: z.string().min(1).max(8000),
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
  knowledgeContext: string;
  dialogMemoryContext: string;
}): string {
  const kb = params.knowledgeContext.trim();
  const mem = params.dialogMemoryContext.trim();
  return [
    'You are an AI nutrition assistant (not a medical professional).',
    'Speak in Russian.',
    'Do not use MarkDown formatting in your responses.',
    'Do not diagnose diseases or prescribe medications.',
    'If the user describes acute or alarming symptoms, tell them to seek urgent in-person medical care.',
    'Prefer practical meal planning and general wellness guidance.',
    'When "Knowledge base excerpts" are provided, ground answers in them when relevant; if they are empty, answer from general nutrition principles.',
    'When "Earlier related turns from this thread" lists past lines, they are semantically similar to the current question; use them to stay consistent with facts the user stated earlier (names, goals, constraints). Do not contradict the explicit chat history you see in the messages list.',
    '',
    'Knowledge base excerpts:',
    kb || '(none retrieved)',
    '',
    'Earlier related turns from this thread (vector recall):',
    mem || '(none — first messages in thread or embeddings not available yet)',
    '',
    'User profile (may be incomplete):',
    params.profileSummary,
  ].join('\n');
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
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: u.sub },
    });
    if (!thread) {
      sendError(reply, 404, 'NOT_FOUND', 'Thread not found');
      return;
    }
    const messages = await prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    await reply.send({ messages });
  });

  app.post('/chat/threads/:threadId/messages', async (req, reply) => {
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

    const content = parsed.data.content;

    const userMessage = await prisma.chatMessage.create({
      data: { threadId, role: ChatRole.USER, content },
    });

    const profile = await prisma.profile.findUnique({ where: { userId: u.sub } });
    const profileSummary = profile
      ? JSON.stringify({
          age: profile.age,
          sex: profile.sex,
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          goal: profile.goal,
          activityLevel: profile.activityLevel,
          allergies: profile.allergies,
          preferences: profile.preferences,
        })
      : '{}';

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

    const system = buildSystemPrompt({ profileSummary, knowledgeContext, dialogMemoryContext });

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

    await prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    await reply.send({
      message: { role: 'ASSISTANT', content: assistantText },
      retrievalUsed: knowledgeContext.length > 0,
      dialogMemoryUsed: dialogMemoryContext.length > 0,
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
