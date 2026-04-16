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
  /** За один запрос: прибавить или убрать воду, мл (знак ±, не ноль). */
  waterAddMl: { min: 50, max: 2000 },
  /** Максимум учтённой воды за календарный день (защита от ошибок ввода). */
  waterDailyRecordedMaxMl: 5000,
  /** Верхняя граница fluidMl за один приём (оценка модели из дневника). */
  mealFluidMlPerMealMax: 4000,
  neckCm: { min: 20, max: 75 },
  waistCm: { min: 35, max: 200 },
  hipsCm: { min: 35, max: 200 },
} as const;
