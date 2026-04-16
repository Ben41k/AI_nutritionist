import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PortionEstimate, type Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { openRouterRateLimitKey } from '../lib/rateLimitKeys.js';
import { clampLimit, decodeCursor, encodeCursor } from '../lib/cursorPagination.js';
import { createChatCompletion } from '../lib/openrouter.js';
import { USER_INPUT } from '../lib/userInputBounds.js';
import { incrementDailyWater, parseWaterCalendarDayUtc } from '../lib/dailyWater.js';

const mealCreate = z.object({
  occurredAt: z.string().datetime(),
  description: z.string().min(1).max(4000),
  portionEstimate: z.nativeEnum(PortionEstimate).optional(),
  /** Календарный день дневника YYYY-MM-DD (как на клиенте); нужен для учёта воды из приёма */
  diaryLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const optionalNumber = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return undefined;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}, z.number().optional());

const mealsListQuery = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
  })
  .refine((q) => (q.from != null && q.to != null) || q.date != null, {
    message: 'Provide ?date=YYYY-MM-DD or both ?from=&to= as ISO-8601 datetimes',
  });

const { mealEstimate } = USER_INPUT;
const structuredSchema = z.object({
  caloriesKcal: optionalNumber.refine(
    (v) =>
      v === undefined ||
      (v >= mealEstimate.caloriesKcal.min && v <= mealEstimate.caloriesKcal.max),
    { message: 'caloriesKcal out of range' },
  ),
  proteinG: optionalNumber.refine(
    (v) => v === undefined || (v >= mealEstimate.macroG.min && v <= mealEstimate.macroG.max),
    { message: 'proteinG out of range' },
  ),
  fatG: optionalNumber.refine(
    (v) => v === undefined || (v >= mealEstimate.macroG.min && v <= mealEstimate.macroG.max),
    { message: 'fatG out of range' },
  ),
  carbsG: optionalNumber.refine(
    (v) => v === undefined || (v >= mealEstimate.macroG.min && v <= mealEstimate.macroG.max),
    { message: 'carbsG out of range' },
  ),
  /** Оценка объёма жидкости (вода, чай, сок, молоко, бульон и т.п.), мл — для суточной метрики воды */
  fluidMl: optionalNumber.refine(
    (v) =>
      v === undefined ||
      (v >= 0 && v <= USER_INPUT.mealFluidMlPerMealMax),
    { message: 'fluidMl out of range' },
  ),
  notes: z.string().max(mealEstimate.notesMaxChars).optional(),
});

function fluidMlFromStructured(structured: unknown): number {
  if (structured == null || typeof structured !== 'object') return 0;
  const o = structured as Record<string, unknown>;
  const v = o.fluidMl;
  const cap = USER_INPUT.mealFluidMlPerMealMax;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.round(Math.max(0, Math.min(v, cap)));
  }
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n)) return Math.round(Math.max(0, Math.min(n, cap)));
  }
  return 0;
}

function extractJsonObject(raw: string): string {
  let s = raw.trim();
  const fenced = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(s);
  if (fenced) s = fenced[1].trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) return s.slice(i, j + 1);
  return s;
}

export async function registerMealRoutes(app: FastifyInstance): Promise<void> {
  app.get('/meals', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const parsed = mealsListQuery.safeParse(req.query);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meals list query', parsed.error.flatten());
      return;
    }
    const q = parsed.data;
    let start: Date;
    let end: Date;
    if (q.from != null && q.to != null) {
      start = new Date(q.from);
      end = new Date(q.to);
      if (start.getTime() > end.getTime()) {
        const t = start;
        start = end;
        end = t;
      }
    } else if (q.date != null) {
      start = new Date(`${q.date}T00:00:00.000Z`);
      end = new Date(`${q.date}T23:59:59.999Z`);
    } else {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meals list query');
      return;
    }
    const limit = clampLimit(parsed.data.limit);
    const rawCursor = parsed.data.cursor?.trim();
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
              { occurredAt: { gt: new Date(cur.t) } },
              { AND: [{ occurredAt: new Date(cur.t) }, { id: { gt: cur.id } }] },
            ],
          }
        : {};

    const meals = await prisma.mealEntry.findMany({
      where: {
        userId: u.sub,
        occurredAt: { gte: start, lte: end },
        ...cursorWhere,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take,
    });

    const hasMore = meals.length > limit;
    const page = hasMore ? meals.slice(0, limit) : meals;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ t: last.occurredAt.toISOString(), id: last.id })
        : undefined;

    await reply.send({ meals: page, hasMore, nextCursor });
  });

  app.post(
    '/meals',
    {
      config: {
        rateLimit: {
          max: async () => config.apiLlmRateLimitMax,
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
    const parsed = mealCreate.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const { occurredAt, description, portionEstimate, diaryLocalDate } = parsed.data;

    let structuredEstimate: unknown = undefined;
    let isModelEstimate = false;

    try {
      const raw = await createChatCompletion({
        messages: [
          {
            role: 'system',
            content:
              'You estimate meal nutrition from a short user description (any input language). Reply ONLY valid JSON with keys: caloriesKcal (number), proteinG, fatG, carbsG, fluidMl (number), notes (string). Numbers are rough estimates, not lab analysis. "fluidMl" = total milliliters of hydrating fluids in this entry (plain water, tea, coffee, juice, milk, kefir, soup broth, smoothies with liquid, etc.); use 0 if the description is only solid food with negligible drink. The "notes" field MUST be 1–3 short sentences entirely in Russian for the end user (portions, uncertainty, brief tips). Use Russian only in "notes", no English there.',
          },
          { role: 'user', content: description },
        ],
        temperature: 0.2,
      });
      try {
        const json = JSON.parse(extractJsonObject(raw)) as unknown;
        const checked = structuredSchema.safeParse(json);
        if (checked.success) {
          const data: Record<string, unknown> = { ...checked.data };
          if (data.fluidMl != null && typeof data.fluidMl === 'number') {
            data.fluidMl = Math.round(
              Math.max(0, Math.min(data.fluidMl, USER_INPUT.mealFluidMlPerMealMax)),
            );
          }
          structuredEstimate = data;
          isModelEstimate = true;
        }
      } catch {
        // leave structured empty
      }
    } catch {
      // сохраняем приём без оценки, если OpenRouter недоступен
    }

    const meal = await prisma.mealEntry.create({
      data: {
        userId: u.sub,
        occurredAt: new Date(occurredAt),
        diaryLocalDate: diaryLocalDate ?? null,
        description,
        portionEstimate: portionEstimate ?? PortionEstimate.UNKNOWN,
        structuredEstimate: structuredEstimate ?? undefined,
        isModelEstimate,
      } as unknown as Prisma.MealEntryUncheckedCreateInput,
    });

    const fluidAdd = fluidMlFromStructured(structuredEstimate);
    if (diaryLocalDate && fluidAdd > 0) {
      const day = parseWaterCalendarDayUtc(diaryLocalDate);
      if (day) {
        await incrementDailyWater(prisma, { userId: u.sub, day, deltaMl: fluidAdd });
      }
    }

    await reply.status(201).send({ meal });
  });

  app.delete('/meals/:mealId', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { mealId } = req.params as { mealId: string };
    const existing = await prisma.mealEntry.findFirst({
      where: { id: mealId, userId: u.sub },
    });
    if (!existing) {
      sendError(reply, 404, 'NOT_FOUND', 'Meal not found');
      return;
    }
    const fluidSub = fluidMlFromStructured(existing.structuredEstimate);
    const dayStr =
      (existing as unknown as { diaryLocalDate?: string | null }).diaryLocalDate ?? null;
    await prisma.mealEntry.delete({ where: { id: mealId } });
    if (fluidSub > 0 && dayStr) {
      const day = parseWaterCalendarDayUtc(dayStr);
      if (day) {
        await incrementDailyWater(prisma, { userId: u.sub, day, deltaMl: -fluidSub });
      }
    }
    await reply.send({ ok: true });
  });
}
