import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ActivityLevel, NutritionGoal, Sex } from '@prisma/client';
import { prisma } from '../prisma.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { USER_INPUT } from '../lib/userInputBounds.js';

const profilePatch = z.object({
  age: z
    .number()
    .int()
    .min(USER_INPUT.profileAge.min)
    .max(USER_INPUT.profileAge.max)
    .optional()
    .nullable(),
  sex: z.nativeEnum(Sex).optional(),
  weightKg: z
    .number()
    .min(USER_INPUT.weightKg.min)
    .max(USER_INPUT.weightKg.max)
    .optional()
    .nullable(),
  heightCm: z
    .number()
    .min(USER_INPUT.heightCm.min)
    .max(USER_INPUT.heightCm.max)
    .optional()
    .nullable(),
  goal: z.nativeEnum(NutritionGoal).optional(),
  activityLevel: z.nativeEnum(ActivityLevel).optional(),
  allergies: z.string().max(USER_INPUT.allergiesPreferencesMaxChars).optional().nullable(),
  preferences: z.string().max(USER_INPUT.allergiesPreferencesMaxChars).optional().nullable(),
  targetWeightKg: z
    .number()
    .min(USER_INPUT.weightKg.min)
    .max(USER_INPUT.weightKg.max)
    .optional()
    .nullable(),
  startWeightKg: z
    .number()
    .min(USER_INPUT.weightKg.min)
    .max(USER_INPUT.weightKg.max)
    .optional()
    .nullable(),
  waterGoalMl: z
    .number()
    .int()
    .min(USER_INPUT.waterGoalMl.min)
    .max(USER_INPUT.waterGoalMl.max)
    .optional(),
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
