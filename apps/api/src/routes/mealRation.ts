import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { openRouterRateLimitKey } from '../lib/rateLimitKeys.js';
import { createChatCompletion, createEmbedding } from '../lib/openrouter.js';
import { searchSimilarChunks } from '../lib/vectorSearch.js';

const postBodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

function parseMonthParts(month: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!y || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function listIsoDatesInMonth(month: string): string[] {
  const p = parseMonthParts(month);
  if (!p) return [];
  const last = new Date(p.y, p.m, 0).getDate();
  const ym = `${p.y}-${pad2(p.m)}`;
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${ym}-${pad2(d)}`);
  }
  return out;
}

function buildJsonMonthlyPrompt(params: {
  profileSummary: string;
  knowledgeContext: string;
  month: string;
  dates: string[];
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const kb = params.knowledgeContext.trim();
  const dateList = params.dates.join(', ');
  return [
    {
      role: 'system',
      content: [
        'You are an AI nutrition assistant (not a medical professional).',
        'Do not diagnose diseases or prescribe medications.',
        'You must reply with a single JSON object only — no markdown, no code fences, no text before or after the JSON.',
        'Use double quotes for all JSON keys and string values. Escape newlines inside strings as \\n.',
        'JSON shape exactly:',
        '{"preamble":"string in Russian, short intro and calorie hint if possible","days":{"YYYY-MM-DD":"string in Russian for that day"}}',
        `The keys in "days" must be exactly these calendar dates for month ${params.month}: ${dateList}`,
        'Every listed date must appear as a key in "days".',
        'For each "days" value: the string MUST start with its first line giving the weekday name and the calendar date in Russian that matches the JSON key (e.g. key 2026-04-15 → first line like «понедельник, 15 апреля 2026» or «Понедельник, 15.04.2026»), then a blank line, then 4–10 short lines: breakfast, lunch, dinner, one snack — concrete foods; respect allergies and preferences from the profile strictly.',
        'Do not use Markdown anywhere in "preamble" or in any "days" value: no # headings, no ** or __ emphasis, no bullet lists with - or *, no numbered markdown lists, no [text](url) links, no code fences. Use plain Russian text and line breaks only.',
        'The plan is illustrative only; values may note that portions should be adjusted individually.',
        'Keep each day value concise (under 900 characters per day) so the full JSON stays reasonable.',
        '',
        'Knowledge base excerpts (may be empty):',
        kb || '(none retrieved)',
        '',
        'User profile JSON:',
        params.profileSummary,
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Составь примерный рацион на календарный месяц ${params.month} в формате JSON, как указано в системных инструкциях.`,
    },
  ];
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}

function parseModelJsonObject(content: string): unknown {
  const t = stripJsonFences(content);
  return JSON.parse(t) as unknown;
}

const llmDaysSchema = z.object({
  preamble: z.string().optional(),
  days: z.record(z.string(), z.string()),
});

export async function registerMealRationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/meal-ration/monthly',
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

      const parsedBody = postBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsedBody.error.flatten());
        return;
      }
      const { month } = parsedBody.data;
      const dates = listIsoDatesInMonth(month);
      if (dates.length === 0) {
        sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid month');
        return;
      }

      const profile = await prisma.profile.findUnique({ where: { userId: u.sub } });
      if (!profile) {
        sendError(reply, 404, 'NOT_FOUND', 'Profile not found');
        return;
      }

      const profileSummary = JSON.stringify({
        age: profile.age,
        sex: profile.sex,
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        goal: profile.goal,
        activityLevel: profile.activityLevel,
        allergies: profile.allergies,
        preferences: profile.preferences,
        targetWeightKg: profile.targetWeightKg,
        startWeightKg: profile.startWeightKg,
        waterGoalMl: profile.waterGoalMl,
      });

      let knowledgeContext = '';
      try {
        const q =
          'Сбалансированный рацион питания на месяц: калорийность, БЖУ, примеры завтраков обедов ужинов, ограничения по аллергиям';
        const emb = await createEmbedding(q);
        const chunks = await searchSimilarChunks(prisma, emb, 6);
        knowledgeContext = chunks.map((c) => c.content).join('\n---\n');
      } catch {
        /* optional KB */
      }

      const messages = buildJsonMonthlyPrompt({
        profileSummary,
        knowledgeContext,
        month,
        dates,
      });

      const raw = await createChatCompletion({
        messages,
        temperature: 0.25,
      });

      let parsed: z.infer<typeof llmDaysSchema>;
      try {
        const obj = parseModelJsonObject(raw);
        const zr = llmDaysSchema.safeParse(obj);
        if (!zr.success) {
          sendError(reply, 502, 'RATION_PARSE_ERROR', 'Model returned invalid JSON shape');
          return;
        }
        parsed = zr.data;
      } catch {
        sendError(reply, 502, 'RATION_PARSE_ERROR', 'Model returned non-JSON output');
        return;
      }

      const merged: Record<string, string> = {};
      for (const iso of dates) {
        const v = parsed.days[iso]?.trim();
        merged[iso] =
          v && v.length > 0
            ? v
            : 'За этот день не удалось получить блок рациона из ответа модели — сформируйте рацион ещё раз.';
      }

      const preamble =
        typeof parsed.preamble === 'string' && parsed.preamble.trim().length > 0
          ? parsed.preamble.trim()
          : null;

      await reply.send({
        month,
        preamble,
        days: merged,
        retrievalUsed: knowledgeContext.length > 0,
      });
    },
  );
}
