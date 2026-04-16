import type { Prisma, PrismaClient } from '@prisma/client';

const WEIGHT_TAKE = 50;
const WATER_DAYS = 21;
const BODY_TAKE = 30;
const MEALS_TAKE = 100;
const MAX_MEAL_LINE = 900;
const MAX_CLIENT_RATION = 22_000;

function truncateLine(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function jsonBrief(v: Prisma.JsonValue | null | undefined): string {
  if (v == null) return '';
  try {
    const s = JSON.stringify(v);
    return s.length > 420 ? `${s.slice(0, 420)}…` : s;
  } catch {
    return '';
  }
}

export function clampClientRationText(input: string | undefined | null): string {
  if (input == null) return '';
  const t = input.trim();
  if (t.length === 0) return '';
  if (t.length <= MAX_CLIENT_RATION) return t;
  return `${t.slice(0, MAX_CLIENT_RATION)}\n\n[... рацион с устройства обрезан из‑за лимита длины ...]`;
}

export async function loadChatUserExtendedContext(
  prisma: PrismaClient,
  userId: string,
  clientRationPlanText: string,
): Promise<{ profileJson: string; metricsBlock: string; diaryBlock: string; rationFromClient: string }> {
  const [profile, weights, waters, bodies, meals] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.weightEntry.findMany({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
      take: WEIGHT_TAKE,
    }),
    prisma.dailyWater.findMany({
      where: { userId },
      orderBy: { day: 'desc' },
      take: WATER_DAYS,
    }),
    prisma.bodyMeasurement.findMany({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
      take: BODY_TAKE,
    }),
    prisma.mealEntry.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: MEALS_TAKE,
    }),
  ]);

  const profileJson = profile
    ? JSON.stringify({
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
        updatedAt: profile.updatedAt,
      })
    : '{}';

  const weightLines =
    weights.length === 0
      ? 'Записей веса пока нет.'
      : [...weights]
          .reverse()
          .map(
            (w) =>
              `- ${w.recordedAt.toISOString()}: ${w.weightKg} кг`,
          )
          .join('\n');

  const waterLines =
    waters.length === 0
      ? 'Записей потребления воды по дням пока нет.'
      : [...waters]
          .reverse()
          .map((d) => `- ${d.day.toISOString().slice(0, 10)}: ${d.totalMl} мл`)
          .join('\n');

  const bodyLines =
    bodies.length === 0
      ? 'Замеров объёмов (шея/талия/бёдра) пока нет.'
      : [...bodies]
          .reverse()
          .map((b) => {
            const parts = [
              b.neckCm != null ? `шея ${b.neckCm} см` : null,
              b.waistCm != null ? `талия ${b.waistCm} см` : null,
              b.hipsCm != null ? `бёдра ${b.hipsCm} см` : null,
            ].filter(Boolean);
            return `- ${b.recordedAt.toISOString()}: ${parts.length ? parts.join(', ') : 'без числовых значений'}`;
          })
          .join('\n');

  const metricsBlock = [
    'Вес (хронология от старых к новым в этом блоке):',
    weightLines,
    '',
    'Вода за день (мл, по дате дня):',
    waterLines,
    '',
    'Объёмы тела:',
    bodyLines,
  ].join('\n');

  const mealChrono = [...meals].reverse();
  let diaryBlock: string;
  if (mealChrono.length === 0) {
    diaryBlock = 'Записей дневника питания пока нет.';
  } else {
    diaryBlock = mealChrono
      .map((m) => {
        const struct = jsonBrief(m.structuredEstimate);
        const extra = struct ? ` Оценка/структура: ${struct}` : '';
        const desc = truncateLine(m.description, MAX_MEAL_LINE);
        return `- ${m.occurredAt.toISOString()} | порция: ${m.portionEstimate} | модель: ${m.isModelEstimate ? 'да' : 'нет'}${extra}\n  ${desc}`;
      })
      .join('\n');
  }
  const diaryCap = 28_000;
  if (diaryBlock.length > diaryCap) {
    diaryBlock = `${diaryBlock.slice(0, diaryCap)}\n\n[... дневник обрезан из‑за лимита длины ...]`;
  }

  const rationFromClient = clientRationPlanText.trim()
    ? clientRationPlanText
    : 'Рацион с устройства не передан (пользователь мог не сохранять план в этой сессии).';

  return { profileJson, metricsBlock, diaryBlock, rationFromClient };
}
