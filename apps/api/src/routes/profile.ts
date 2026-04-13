import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ActivityLevel, NutritionGoal, Sex } from '@prisma/client';
import { prisma } from '../prisma.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';

const profilePatch = z.object({
  age: z.number().int().min(1).max(120).optional().nullable(),
  sex: z.nativeEnum(Sex).optional(),
  weightKg: z.number().min(20).max(400).optional().nullable(),
  heightCm: z.number().min(80).max(250).optional().nullable(),
  goal: z.nativeEnum(NutritionGoal).optional(),
  activityLevel: z.nativeEnum(ActivityLevel).optional(),
  allergies: z.string().max(4000).optional().nullable(),
  preferences: z.string().max(4000).optional().nullable(),
});

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/profile', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const profile = await prisma.profile.findUnique({
      where: { userId: u.sub },
    });
    if (!profile) {
      sendError(reply, 404, 'NOT_FOUND', 'Profile not found');
      return;
    }
    await reply.send({ profile });
  });

  app.patch('/profile', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const parsed = profilePatch.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const profile = await prisma.profile.update({
      where: { userId: u.sub },
      data: parsed.data,
    });
    await reply.send({ profile });
  });
}
