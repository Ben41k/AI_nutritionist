import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { USER_INPUT } from '../lib/userInputBounds.js';

function parseDayUtc(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

const weightPost = z.object({
  weightKg: z.number().min(USER_INPUT.weightKg.min).max(USER_INPUT.weightKg.max),
  recordedAt: z.string().datetime().optional(),
});

const waterPost = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  addMl: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: 'addMl must not be 0' })
    .refine(
      (n) => {
        const a = Math.abs(n);
        return a >= USER_INPUT.waterAddMl.min && a <= USER_INPUT.waterAddMl.max;
      },
      { message: 'addMl must be between ±50 and ±2000 ml' },
    ),
});

const measurementPost = z.object({
  recordedAt: z.string().datetime().optional(),
  neckCm: z.number().min(USER_INPUT.neckCm.min).max(USER_INPUT.neckCm.max).optional(),
  waistCm: z.number().min(USER_INPUT.waistCm.min).max(USER_INPUT.waistCm.max).optional(),
  hipsCm: z.number().min(USER_INPUT.hipsCm.min).max(USER_INPUT.hipsCm.max).optional(),
});

export async function registerTrackingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tracking/weight', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const q = z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
      .safeParse(req.query);
    if (!q.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid query', q.error.flatten());
      return;
    }
    let start = new Date(q.data.from);
    let end = new Date(q.data.to);
    if (start.getTime() > end.getTime()) {
      const t = start;
      start = end;
      end = t;
    }
    const entries = await prisma.weightEntry.findMany({
      where: { userId: u.sub, recordedAt: { gte: start, lte: end } },
      orderBy: { recordedAt: 'asc' },
    });
    await reply.send({ entries });
  });

  app.post('/tracking/weight', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const parsed = weightPost.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const recordedAt = parsed.data.recordedAt
      ? new Date(parsed.data.recordedAt)
      : new Date();
    const entry = await prisma.weightEntry.create({
      data: {
        userId: u.sub,
        recordedAt,
        weightKg: parsed.data.weightKg,
      },
    });
    await prisma.profile.updateMany({
      where: { userId: u.sub },
      data: { weightKg: parsed.data.weightKg },
    });
    await reply.status(201).send({ entry });
  });

  app.get('/tracking/water', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const q = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .safeParse(req.query);
    if (!q.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid query', q.error.flatten());
      return;
    }
    const fromD = parseDayUtc(q.data.from);
    const toD = parseDayUtc(q.data.to);
    if (!fromD || !toD) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid date range');
      return;
    }
    const rows = await prisma.dailyWater.findMany({
      where: { userId: u.sub, day: { gte: fromD, lte: toD } },
      orderBy: { day: 'asc' },
    });
    await reply.send({
      days: rows.map((r) => ({
        date: r.day.toISOString().slice(0, 10),
        totalMl: r.totalMl,
      })),
    });
  });

  app.post('/tracking/water', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const parsed = waterPost.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const day = parseDayUtc(parsed.data.date);
    if (!day) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid date');
      return;
    }
    const add = parsed.data.addMl;
    const cap = USER_INPUT.waterDailyRecordedMaxMl;
    const row = await prisma.dailyWater.upsert({
      where: { userId_day: { userId: u.sub, day } },
      create: { userId: u.sub, day, totalMl: Math.max(0, add) },
      update: { totalMl: { increment: add } },
    });
    let totalMl = row.totalMl;
    const clamped = Math.max(0, Math.min(totalMl, cap));
    if (clamped !== totalMl) {
      const fixed = await prisma.dailyWater.update({
        where: { userId_day: { userId: u.sub, day } },
        data: { totalMl: clamped },
      });
      totalMl = fixed.totalMl;
    }
    await reply.send({ day: row.day.toISOString().slice(0, 10), totalMl });
  });

  app.get('/tracking/measurements', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const rows = await prisma.bodyMeasurement.findMany({
      where: { userId: u.sub },
      orderBy: { recordedAt: 'desc' },
      take: 60,
    });
    await reply.send({ measurements: rows });
  });

  app.post('/tracking/measurements', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const parsed = measurementPost.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const { neckCm, waistCm, hipsCm, recordedAt } = parsed.data;
    if (neckCm == null && waistCm == null && hipsCm == null) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'At least one measurement is required');
      return;
    }
    const at = recordedAt ? new Date(recordedAt) : new Date();
    const m = await prisma.bodyMeasurement.create({
      data: {
        userId: u.sub,
        recordedAt: at,
        neckCm: neckCm ?? null,
        waistCm: waistCm ?? null,
        hipsCm: hipsCm ?? null,
      },
    });
    await reply.status(201).send({ measurement: m });
  });
}
