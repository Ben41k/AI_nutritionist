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
import { USER_INPUT, clamp, inRange, parseFiniteNumber } from '@/shared/lib/userInputBounds';

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

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Последнее значение веса за локальные сутки; дни без записей не добавляют ключ. */
function weightLastByLocalDay(entries: WeightEntry[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const m = new Map<string, number>();
  for (const e of sorted) {
    m.set(localDateISO(new Date(e.recordedAt)), e.weightKg);
  }
  return m;
}

function forwardFillFromDayMap(dates: string[], byDay: Map<string, number>, seed: number | null): (number | null)[] {
  let last = seed;
  return dates.map((dt) => {
    if (byDay.has(dt)) last = byDay.get(dt)!;
    return last;
  });
}

function forwardFillMeasurementField(
  measurements: Measurement[],
  dates: string[],
  field: 'neckCm' | 'waistCm' | 'hipsCm',
): (number | null)[] {
  const sorted = [...measurements].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const byDay = new Map<string, number>();
  for (const m of sorted) {
    const v = m[field];
    if (v != null) byDay.set(localDateISO(new Date(m.recordedAt)), v);
  }
  let last: number | null = null;
  return dates.map((dt) => {
    if (byDay.has(dt)) last = byDay.get(dt)!;
    return last;
  });
}

function measurementAddsPerDay(measurements: Measurement[], dates: string[]): number[] {
  const idx = new Map(dates.map((d, i) => [d, i]));
  const counts = dates.map(() => 0);
  for (const m of measurements) {
    const k = localDateISO(new Date(m.recordedAt));
    const i = idx.get(k);
    if (i != null) counts[i] += 1;
  }
  return counts;
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

function BmiTrendSparkline({ dates, bmis }: { dates: string[]; bmis: (number | null)[] }) {
  const finite = bmis.filter((v): v is number => v != null && Number.isFinite(v));
  const maxH = Math.max(32, ...finite, 1);
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">
        ИМТ за 14 дней
      </p>
      <div className="flex h-16 gap-px sm:gap-0.5" role="img" aria-label="Динамика ИМТ по дням">
        {dates.map((date, i) => {
          const v = bmis[i] ?? null;
          const hPct = v != null ? Math.max(14, (v / maxH) * 100) : 10;
          const title =
            v != null
              ? `${formatDayLabel(date)}: ${v.toFixed(1)}`
              : `${formatDayLabel(date)}: нет веса для дня`;
          const cls =
            v == null
              ? 'bg-ink-muted/30'
              : v < 18.5
                ? 'bg-sky-500/75 dark:bg-sky-400/80'
                : v < 25
                  ? 'bg-emerald-500/75 dark:bg-emerald-400/80'
                  : v < 30
                    ? 'bg-amber-500/75 dark:bg-amber-400/80'
                    : 'bg-rose-500/75 dark:bg-rose-400/80';
          return (
            <div key={date} title={title} className="group/b flex min-h-0 min-w-0 flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t transition-[filter] duration-150 group-hover/b:brightness-110 ${cls}`}
                style={{ height: `${hPct}%`, minHeight: v != null ? 4 : 2 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">
        Цвет по зонам ИМТ. Серый — нет данных веса на этот день (переносится последний известный вес после первой
        записи).
      </p>
    </div>
  );
}

function KcalTrendSparkline({
  dates,
  values,
  title,
  caption,
  barClass,
  formatTitle,
}: {
  dates: string[];
  values: (number | null)[];
  title: string;
  caption: string;
  barClass: (v: number | null) => string;
  formatTitle: (date: string, v: number | null) => string;
}) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const maxH = Math.max(1, ...finite.map((x) => Math.abs(x)));
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">{title}</p>
      <div className="flex h-16 gap-px sm:gap-0.5" role="img" aria-label={title}>
        {dates.map((date, i) => {
          const v = values[i] ?? null;
          const hPct = v != null ? Math.max(12, (Math.abs(v) / maxH) * 100) : 9;
          return (
            <div key={date} title={formatTitle(date, v)} className="group/k flex min-h-0 min-w-0 flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t transition-[filter] duration-150 group-hover/k:brightness-110 ${barClass(v)}`}
                style={{ height: `${hPct}%`, minHeight: v != null ? 4 : 2 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">{caption}</p>
    </div>
  );
}

function WeightKgSparkline({ dates, kgs }: { dates: string[]; kgs: (number | null)[] }) {
  const finite = kgs.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length === 0) {
    return (
      <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">Вес по дням, кг</p>
        <p className="text-[10px] text-ink-muted/85">Нет данных веса за период.</p>
      </div>
    );
  }
  const minW = Math.min(...finite);
  const maxW = Math.max(...finite);
  const span = Math.max(0.5, maxW - minW);
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">Вес по дням, кг</p>
      <div className="flex h-16 gap-1 sm:gap-1.5" role="img" aria-label="Вес за несколько дней">
        {dates.map((date, i) => {
          const kg = kgs[i] ?? null;
          const hPct =
            kg != null ? Math.max(14, ((kg - minW) / span) * 100) : 10;
          const title =
            kg != null
              ? `${formatDayLabel(date)}: ${kg.toFixed(1)} кг`
              : `${formatDayLabel(date)}: нет данных`;
          return (
            <div key={date} title={title} className="group/wk flex min-h-0 min-w-0 flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t bg-primary/55 transition-[filter] duration-150 group-hover/wk:brightness-110 dark:bg-primary/50 ${
                  kg == null ? '!bg-ink-muted/30' : ''
                }`}
                style={{ height: `${hPct}%`, minHeight: kg != null ? 4 : 2 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">
        Высота относительно минимума и максимума на графике. Наведите на столбец для значения.
      </p>
    </div>
  );
}

function GoalPercentSparkline({ dates, pcts }: { dates: string[]; pcts: (number | null)[] }) {
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">
        Выполнение цели по весу, %
      </p>
      <div className="flex h-16 gap-px sm:gap-0.5" role="img" aria-label="Процент цели по дням">
        {dates.map((date, i) => {
          const p = pcts[i] ?? null;
          const hPct = p != null ? Math.max(12, p) : 9;
          const title =
            p != null
              ? `${formatDayLabel(date)}: ${p}%`
              : `${formatDayLabel(date)}: нет данных для цели`;
          return (
            <div key={date} title={title} className="group/g flex min-h-0 min-w-0 flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t transition-[filter] duration-150 group-hover/g:brightness-110 ${
                  p == null ? 'bg-ink-muted/30' : p >= 100 ? 'bg-emerald-500/80' : 'bg-primary/55 dark:bg-primary/50'
                }`}
                style={{ height: `${hPct}%`, minHeight: p != null ? 4 : 2 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">100% — достигнут целевой вес по выбранной цели снижения/набора.</p>
    </div>
  );
}

function MacroRowsSparkline({
  dates,
  protein,
  fat,
  carbs,
}: {
  dates: string[];
  protein: (number | null)[];
  fat: (number | null)[];
  carbs: (number | null)[];
}) {
  const macroRow = (label: string, vals: (number | null)[], barBg: string) => {
    const finite = vals.filter((v): v is number => v != null && Number.isFinite(v));
    const maxH = Math.max(1, ...finite);
    return (
      <div key={label}>
        <div className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted/70">{label}</div>
        <div className="flex h-5 gap-px sm:gap-0.5">
          {dates.map((date, i) => {
            const v = vals[i] ?? null;
            const hPct = v != null ? Math.max(18, (v / maxH) * 100) : 12;
            const title = v != null ? `${formatDayLabel(date)}: ${v} г` : `${formatDayLabel(date)}: —`;
            return (
              <div key={`${label}-${date}`} title={title} className="flex min-w-0 flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-sm transition-[filter] duration-150 hover:brightness-110 ${
                    v == null ? 'bg-ink-muted/25' : barBg
                  }`}
                  style={{ height: `${hPct}%`, minHeight: v != null ? 3 : 2 }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">
        Суточные нормы БЖУ по дням (г)
      </p>
      <div className="space-y-1.5">
        {macroRow('Белки', protein, 'bg-violet-500/75 dark:bg-violet-400/80')}
        {macroRow('Жиры', fat, 'bg-amber-500/70 dark:bg-amber-400/75')}
        {macroRow('Углеводы', carbs, 'bg-teal-500/75 dark:bg-teal-400/80')}
      </div>
      <p className="text-[10px] text-ink-muted/85">
        Пересчёт от TDEE и веса на каждый день (последний известный вес). Три ряда — белки, жиры, углеводы.
      </p>
    </div>
  );
}

function WhtrTrendSparkline({ dates, values }: { dates: string[]; values: (number | null)[] }) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const maxH = Math.max(0.52, ...finite, 0.001);
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">WHtR за 14 дней</p>
      <div className="flex h-16 gap-px sm:gap-0.5" role="img" aria-label="Динамика WHtR по дням">
        {dates.map((date, i) => {
          const v = values[i] ?? null;
          const hPct = v != null ? Math.max(14, (v / maxH) * 100) : 10;
          const title =
            v != null
              ? `${formatDayLabel(date)}: ${v.toFixed(3)}`
              : `${formatDayLabel(date)}: нет талии в замерах`;
          const cls =
            v == null
              ? 'bg-ink-muted/30'
              : v <= 0.5
                ? 'bg-emerald-500/75 dark:bg-emerald-400/80'
                : 'bg-amber-500/75 dark:bg-amber-400/80';
          return (
            <div key={date} title={title} className="group/h flex min-h-0 min-w-0 flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t transition-[filter] duration-150 group-hover/h:brightness-110 ${cls}`}
                style={{ height: `${hPct}%`, minHeight: v != null ? 4 : 2 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">
        Зелёный — не выше ориентира 0,5, янтарный — выше. Серый — нет данных талии на день.
      </p>
    </div>
  );
}

function BodyVolumesSparkline({
  dates,
  neck,
  waist,
  hips,
}: {
  dates: string[];
  neck: (number | null)[];
  waist: (number | null)[];
  hips: (number | null)[];
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">Объёмы за 14 дней, см</p>
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="w-full min-w-0">
          <CircumferenceRowSparkline
            dates={dates}
            values={neck}
            label="Шея"
            colorClass="bg-violet-500/75 dark:bg-violet-400/80"
          />
        </div>
        <div className="w-full min-w-0">
          <CircumferenceRowSparkline
            dates={dates}
            values={waist}
            label="Талия"
            colorClass="bg-sky-500/75 dark:bg-sky-400/80"
          />
        </div>
        <div className="w-full min-w-0">
          <CircumferenceRowSparkline
            dates={dates}
            values={hips}
            label="Бёдра"
            colorClass="bg-teal-500/75 dark:bg-teal-400/80"
          />
        </div>
      </div>
      <p className="text-[10px] text-ink-muted/85">
        На каждый день — последний замер; если в этот день не вносили данные, значение переносится с предыдущего дня.
      </p>
    </div>
  );
}

function CircumferenceRowSparkline({
  dates,
  values,
  label,
  colorClass,
}: {
  dates: string[];
  values: (number | null)[];
  label: string;
  colorClass: string;
}) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const maxH = Math.max(1, ...finite);
  const minH = finite.length ? Math.min(...finite) : 0;
  const span = Math.max(1, maxH - minH);
  return (
    <div className="block w-full min-w-0">
      <div className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted/70">{label}</div>
      <div className="flex h-6 w-full min-w-0 gap-px sm:gap-0.5">
        {dates.map((date, i) => {
          const v = values[i] ?? null;
          const hPct = v != null ? Math.max(20, ((v - minH) / span) * 100) : 14;
          const title = v != null ? `${formatDayLabel(date)}: ${v} см` : `${formatDayLabel(date)}: нет замера`;
          return (
            <div key={`${label}-${date}`} title={title} className="group/c flex min-w-0 flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-sm transition-[filter] duration-150 group-hover/c:brightness-110 ${
                  v == null ? 'bg-ink-muted/25' : colorClass
                }`}
                style={{ height: `${hPct}%`, minHeight: v != null ? 3 : 2 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeasurementsActivitySparkline({ dates, counts }: { dates: string[]; counts: number[] }) {
  const maxC = Math.max(1, ...counts);
  return (
    <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted/75">
        Новые замеры за 14 дней
      </p>
      <div className="flex h-14 gap-px sm:gap-0.5" role="img" aria-label="Количество замеров по дням">
        {dates.map((date, i) => {
          const c = counts[i] ?? 0;
          const hPct = c > 0 ? Math.max(28, (c / maxC) * 100) : 10;
          const title = `${formatDayLabel(date)}: ${c} шт.`;
          return (
            <div key={date} title={title} className="group/m flex min-h-0 min-w-0 flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t transition-[filter] duration-150 group-hover/m:brightness-110 ${
                  c > 0 ? 'bg-indigo-500/75 dark:bg-indigo-400/80' : 'bg-ink-muted/20'
                }`}
                style={{ height: `${hPct}%`, minHeight: c > 0 ? 4 : 2 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ink-muted/85">Столбец — сколько записей замеров добавлено в этот день.</p>
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
  value: ReactNode;
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
  const [weightInputErr, setWeightInputErr] = useState<string | null>(null);
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [measurementErr, setMeasurementErr] = useState<string | null>(null);
  const [waterAdjustErr, setWaterAdjustErr] = useState<string | null>(null);

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

  const adjustWater = useMutation({
    mutationFn: (addMl: number) =>
      apiJson<{ totalMl: number }>('/tracking/water', {
        method: 'POST',
        body: JSON.stringify({ date: todayISO(), addMl }),
      }),
    onSuccess: () => {
      setWaterAdjustErr(null);
      void qc.invalidateQueries({ queryKey: ['tracking', 'water'] });
    },
    onError: () => {
      setWaterAdjustErr('Не удалось сохранить воду');
    },
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

  const profileStartWeightKg = profile?.startWeightKg ?? null;

  const startWeight = useMemo(() => {
    if (profileStartWeightKg != null) return profileStartWeightKg;
    if (entries.length === 0) return null;
    return entries[0].weightKg;
  }, [entries, profileStartWeightKg]);

  const weightDayMap = useMemo(() => weightLastByLocalDay(entries), [entries]);

  const weightsForward14 = useMemo(
    () => forwardFillFromDayMap(dates14, weightDayMap, profile?.weightKg ?? null),
    [dates14, weightDayMap, profile?.weightKg],
  );

  const weightsForward7 = useMemo(
    () => forwardFillFromDayMap(dates7, weightDayMap, profile?.weightKg ?? null),
    [dates7, weightDayMap, profile?.weightKg],
  );

  const bmiSeries14 = useMemo(() => {
    const hCm = profile?.heightCm;
    if (hCm == null) return dates14.map(() => null);
    return weightsForward14.map((w) => (w != null && w > 0 ? bmi(w, hCm) : null));
  }, [weightsForward14, profile?.heightCm, dates14]);

  const bmrSeries14 = useMemo(() => {
    if (!profile) return dates14.map(() => null);
    const age = profile.age;
    const heightCm = profile.heightCm;
    if (age == null || heightCm == null) {
      return dates14.map(() => null);
    }
    const sex = profile.sex;
    return weightsForward14.map((w) =>
      w != null && w > 0
        ? bmrMifflinStJeor({
            weightKg: w,
            heightCm,
            age,
            sex,
          })
        : null,
    );
  }, [profile, weightsForward14, dates14]);

  const tdeeSeries14 = useMemo(() => {
    if (!profile) return dates14.map(() => null);
    const age = profile.age;
    const heightCm = profile.heightCm;
    if (age == null || heightCm == null) {
      return dates14.map(() => null);
    }
    const sex = profile.sex;
    const activityLevel = profile.activityLevel;
    return weightsForward14.map((w) => {
      if (w == null || !(w > 0)) return null;
      const b = bmrMifflinStJeor({
        weightKg: w,
        heightCm,
        age,
        sex,
      });
      return tdeeFrom(b, activityLevel);
    });
  }, [profile, weightsForward14, dates14]);

  const whtrSeries14 = useMemo(() => {
    const hCm = profile?.heightCm;
    if (hCm == null) return dates14.map(() => null);
    const waistF = forwardFillMeasurementField(measurements, dates14, 'waistCm');
    return waistF.map((waist) => (waist != null ? whtr(waist, hCm) : null));
  }, [measurements, dates14, profile?.heightCm]);

  const deltaSeries14 = useMemo(() => {
    if (startWeight == null) return dates14.map(() => null);
    return weightsForward14.map((w) =>
      w != null ? Math.round((w - startWeight) * 10) / 10 : null,
    );
  }, [weightsForward14, startWeight, dates14]);

  const goalPctSeries14 = useMemo(() => {
    if (!profile || startWeight == null) {
      return dates14.map(() => null);
    }
    const targetWeight = profile.targetWeightKg;
    const goal = profile.goal;
    if (
      targetWeight == null ||
      (goal !== 'WEIGHT_LOSS' && goal !== 'WEIGHT_GAIN')
    ) {
      return dates14.map(() => null);
    }
    return weightsForward14.map((w) =>
      w != null
        ? goalCompletionPercent({
            goal,
            currentWeight: w,
            startWeight,
            targetWeight,
          })
        : null,
    );
  }, [profile, weightsForward14, startWeight, dates14]);

  const macroSeries14 = useMemo(() => {
    if (!profile) {
      return {
        protein: dates14.map(() => null),
        fat: dates14.map(() => null),
        carbs: dates14.map(() => null),
      };
    }
    const age = profile.age;
    const heightCm = profile.heightCm;
    if (age == null || heightCm == null) {
      return {
        protein: dates14.map(() => null),
        fat: dates14.map(() => null),
        carbs: dates14.map(() => null),
      };
    }
    const sex = profile.sex;
    const activityLevel = profile.activityLevel;
    const pK = proteinGramsPerKg(profile.goal);
    const protein: (number | null)[] = [];
    const fat: (number | null)[] = [];
    const carbs: (number | null)[] = [];
    for (let i = 0; i < dates14.length; i++) {
      const w = weightsForward14[i];
      if (w == null || !(w > 0)) {
        protein.push(null);
        fat.push(null);
        carbs.push(null);
        continue;
      }
      const b = bmrMifflinStJeor({
        weightKg: w,
        heightCm,
        age,
        sex,
      });
      const td = tdeeFrom(b, activityLevel);
      const m = targetMacrosFromTdee(td, w, pK);
      protein.push(m.proteinG);
      fat.push(m.fatG);
      carbs.push(m.carbsG);
    }
    return { protein, fat, carbs };
  }, [profile, weightsForward14, dates14]);

  const measCountByDay14 = useMemo(
    () => measurementAddsPerDay(measurements, dates14),
    [measurements, dates14],
  );

  const neckSeries14 = useMemo(
    () => forwardFillMeasurementField(measurements, dates14, 'neckCm'),
    [measurements, dates14],
  );
  const waistSeries14 = useMemo(
    () => forwardFillMeasurementField(measurements, dates14, 'waistCm'),
    [measurements, dates14],
  );
  const hipsSeries14 = useMemo(
    () => forwardFillMeasurementField(measurements, dates14, 'hipsCm'),
    [measurements, dates14],
  );

  /** Последняя по времени талия среди записей, где она указана (не порядок элементов в ответе API). */
  const latestWaist = useMemo(() => {
    let bestT = -Infinity;
    let bestV: number | null = null;
    for (const m of measurements) {
      if (m.waistCm == null) continue;
      const t = Date.parse(m.recordedAt);
      if (!Number.isFinite(t)) continue;
      if (t >= bestT) {
        bestT = t;
        bestV = m.waistCm;
      }
    }
    return bestV;
  }, [measurements]);

  /**
   * Для каждого параметра — разница между двумя последними замерами, где это поле заполнено
   * (раньше сравнивались только два последних ряда целиком, из‑за чего при «шея в одной записи,
   * талия в другой» всё становилось «не задано»).
   */
  const measDynamics = useMemo(() => {
    if (measurements.length === 0) return null;
    const sorted = [...measurements].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    );
    const fmt = (field: 'neckCm' | 'waistCm' | 'hipsCm') => {
      const withVal = sorted.filter((m) => m[field] != null);
      if (withVal.length < 2) return null;
      const cur = withVal[0]![field]!;
      const prev = withVal[1]![field]!;
      const d = Math.round((cur - prev) * 10) / 10;
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

  const waterTodayRaw = waterData?.days.find((d) => d.date === todayISO())?.totalMl ?? 0;
  const waterTodayMl = clamp(waterTodayRaw, 0, USER_INPUT.waterDailyRecordedMaxMl);

  const dates7Key = dates7.join(',');
  const waterWeekTotals = useMemo(() => {
    const parts = dates7Key.split(',');
    const byDate = new Map((waterData?.days ?? []).map((d) => [d.date, d.totalMl]));
    const cap = USER_INPUT.waterDailyRecordedMaxMl;
    return parts.map((d) => clamp(byDate.get(d) ?? 0, 0, cap));
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

  const waterDailyCap = USER_INPUT.waterDailyRecordedMaxMl;
  const atWaterDailyCap = waterTodayRaw >= waterDailyCap;
  const atWaterZero = waterTodayRaw <= 0;

  const applyWaterDelta = (delta: number) => {
    setWaterAdjustErr(null);
    const abs = Math.abs(delta);
    if (delta === 0 || abs < USER_INPUT.waterAddMl.min || abs > USER_INPUT.waterAddMl.max) return;
    if (delta > 0 && waterTodayRaw >= waterDailyCap) {
      setWaterAdjustErr('За сутки в учёте не больше 5 л.');
      return;
    }
    if (delta < 0 && waterTodayRaw <= 0) return;
    adjustWater.mutate(delta);
  };

  const tdeeForCharts = analytics?.tdee ?? null;
  const targetKcalForCharts =
    tdeeForCharts != null ? calorieTargetForAdherence(tdeeForCharts, profile.goal) : null;

  const weightSubmit = () => {
    setWeightInputErr(null);
    const n = parseFiniteNumber(weightInput);
    if (n === null) {
      setWeightInputErr('Введите число');
      return;
    }
    if (!inRange(n, USER_INPUT.weightKg.min, USER_INPUT.weightKg.max)) {
      setWeightInputErr(
        `Допустимо от ${USER_INPUT.weightKg.min} до ${USER_INPUT.weightKg.max} кг`,
      );
      return;
    }
    addWeight.mutate(n);
  };

  const measurementSubmit = () => {
    setMeasurementErr(null);
    const body: Record<string, number> = {};
    const push = (
      raw: string,
      key: 'neckCm' | 'waistCm' | 'hipsCm',
      label: string,
      min: number,
      max: number,
    ): boolean => {
      const t = raw.trim();
      if (!t) return true;
      const v = parseFiniteNumber(t);
      if (v === null) {
        setMeasurementErr(`${label}: введите число`);
        return false;
      }
      if (!inRange(v, min, max)) {
        setMeasurementErr(`${label}: допустимо ${min}–${max} см`);
        return false;
      }
      body[key] = v;
      return true;
    };
    if (!push(neck, 'neckCm', 'Шея', USER_INPUT.neckCm.min, USER_INPUT.neckCm.max)) return;
    if (!push(waist, 'waistCm', 'Талия', USER_INPUT.waistCm.min, USER_INPUT.waistCm.max)) return;
    if (!push(hips, 'hipsCm', 'Бёдра', USER_INPUT.hipsCm.min, USER_INPUT.hipsCm.max)) return;
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
          detail={<BmiTrendSparkline dates={dates14} bmis={bmiSeries14} />}
        />
        <Metric
          title="BMR"
          value={bmr != null ? `${bmr} ккал/сут` : METRIC_EMPTY}
          description="Базальный метаболизм: минимальный расход энергии в покое (Миффлин — Сан Жеор)."
          detail={
            <KcalTrendSparkline
              dates={dates14}
              values={bmrSeries14}
              title="BMR за 14 дней, ккал/сут"
              caption="По последнему известному весу на конец каждого дня."
              barClass={(v) => (v == null ? 'bg-ink-muted/30' : 'bg-primary/55 dark:bg-primary/50')}
              formatTitle={(date, v) =>
                v != null
                  ? `${formatDayLabel(date)}: ${Math.round(v)} ккал/сут`
                  : `${formatDayLabel(date)}: нет данных`
              }
            />
          }
        />
        <Metric
          title="TDEE"
          value={
            tdee != null
              ? `${tdee} ккал/сут · ×${activityMultiplier(profile.activityLevel).toFixed(3)}`
              : METRIC_EMPTY
          }
          description="Суточный расход: норма калорий с учётом коэффициента активности."
          detail={
            <KcalTrendSparkline
              dates={dates14}
              values={tdeeSeries14}
              title="TDEE за 14 дней, ккал/сут"
              caption="Тот же расчёт BMR с вашим коэффициентом активности на каждый день."
              barClass={(v) => (v == null ? 'bg-ink-muted/30' : 'bg-primary/60 dark:bg-primary/55')}
              formatTitle={(date, v) =>
                v != null
                  ? `${formatDayLabel(date)}: ${Math.round(v)} ккал/сут`
                  : `${formatDayLabel(date)}: нет данных`
              }
            />
          }
        />
        <Metric
          title="WHtR"
          value={
            whtrVal != null
              ? `${whtrVal.toFixed(3)} (${whtrVal <= 0.5 ? 'в пределах ориентира до 0,5' : 'выше ориентира 0,5'})`
              : METRIC_EMPTY
          }
          description="Талия / рост из профиля: нужны рост в профиле и талия в замерах (норма до 0,5)."
          detail={<WhtrTrendSparkline dates={dates14} values={whtrSeries14} />}
        />
      </Section>

      <Section heading="2. Динамические показатели (трекинг)">
        <Metric
          title="Средненедельный вес"
          value={weeklyAvg != null ? `${weeklyAvg} кг` : METRIC_EMPTY}
          description="Среднее по записям за 7 суток до последнего замера (сглаживание скачков)."
          detail={<WeightKgSparkline dates={dates7} kgs={weightsForward7} />}
        />
        <Metric
          title="Дельта веса"
          value={
            deltaKg != null
              ? `${deltaKg > 0 ? '+' : ''}${deltaKg} кг`
              : METRIC_EMPTY
          }
          description="Разница между стартовым и текущим весом."
          detail={
            <KcalTrendSparkline
              dates={dates14}
              values={deltaSeries14}
              title="Отклонение от стартового веса, кг"
              caption="Янтарный — выше старта, изумрудный — ниже. Высота — по модулю отклонения."
              barClass={(v) =>
                v == null
                  ? 'bg-ink-muted/30'
                  : v > 0
                    ? 'bg-amber-500/75 dark:bg-amber-400/80'
                    : v < 0
                      ? 'bg-emerald-500/75 dark:bg-emerald-400/80'
                      : 'bg-ink-muted/40'
              }
              formatTitle={(date, v) =>
                v != null
                  ? `${formatDayLabel(date)}: ${v > 0 ? '+' : ''}${v} кг`
                  : `${formatDayLabel(date)}: нет данных`
              }
            />
          }
        />
        <Metric
          title="Процент выполнения цели"
          value={
            goalPct != null
              ? `${goalPct}%`
              : METRIC_EMPTY
          }
          description="Насколько вы близки к желаемому результату."
          detail={<GoalPercentSparkline dates={dates14} pcts={goalPctSeries14} />}
        />
        <Metric
          title="Водный баланс"
          value={
            waterPct != null
              ? `${waterTodayMl} / ${waterGoal} мл (${waterPct}%)`
              : METRIC_EMPTY
          }
          description="Выпитая вода за сутки относительно нормы из профиля; в учёте не более 5 л за сутки."
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
          detail={
            <MacroRowsSparkline
              dates={dates14}
              protein={macroSeries14.protein}
              fat={macroSeries14.fat}
              carbs={macroSeries14.carbs}
            />
          }
        />
        <Metric
          title="Норма белка на кг"
          value={`${proteinPerKg} г/кг`}
          description="Индивидуальная потребность в диапазоне 1,5–2,2 г/кг по выбранной цели."
          detail={
            <KcalTrendSparkline
              dates={dates14}
              values={macroSeries14.protein}
              title="Суточный белок по дням, г"
              caption="Граммы в сутки при вашей цели г/кг — меняются вместе с весом на графике."
              barClass={(v) => (v == null ? 'bg-ink-muted/30' : 'bg-violet-500/75 dark:bg-violet-400/80')}
              formatTitle={(date, v) =>
                v != null
                  ? `${formatDayLabel(date)}: ${v} г`
                  : `${formatDayLabel(date)}: нет данных`
              }
            />
          }
        />
        <Metric
          title="Динамика объёмов (шея / талия / бёдра)"
          value={
            measDynamics ? (
              [measDynamics.neck, measDynamics.waist, measDynamics.hips].every((s) => !s) ? (
                METRIC_EMPTY
              ) : (
                <div className="space-y-0.5 leading-snug">
                  {measDynamics.neck ? <div>шея {measDynamics.neck}</div> : null}
                  {measDynamics.waist ? <div>талия {measDynamics.waist}</div> : null}
                  {measDynamics.hips ? <div>бёдра {measDynamics.hips}</div> : null}
                </div>
              )
            ) : (
              METRIC_EMPTY
            )
          }
          description="По двум последним записям, где заполнен соответствующий параметр (шея, талия или бёдра)."
          detail={
            <BodyVolumesSparkline
              dates={dates14}
              neck={neckSeries14}
              waist={waistSeries14}
              hips={hipsSeries14}
            />
          }
        />
        <Metric
          title="Замеры"
          value={measurements.length ? `${measurements.length} в журнале` : METRIC_EMPTY}
          description="Добавляйте замеры ниже — для WHtR используется последняя талия."
          detail={<MeasurementsActivitySparkline dates={dates14} counts={measCountByDay14} />}
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
              min={USER_INPUT.weightKg.min}
              max={USER_INPUT.weightKg.max}
              step="0.1"
              placeholder="кг"
              value={weightInput}
              onChange={(e) => {
                setWeightInputErr(null);
                setWeightInput(e.target.value);
              }}
              onKeyDown={(e) =>
                handleEnterSubmit(e, !addWeight.isPending && Boolean(weightInput.trim()), weightSubmit)
              }
            />
            <Button onClick={weightSubmit} disabled={addWeight.isPending || !weightInput.trim()}>
              {addWeight.isPending ? '…' : 'Сохранить'}
            </Button>
          </div>
          {weightInputErr ? <p className="mt-2 text-xs text-red-600">{weightInputErr}</p> : null}
          {addWeight.isError ? <p className="mt-2 text-xs text-red-600">Ошибка</p> : null}
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-ink-heading">Вода за сегодня</h3>
          <p className="mb-3 text-xs text-ink-muted">
            Норма: {waterGoal} мл (задаётся в профиле). Сейчас: {waterTodayMl} мл (в учёте максимум{' '}
            {waterDailyCap / 1000} л за сутки).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="pill"
              type="button"
              onClick={() => applyWaterDelta(250)}
              disabled={adjustWater.isPending || atWaterDailyCap}
            >
              +250 мл
            </Button>
            <Button
              variant="pill"
              type="button"
              onClick={() => applyWaterDelta(500)}
              disabled={adjustWater.isPending || atWaterDailyCap}
            >
              +500 мл
            </Button>
            <Button
              variant="pill"
              type="button"
              className="border-border/80"
              onClick={() => applyWaterDelta(-250)}
              disabled={adjustWater.isPending || atWaterZero}
            >
              −250 мл
            </Button>
            <Button
              variant="pill"
              type="button"
              className="border-border/80"
              onClick={() => applyWaterDelta(-500)}
              disabled={adjustWater.isPending || atWaterZero}
            >
              −500 мл
            </Button>
          </div>
          {waterAdjustErr ? <p className="mt-2 text-xs text-red-600">{waterAdjustErr}</p> : null}
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-ink-heading">Новый замер</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              className="rounded-md"
              type="number"
              min={USER_INPUT.neckCm.min}
              max={USER_INPUT.neckCm.max}
              step="0.1"
              placeholder="Шея, см"
              value={neck}
              onChange={(e) => {
                setMeasurementErr(null);
                setNeck(e.target.value);
              }}
              onKeyDown={(e) =>
                handleEnterSubmit(e, canSubmitMeasurement, measurementSubmit)
              }
            />
            <Input
              className="rounded-md"
              type="number"
              min={USER_INPUT.waistCm.min}
              max={USER_INPUT.waistCm.max}
              step="0.1"
              placeholder="Талия, см"
              value={waist}
              onChange={(e) => {
                setMeasurementErr(null);
                setWaist(e.target.value);
              }}
              onKeyDown={(e) =>
                handleEnterSubmit(e, canSubmitMeasurement, measurementSubmit)
              }
            />
            <Input
              className="rounded-md"
              type="number"
              min={USER_INPUT.hipsCm.min}
              max={USER_INPUT.hipsCm.max}
              step="0.1"
              placeholder="Бёдра, см"
              value={hips}
              onChange={(e) => {
                setMeasurementErr(null);
                setHips(e.target.value);
              }}
              onKeyDown={(e) =>
                handleEnterSubmit(e, canSubmitMeasurement, measurementSubmit)
              }
            />
          </div>
          <Button className="mt-3" onClick={measurementSubmit} disabled={addMeasurement.isPending}>
            Добавить замер
          </Button>
          {measurementErr ? <p className="mt-2 text-xs text-red-600">{measurementErr}</p> : null}
        </Card>
      </div>
    </div>
  );
}
