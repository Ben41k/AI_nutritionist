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

const dateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const structuredSchema = z.object({
  caloriesKcal: z.number().optional(),
  proteinG: z.number().optional(),
  fatG: z.number().optional(),
  carbsG: z.number().optional(),
  notes: z.string().optional(),
});

export async function registerMealRoutes(app: FastifyInstance): Promise<void> {
  app.get('/meals', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const parsed = dateQuery.safeParse(req.query);
    if (!parsed.success) {
      sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Query ?date=YYYY-MM-DD required',
        parsed.error.flatten(),
      );
      return;
    }
    const { date } = parsed.data;
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
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
        const json = JSON.parse(raw) as unknown;
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
