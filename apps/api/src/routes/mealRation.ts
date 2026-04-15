import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { openRouterRateLimitKey } from '../lib/rateLimitKeys.js';
import { createChatCompletion, createEmbedding } from '../lib/openrouter.js';
import { searchSimilarChunks } from '../lib/vectorSearch.js';

function buildMonthlyRationPrompt(params: {
  profileSummary: string;
  knowledgeContext: string;
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const kb = params.knowledgeContext.trim();
  return [
    {
      role: 'system',
      content: [
        'You are an AI nutrition assistant (not a medical professional).',
        'Speak in Russian.',
        'Do not use MarkDown formatting in your response.',
        'Do not diagnose diseases or prescribe medications.',
        'Produce an approximate (illustrative) meal plan for one calendar month based on the user profile JSON.',
        'The plan is a general example, not a strict prescription; mention that the user should adjust portions and products to taste and tolerance.',
        'Structure the answer clearly: short intro with estimated daily calorie range if you can infer it from the profile, then 4 blocks «Неделя 1» … «Неделя 4».',
        'Within each week give 7 days; for each day outline breakfast, lunch, dinner, and one snack with concrete product examples suitable for the stated allergies and preferences.',
        'Respect allergies strictly (exclude allergens entirely). Honor preferences when reasonable.',
        'Keep total length reasonable (roughly up to 6000 characters); prioritize clarity over exhaustiveness.',
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
      content:
        'Составь примерный рацион питания на один месяц с учётом моего профиля. Учитывай цель, уровень активности, аллергии и предпочтения из JSON.',
    },
  ];
}

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

      const messages = buildMonthlyRationPrompt({ profileSummary, knowledgeContext });
      const plan = await createChatCompletion({
        messages,
        temperature: 0.35,
      });

      await reply.send({
        plan,
        retrievalUsed: knowledgeContext.length > 0,
      });
    },
  );
}
