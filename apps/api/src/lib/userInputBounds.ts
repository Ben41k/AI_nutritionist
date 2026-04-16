/**
 * Разумные пределы для пользовательского ввода (антропометрия, дневник, вода).
 * Держите в синхроне с `apps/web/src/shared/lib/userInputBounds.ts`.
 */
export const USER_INPUT = {
  profileAge: { min: 14, max: 110 },
  /** Вес тела, целевой и стартовый — кг */
  weightKg: { min: 25, max: 250 },
  heightCm: { min: 100, max: 230 },
  waterGoalMl: { min: 500, max: 12000 },
  allergiesPreferencesMaxChars: 4000,
  mealDescription: { min: 1, max: 4000 },
  /** Оценка модели за один приём пищи */
  mealEstimate: {
    caloriesKcal: { min: 0, max: 15000 },
    macroG: { min: 0, max: 800 },
    notesMaxChars: 2000,
  },
  waterAddMl: { min: 50, max: 2000 },
  /** Верхняя граница учтённой воды за календарный день (защита от накрутки) */
  waterDailyTotalCapMl: 50_000,
  neckCm: { min: 20, max: 75 },
  waistCm: { min: 35, max: 200 },
  hipsCm: { min: 35, max: 200 },
} as const;
