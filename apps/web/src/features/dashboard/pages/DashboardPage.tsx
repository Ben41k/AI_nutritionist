import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiJson } from '@/shared/services/apiClient';
import { fetchMealsAllPagesForCalendarDay } from '@/shared/lib/fetchMealsAllPages';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import {
  activityMultiplier,
  bmi,
  bmiLabelRu,
  bmrMifflinStJeor,
  calorieTargetForAdherence,
  goalCompletionPercent,
  isDayAdherent,
  proteinGramsPerKg,
  targetMacrosFromTdee,
  tdeeFrom,
  whtr,
  type ActivityLevel,
  type NutritionGoal,
  type Sex,
} from '@/shared/lib/nutritionMetrics';
import { handleEnterSubmit } from '@/shared/lib/submitOnEnter';

type Profile = {
  id: string;
  updatedAt: string;
  age: number | null;
  sex: Sex;
  weightKg: number | null;
  heightCm: number | null;
  goal: NutritionGoal;
  activityLevel: ActivityLevel;
  allergies: string | null;
  preferences: string | null;
  targetWeightKg: number | null;
  startWeightKg: number | null;
  /** После миграции всегда есть; оставляем optional для старых ответов */
  waterGoalMl?: number;
};

type WeightEntry = { id: string; recordedAt: string; weightKg: number };
type Measurement = {
  id: string;
  recordedAt: string;
  neckCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
};

type Meal = { id: string; occurredAt: string; structuredEstimate: unknown };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sumMealCalories(meals: Meal[]): number {
  let sum = 0;
  for (const m of meals) {
    const raw = m.structuredEstimate;
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const v = o.caloriesKcal;
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
    else if (typeof v === 'string') {
      const n = Number(v.replace(',', '.'));
      if (Number.isFinite(n)) sum += n;
    }
  }
  return sum;
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const end = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function waterRangeQuery(from: string, to: string): string {
  const p = new URLSearchParams({ from, to });
  return `/tracking/water?${p.toString()}`;
}

const METRIC_EMPTY = 'не задано';

function formatDayLabel(iso: string): string {
  const tail = iso.slice(5);
  return tail.startsWith('0') ? tail.slice(1) : tail;
}

/** 14 суток: баланс цель − факт (ккал) для мини-графика */
function BalanceSparkline({
  days,
  targetKcal,
}: {
  days: { date: string; kcal: number }[];
  targetKcal: number;
}) {
  const balances = days.map((d) => (d.kcal > 0 ? targetKcal - d.kcal : null));
  const magnitudes = balances.map((b) => (b != null ? Math.abs(b) : 0));
  const maxAbs = Math.max(220, ...magnitudes, 1);
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">
        Баланс по дням (ккал)
      </p>
      <div className="flex h-16 gap-px sm:gap-0.5" role="img" aria-label="Столбцы баланса за 14 дней">
        {balances.map((bal, i) => {
          const d = days[i];
          const has = bal != null;
          const hPct = has ? Math.max(10, (Math.abs(bal) / maxAbs) * 100) : 8;
          const pos = has && bal >= 0;
          const title = has
            ? `${formatDayLabel(d.date)}: ${bal > 0 ? '+' : ''}${Math.round(bal)} ккал к цели`
            : `${formatDayLabel(d.date)}: нет данных`;
          return (
            <div
              key={d.date}
              title={title}
              className="group/bar flex min-h-0 min-w-0 flex-1 flex-col justify-end"
            >
              <div
                className={`w-full rounded-t transition-[filter] duration-150 group-hover/bar:brightness-110 ${
                  !has
                    ? 'bg-ink-muted/30'
                    : pos
                      ? 'bg-emerald-500/75 dark:bg-emerald-400/80'
                      : 'bg-amber-500/75 dark:bg-amber-400/80'
                }`}
                style={{ height: `${hPct}%`, minHeight: has ? 3 : 2 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">
        Зелёный столбик — ниже целевой нормы по ккал, янтарный — выше. Серый — день без записей в дневнике.
      </p>
    </div>
  );
}

function AdherenceSparkline({
  days,
  tdee,
  goal,
}: {
  days: { date: string; kcal: number }[];
  tdee: number;
  goal: NutritionGoal;
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">
        Приверженность по дням
      </p>
      <div className="flex h-3 gap-px sm:gap-0.5" role="img" aria-label="Полоса дней с данными о калориях">
        {days.map((d) => {
          const ok = d.kcal > 0 && isDayAdherent(d.kcal, tdee, goal);
          const title =
            d.kcal <= 0
              ? `${formatDayLabel(d.date)}: нет ккал`
              : `${formatDayLabel(d.date)}: ${ok ? 'в допуске' : 'вне допуска'}`;
          return (
            <div
              key={d.date}
              title={title}
              className={`min-w-0 flex-1 rounded-sm transition-transform hover:z-10 hover:scale-y-125 ${
                d.kcal <= 0 ? 'bg-ink-muted/20' : ok ? 'bg-emerald-500/80' : 'bg-rose-500/75'
              }`}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">
        Сегменты слева направо — от старого к новому дню. Наведите на полоску для подсказки.
      </p>
    </div>
  );
}

function WaterWeekSparkline({
  dates,
  dayTotals,
  goalMl,
}: {
  dates: string[];
  dayTotals: number[];
  goalMl: number;
}) {
  const maxH = Math.max(goalMl, ...dayTotals, 1);
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">
        Вода за 7 дней, мл
      </p>
      <div className="flex h-16 gap-1 sm:gap-1.5" role="img" aria-label="Столбцы воды за неделю">
        {dates.map((date, i) => {
          const ml = dayTotals[i] ?? 0;
          const hPct = Math.max(12, (ml / maxH) * 100);
          const met = goalMl > 0 && ml >= goalMl;
          return (
            <div
              key={date}
              title={`${formatDayLabel(date)}: ${ml} мл${met ? ' · норма достигнута' : ''}`}
              className="group/w flex min-h-0 min-w-0 flex-1 flex-col justify-end"
            >
              <div
                className={`w-full rounded-t ${
                  met ? 'bg-sky-500/80 dark:bg-sky-400/85' : 'bg-primary/55 dark:bg-primary/50'
                } transition-[filter] duration-150 group-hover/w:brightness-110`}
                style={{ height: `${hPct}%`, minHeight: 4 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">
        Высота столбца — доля от максимума среди недели и вашей нормы. Наведите на столбец для точного значения.
      </p>
    </div>
  );
}

function Metric({
  title,
  value,
  description,
  detail,
}: {
  title: string;
  value: string;
  description: string;
  detail?: ReactNode;
}) {
  return (
    <div
      className="group relative z-0 rounded-2xl border border-border/35 bg-surface/35 px-4 py-3.5 shadow-sm shadow-black/[0.03] ring-1 ring-black/[0.02] transition-[box-shadow,border-color,background-color,z-index] duration-200 hover:z-20 hover:border-border/50 hover:bg-surface/55 hover:shadow-md hover:shadow-black/[0.04] focus-within:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 dark:ring-white/[0.04]"
      tabIndex={0}
      role="group"
      aria-label={title}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted/80">{title}</div>
      <div className="mt-1.5 text-lg font-semibold tracking-tight text-ink-heading">{value}</div>
      {detail != null ? <div className="relative z-10">{detail}</div> : null}
      <p
        className="pointer-events-none invisible absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-border/40 bg-surface/95 px-3 py-2 text-[11px] leading-relaxed text-ink-muted/90 opacity-0 shadow-lg shadow-black/10 backdrop-blur-sm transition-[opacity,visibility] duration-200 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-active:pointer-events-auto group-active:visible group-active:opacity-100"
      >
        {description}
      </p>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-4 pb-2">
      <h2 className="text-base font-semibold text-ink-heading">{heading}</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

export function DashboardPage() {
  const qc = useQueryClient();
  const [weightInput, setWeightInput] = useState('');
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiJson<{ profile: Profile }>('/profile'),
  });

  const profile = profileData?.profile;

  const { data: weightData } = useQuery({
    queryKey: ['tracking', 'weight', '730d'],
    queryFn: () => {
      const to = new Date().toISOString();
      const from = new Date();
      from.setDate(from.getDate() - 730);
      const fromIso = from.toISOString();
      return apiJson<{ entries: WeightEntry[] }>(
        `/tracking/weight?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(to)}`,
      );
    },
    enabled: Boolean(profile),
  });

  const dates14 = lastNDates(14);
  const mealQueries = useQueries({
    queries: dates14.map((date) => ({
      queryKey: ['meals', date],
      queryFn: () => fetchMealsAllPagesForCalendarDay(date),
      enabled: Boolean(profile),
    })),
  });

  const dates7 = lastNDates(7);
  const waterFrom = dates7[0] ?? todayISO();
  const waterTo = dates7[dates7.length - 1] ?? todayISO();

  const { data: waterData } = useQuery({
    queryKey: ['tracking', 'water', waterFrom, waterTo],
    queryFn: () => apiJson<{ days: { date: string; totalMl: number }[] }>(waterRangeQuery(waterFrom, waterTo)),
    enabled: Boolean(profile),
  });

  const { data: measData } = useQuery({
    queryKey: ['tracking', 'measurements'],
    queryFn: () => apiJson<{ measurements: Measurement[] }>('/tracking/measurements'),
    enabled: Boolean(profile),
  });

  const addWeight = useMutation({
    mutationFn: (weightKg: number) =>
      apiJson<{ entry: WeightEntry }>('/tracking/weight', {
        method: 'POST',
        body: JSON.stringify({ weightKg }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking', 'weight'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      setWeightInput('');
    },
  });

  const addWater = useMutation({
    mutationFn: (addMl: number) =>
      apiJson<{ totalMl: number }>('/tracking/water', {
        method: 'POST',
        body: JSON.stringify({ date: todayISO(), addMl }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tracking', 'water'] }),
  });

  const addMeasurement = useMutation({
    mutationFn: (body: Record<string, number>) =>
      apiJson('/tracking/measurements', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking', 'measurements'] });
      setNeck('');
      setWaist('');
      setHips('');
    },
  });

  const entries = useMemo(() => weightData?.entries ?? [], [weightData]);
  const measurements = useMemo(() => measData?.measurements ?? [], [measData]);

  const latestWeight = useMemo(() => {
    if (entries.length === 0) return profile?.weightKg ?? null;
    const last = entries[entries.length - 1];
    return last.weightKg;
  }, [entries, profile?.weightKg]);

  /** Среднее за 7 суток до самой поздней записи; только Date.parse(entries) — без Date.now / new Date() в useMemo. */
  const weeklyAvg = useMemo(() => {
    if (entries.length === 0) return null;
    const times = entries.map((e) => Date.parse(e.recordedAt));
    const latestMs = Math.max(...times);
    if (!Number.isFinite(latestMs)) return null;
    const cutoffMs = latestMs - 7 * 86400000;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < entries.length; i++) {
      const t = times[i];
      if (Number.isFinite(t) && t >= cutoffMs) {
        sum += entries[i].weightKg;
        n += 1;
      }
    }
    if (n === 0) return null;
    return Math.round((sum / n) * 10) / 10;
  }, [entries]);

  const startWeight = useMemo(() => {
    if (profile?.startWeightKg != null) return profile.startWeightKg;
    if (entries.length === 0) return null;
    return entries[0].weightKg;
  }, [entries, profile?.startWeightKg]);

  const latestWaist = useMemo(() => {
    for (const m of measurements) {
      if (m.waistCm != null) return m.waistCm;
    }
    return null;
  }, [measurements]);

  const measDynamics = useMemo(() => {
    const sorted = [...measurements].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    );
    const cur = sorted[0];
    const prev = sorted[1];
    if (!cur || !prev) return null;
    const fmt = (field: 'neckCm' | 'waistCm' | 'hipsCm') => {
      const a = cur[field];
      const b = prev[field];
      if (a == null || b == null) return null;
      const d = Math.round((a - b) * 10) / 10;
      const sign = d > 0 ? '+' : '';
      return `${sign}${d} см`;
    };
    return { neck: fmt('neckCm'), waist: fmt('waistCm'), hips: fmt('hipsCm') };
  }, [measurements]);

  const dailyCalories = useMemo(() => {
    return dates14.map((date, i) => ({
      date,
      kcal: sumMealCalories(mealQueries[i]?.data?.meals ?? []),
    }));
  }, [dates14, mealQueries]);

  const analytics = useMemo(() => {
    if (!profile || profile.age == null || latestWeight == null || profile.heightCm == null) {
      return null;
    }
    const bmr = bmrMifflinStJeor({
      weightKg: latestWeight,
      heightCm: profile.heightCm,
      age: profile.age,
      sex: profile.sex,
    });
    const tdee = tdeeFrom(bmr, profile.activityLevel);
    const targetK = calorieTargetForAdherence(tdee, profile.goal);
    const withData = dailyCalories.filter((d) => d.kcal > 0);
    if (withData.length === 0) {
      return { tdee, avgBalance: null as number | null, adherence: null as number | null };
    }
    let balanceSum = 0;
    let adherent = 0;
    for (const d of withData) {
      balanceSum += targetK - d.kcal;
      if (isDayAdherent(d.kcal, tdee, profile.goal)) adherent += 1;
    }
    return {
      tdee,
      avgBalance: Math.round(balanceSum / withData.length),
      adherence: Math.round((adherent / withData.length) * 100),
    };
  }, [profile, latestWeight, dailyCalories]);

  const waterTodayMl = waterData?.days.find((d) => d.date === todayISO())?.totalMl ?? 0;

  const dates7Key = dates7.join(',');
  const waterWeekTotals = useMemo(() => {
    const parts = dates7Key.split(',');
    const byDate = new Map((waterData?.days ?? []).map((d) => [d.date, d.totalMl]));
    return parts.map((d) => byDate.get(d) ?? 0);
  }, [waterData?.days, dates7Key]);

  if (profileLoading) return <p className="text-ink-muted">Загрузка…</p>;
  if (!profile) return <p className="text-ink-muted">Профиль не найден</p>;

  const w = latestWeight ?? profile.weightKg;
  const h = profile.heightCm;
  const age = profile.age;

  const bmr =
    w != null && h != null && age != null
      ? Math.round(
          bmrMifflinStJeor({ weightKg: w, heightCm: h, age, sex: profile.sex }),
        )
      : null;
  const tdee =
    bmr != null ? Math.round(tdeeFrom(bmr, profile.activityLevel)) : null;
  const bmiVal = w != null && h != null ? bmi(w, h) : null;
  const whtrVal = latestWaist != null && h != null ? whtr(latestWaist, h) : null;
  const proteinPerKg = proteinGramsPerKg(profile.goal);
  const macros =
    tdee != null && w != null ? targetMacrosFromTdee(tdee, w, proteinPerKg) : null;

  const goalPct =
    w != null &&
    profile.targetWeightKg != null &&
    startWeight != null &&
    (profile.goal === 'WEIGHT_LOSS' || profile.goal === 'WEIGHT_GAIN')
      ? goalCompletionPercent({
          goal: profile.goal,
          currentWeight: w,
          startWeight,
          targetWeight: profile.targetWeightKg,
        })
      : null;

  const deltaKg =
    w != null && startWeight != null ? Math.round((w - startWeight) * 10) / 10 : null;

  const waterGoal = profile.waterGoalMl ?? 2000;
  const waterPct =
    waterGoal > 0 ? Math.min(100, Math.round((waterTodayMl / waterGoal) * 100)) : null;

  const tdeeForCharts = analytics?.tdee ?? null;
  const targetKcalForCharts =
    tdeeForCharts != null ? calorieTargetForAdherence(tdeeForCharts, profile.goal) : null;

  const weightSubmit = () => {
    const n = Number(weightInput.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    addWeight.mutate(n);
  };

  const measurementSubmit = () => {
    const body: Record<string, number> = {};
    const n = (s: string) => {
      const x = Number(s.replace(',', '.'));
      return Number.isFinite(x) ? x : NaN;
    };
    const nv = n(neck);
    const wv = n(waist);
    const hv = n(hips);
    if (Number.isFinite(nv)) body.neckCm = nv;
    if (Number.isFinite(wv)) body.waistCm = wv;
    if (Number.isFinite(hv)) body.hipsCm = hv;
    if (Object.keys(body).length === 0) return;
    addMeasurement.mutate(body);
  };

  const canSubmitMeasurement =
    !addMeasurement.isPending &&
    [neck, waist, hips].some((s) => {
      const x = Number(s.replace(',', '.'));
      return s.trim() !== '' && Number.isFinite(x);
    });

  return (
    <div className="mx-auto max-w-6xl space-y-12 sm:space-y-14">
      <Section heading="1. Основные расчётные показатели (калькулятор)">
        <Metric
          title="ИМТ"
          value={
            bmiVal != null
              ? `${bmiVal.toFixed(1)} · ${bmiLabelRu(bmiVal)}`
              : METRIC_EMPTY
          }
          description="Индекс массы тела: базовый маркер состояния веса."
        />
        <Metric
          title="BMR"
          value={bmr != null ? `${bmr} ккал/сут` : METRIC_EMPTY}
          description="Базальный метаболизм: минимальный расход энергии в покое (Миффлин — Сан Жеор)."
        />
        <Metric
          title="TDEE"
          value={
            tdee != null
              ? `${tdee} ккал/сут · ×${activityMultiplier(profile.activityLevel).toFixed(3)}`
              : METRIC_EMPTY
          }
          description="Суточный расход: норма калорий с учётом коэффициента активности."
        />
        <Metric
          title="WHtR"
          value={
            whtrVal != null
              ? `${whtrVal.toFixed(3)} (${whtrVal <= 0.5 ? 'в пределах ориентира до 0,5' : 'выше ориентира 0,5'})`
              : METRIC_EMPTY
          }
          description="Талия / рост: коэффициент распределения жировой ткани (норма до 0,5)."
        />
      </Section>

      <Section heading="2. Динамические показатели (трекинг)">
        <Metric
          title="Средненедельный вес"
          value={weeklyAvg != null ? `${weeklyAvg} кг` : METRIC_EMPTY}
          description="Среднее по записям за 7 суток до последнего замера (сглаживание скачков)."
        />
        <Metric
          title="Дельта веса"
          value={
            deltaKg != null
              ? `${deltaKg > 0 ? '+' : ''}${deltaKg} кг`
              : METRIC_EMPTY
          }
          description="Разница между стартовым и текущим весом."
        />
        <Metric
          title="Процент выполнения цели"
          value={
            goalPct != null
              ? `${goalPct}%`
              : METRIC_EMPTY
          }
          description="Насколько вы близки к желаемому результату."
        />
        <Metric
          title="Водный баланс"
          value={
            waterPct != null
              ? `${waterTodayMl} / ${waterGoal} мл (${waterPct}%)`
              : METRIC_EMPTY
          }
          description="Выпитая вода за сутки относительно нормы из профиля."
          detail={
            <WaterWeekSparkline dates={dates7} dayTotals={waterWeekTotals} goalMl={waterGoal} />
          }
        />
      </Section>

      <Section heading="3. Состав тела и макронутриенты">
        <Metric
          title="Целевое БЖУ"
          value={
            macros != null
              ? `Б ${macros.proteinG} г · Ж ${macros.fatG} г · У ${macros.carbsG} г`
              : METRIC_EMPTY
          }
          description="Суточная норма белков, жиров и углеводов (оценка от TDEE и белка г/кг)."
        />
        <Metric
          title="Норма белка на кг"
          value={`${proteinPerKg} г/кг`}
          description="Индивидуальная потребность в диапазоне 1,5–2,2 г/кг по выбранной цели."
        />
        <Metric
          title="Динамика объёмов (шея / талия / бёдра)"
          value={
            measDynamics
              ? [
                  measDynamics.neck ? `шея ${measDynamics.neck}` : null,
                  measDynamics.waist ? `талия ${measDynamics.waist}` : null,
                  measDynamics.hips ? `бёдра ${measDynamics.hips}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || METRIC_EMPTY
              : METRIC_EMPTY
          }
          description="Сравнение двух последних замеров с данными по каждому параметру."
        />
        <Metric
          title="Замеры"
          value={measurements.length ? `${measurements.length} в журнале` : METRIC_EMPTY}
          description="Добавляйте замеры ниже — для WHtR используется последняя талия."
        />
      </Section>

      <section className="space-y-4 pb-2">
        <h2 className="text-base font-semibold text-ink-heading">4. Статистика (аналитика)</h2>
        <p className="text-xs text-ink-muted">
          Период: последние 14 дней по локальным суткам.{' '}
          <Link className="font-medium text-primary underline" to="/meals">
            Дневник питания
          </Link>
        </p>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Metric
            title="Среднесуточный дефицит / профицит"
            value={
              analytics?.avgBalance != null
                ? `${analytics.avgBalance > 0 ? 'Дефицит' : analytics.avgBalance < 0 ? 'Профицит' : 'Баланс'} ${Math.abs(analytics.avgBalance)} ккал`
                : METRIC_EMPTY
            }
            description="Среднее по дням, где есть калории: целевые ккал по цели минус сумма за день."
            detail={
              targetKcalForCharts != null ? (
                <BalanceSparkline days={dailyCalories} targetKcal={targetKcalForCharts} />
              ) : null
            }
          />
          <Metric
            title="Индекс приверженности"
            value={
              analytics?.adherence != null ? `${analytics.adherence}%` : METRIC_EMPTY
            }
            description="Процент дней с данными по ккал, когда сумма укладывается в допуск ±12% (не менее ±200 ккал) от целевой нормы."
            detail={
              tdeeForCharts != null ? (
                <AdherenceSparkline days={dailyCalories} tdee={tdeeForCharts} goal={profile.goal} />
              ) : null
            }
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-ink-heading">Вес</h3>
          <p className="mb-3 text-xs text-ink-muted">
            Запись обновит текущий вес в{' '}
            <Link className="text-primary underline" to="/profile">
              профиле
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-[140px] rounded-md"
              type="number"
              step="0.1"
              placeholder="кг"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onKeyDown={(e) =>
                handleEnterSubmit(e, !addWeight.isPending && Boolean(weightInput.trim()), weightSubmit)
              }
            />
            <Button onClick={weightSubmit} disabled={addWeight.isPending || !weightInput.trim()}>
              {addWeight.isPending ? '…' : 'Сохранить'}
            </Button>
          </div>
          {addWeight.isError ? <p className="mt-2 text-xs text-red-600">Ошибка</p> : null}
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-ink-heading">Вода за сегодня</h3>
          <p className="mb-3 text-xs text-ink-muted">
            Норма: {waterGoal} мл (задаётся в профиле). Сейчас: {waterTodayMl} мл.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="pill" onClick={() => addWater.mutate(250)} disabled={addWater.isPending}>
              +250 мл
            </Button>
            <Button variant="pill" onClick={() => addWater.mutate(500)} disabled={addWater.isPending}>
              +500 мл
            </Button>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-ink-heading">Новый замер</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              className="rounded-md"
              type="number"
              step="0.1"
              placeholder="Шея, см"
              value={neck}
              onChange={(e) => setNeck(e.target.value)}
              onKeyDown={(e) =>
                handleEnterSubmit(e, canSubmitMeasurement, measurementSubmit)
              }
            />
            <Input
              className="rounded-md"
              type="number"
              step="0.1"
              placeholder="Талия, см"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              onKeyDown={(e) =>
                handleEnterSubmit(e, canSubmitMeasurement, measurementSubmit)
              }
            />
            <Input
              className="rounded-md"
              type="number"
              step="0.1"
              placeholder="Бёдра, см"
              value={hips}
              onChange={(e) => setHips(e.target.value)}
              onKeyDown={(e) =>
                handleEnterSubmit(e, canSubmitMeasurement, measurementSubmit)
              }
            />
          </div>
          <Button className="mt-3" onClick={measurementSubmit} disabled={addMeasurement.isPending}>
            Добавить замер
          </Button>
        </Card>
      </div>
    </div>
  );
}
