/**
 * Разумные пределы для пользовательского ввода.
 * Держите в синхроне с `apps/api/src/lib/userInputBounds.ts`.
 */
export const USER_INPUT = {
  profileAge: { min: 14, max: 110 },
  weightKg: { min: 25, max: 250 },
  heightCm: { min: 100, max: 230 },
  waterGoalMl: { min: 500, max: 12000 },
  allergiesPreferencesMaxChars: 4000,
  mealDescription: { min: 1, max: 4000 },
  mealEstimate: {
    caloriesKcal: { min: 0, max: 15000 },
    macroG: { min: 0, max: 800 },
    notesMaxChars: 2000,
  },
  waterAddMl: { min: 50, max: 2000 },
  waterDailyRecordedMaxMl: 5000,
  mealFluidMlPerMealMax: 4000,
  neckCm: { min: 20, max: 75 },
  waistCm: { min: 35, max: 200 },
  hipsCm: { min: 35, max: 200 },
  chatMessageMaxChars: 8000,
  chatTitleMaxChars: 200,
  passwordMaxChars: 128,
} as const;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function parseFiniteNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}
