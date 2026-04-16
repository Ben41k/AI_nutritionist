import type { PrismaClient } from '@prisma/client';
import { USER_INPUT } from './userInputBounds.js';

/** Календарная дата YYYY-MM-DD как UTC-полночь (как в /tracking/water). */
export function parseWaterCalendarDayUtc(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/**
 * Изменить суточный учёт воды на один день (любой целый delta, в т.ч. мелкие порции из дневника).
 * Итог ограничен 0 … waterDailyRecordedMaxMl.
 */
export async function incrementDailyWater(
  prisma: PrismaClient,
  params: { userId: string; day: Date; deltaMl: number },
): Promise<{ totalMl: number }> {
  const { userId, day } = params;
  const deltaMl = Math.round(params.deltaMl);
  const cap = USER_INPUT.waterDailyRecordedMaxMl;
  const row = await prisma.dailyWater.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, totalMl: Math.max(0, deltaMl) },
    update: { totalMl: { increment: deltaMl } },
  });
  let totalMl = row.totalMl;
  const clamped = Math.max(0, Math.min(totalMl, cap));
  if (clamped !== totalMl) {
    const fixed = await prisma.dailyWater.update({
      where: { userId_day: { userId, day } },
      data: { totalMl: clamped },
    });
    totalMl = fixed.totalMl;
  }
  return { totalMl };
}
