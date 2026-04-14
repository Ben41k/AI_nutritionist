export type Sex = 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHT'
  | 'MODERATE'
  | 'HIGH'
  | 'ATHLETE';
export type NutritionGoal = 'WEIGHT_LOSS' | 'WEIGHT_GAIN' | 'MAINTENANCE' | 'HEALTH';

export function activityMultiplier(level: ActivityLevel): number {
  const m: Record<ActivityLevel, number> = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    HIGH: 1.725,
    ATHLETE: 1.9,
  };
  return m[level];
}

/** BMR по формуле Миффлина — Сан Жеора, ккал/сутки */
export function bmrMifflinStJeor(p: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}): number {
  const { weightKg: w, heightCm: h, age: a, sex } = p;
  const base = 10 * w + 6.25 * h - 5 * a;
  if (sex === 'MALE') return base + 5;
  if (sex === 'FEMALE') return base - 161;
  return base - 78;
}

export function tdeeFrom(bmr: number, level: ActivityLevel): number {
  return bmr * activityMultiplier(level);
}

export function bmi(weightKg: number, heightCm: number): number | null {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Талия / рост (безразмерный коэффициент; ориентир здоровья до ~0,5) */
export function whtr(waistCm: number, heightCm: number): number | null {
  if (!(waistCm > 0) || !(heightCm > 0)) return null;
  return waistCm / heightCm;
}

/** Индивидуальная норма белка, г/кг (в диапазоне 1,5–2,2) */
export function proteinGramsPerKg(goal: NutritionGoal): number {
  switch (goal) {
    case 'WEIGHT_LOSS':
      return 2.0;
    case 'WEIGHT_GAIN':
      return 2.2;
    case 'HEALTH':
      return 1.8;
    case 'MAINTENANCE':
    default:
      return 1.6;
  }
}

export function calorieTargetForAdherence(tdee: number, goal: NutritionGoal): number {
  switch (goal) {
    case 'WEIGHT_LOSS':
      return tdee * 0.82;
    case 'WEIGHT_GAIN':
      return tdee * 1.12;
    default:
      return tdee;
  }
}

export function targetMacrosFromTdee(
  tdee: number,
  weightKg: number,
  proteinPerKg: number,
): { proteinG: number; fatG: number; carbsG: number } {
  const proteinG = Math.round(proteinPerKg * weightKg * 10) / 10;
  const proteinKcal = proteinG * 4;
  const fatKcal = tdee * 0.28;
  const fatG = Math.round((fatKcal / 9) * 10) / 10;
  const carbKcal = Math.max(0, tdee - proteinKcal - fatKcal);
  const carbsG = Math.round((carbKcal / 4) * 10) / 10;
  return { proteinG, fatG, carbsG };
}

export function goalCompletionPercent(p: {
  goal: NutritionGoal;
  currentWeight: number;
  startWeight: number;
  targetWeight: number;
}): number | null {
  const { goal, currentWeight: c, startWeight: s, targetWeight: t } = p;
  if (!(c > 0) || !(s > 0) || !(t > 0)) return null;
  if (goal === 'WEIGHT_LOSS') {
    if (s <= t) return null;
    const raw = ((s - c) / (s - t)) * 100;
    return Math.min(100, Math.max(0, Math.round(raw)));
  }
  if (goal === 'WEIGHT_GAIN') {
    if (t <= s) return null;
    const raw = ((c - s) / (t - s)) * 100;
    return Math.min(100, Math.max(0, Math.round(raw)));
  }
  return null;
}

export function isDayAdherent(
  consumedKcal: number,
  tdee: number,
  goal: NutritionGoal,
): boolean {
  if (!(consumedKcal > 0)) return false;
  const target = calorieTargetForAdherence(tdee, goal);
  const band = Math.max(200, target * 0.12);
  return Math.abs(consumedKcal - target) <= band;
}

export function bmiLabelRu(bmiValue: number): string {
  if (bmiValue < 18.5) return 'недостаточная масса';
  if (bmiValue < 25) return 'норма';
  if (bmiValue < 30) return 'избыточная масса';
  return 'ожирение';
}
