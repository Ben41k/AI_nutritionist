import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PortionEstimate } from '@prisma/client';
import { prisma } from '../prisma.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { createChatCompletion } from '../lib/openrouter.js';

const mealCreate = z.object({
  occurredAt: z.string().datetime(),
  description: z.string().min(1).max(4000),
  portionEstimate: z.nativeEnum(PortionEstimate).optional(),
  analyzeWithModel: z.boolean().optional(),
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
  })
  .refine((q) => (q.from != null && q.to != null) || q.date != null, {
    message: 'Provide ?date=YYYY-MM-DD or both ?from=&to= as ISO-8601 datetimes',
  });

const structuredSchema = z.object({
  caloriesKcal: optionalNumber,
  proteinG: optionalNumber,
  fatG: optionalNumber,
  carbsG: optionalNumber,
  notes: z.string().optional(),
});

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
    const meals = await prisma.mealEntry.findMany({
      where: { userId: u.sub, occurredAt: { gte: start, lte: end } },
      orderBy: { occurredAt: 'asc' },
    });
    await reply.send({ meals });
  });

  app.post('/meals', async (req, reply) => {
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
    const { occurredAt, description, portionEstimate, analyzeWithModel } = parsed.data;

    let structuredEstimate: unknown = undefined;
    let isModelEstimate = false;

    if (analyzeWithModel) {
      const raw = await createChatCompletion({
        messages: [
          {
            role: 'system',
            content:
              'You estimate meal nutrition from a short user description. Reply ONLY valid JSON with keys: caloriesKcal (number), proteinG, fatG, carbsG, notes (string). Values are rough estimates, not lab analysis.',
          },
          { role: 'user', content: description },
        ],
        temperature: 0.2,
      });
      try {
        const json = JSON.parse(extractJsonObject(raw)) as unknown;
        const checked = structuredSchema.safeParse(json);
        if (checked.success) {
          structuredEstimate = checked.data;
          isModelEstimate = true;
        }
      } catch {
        // leave structured empty
      }
    }

    const meal = await prisma.mealEntry.create({
      data: {
        userId: u.sub,
        occurredAt: new Date(occurredAt),
        description,
        portionEstimate: portionEstimate ?? PortionEstimate.UNKNOWN,
        structuredEstimate: structuredEstimate ?? undefined,
        isModelEstimate,
      },
    });
    await reply.status(201).send({ meal });
  });
}
