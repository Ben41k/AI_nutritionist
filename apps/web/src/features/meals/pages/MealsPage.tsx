import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/shared/hooks/useToast';
import { apiJson, ApiError } from '@/shared/services/apiClient';
import { fetchMealsAllPagesForCalendarDay } from '@/shared/lib/fetchMealsAllPages';
import {
  bmrMifflinStJeor,
  calorieTargetForAdherence,
  tdeeFrom,
  type ActivityLevel,
  type NutritionGoal,
  type Sex,
} from '@/shared/lib/nutritionMetrics';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Textarea } from '@/shared/components/Textarea';
import { TrashIcon } from '@/shared/components/TrashIcon';
import { handleEnterSubmit } from '@/shared/lib/submitOnEnter';
import { USER_INPUT } from '@/shared/lib/userInputBounds';

type Meal = {
  id: string;
  occurredAt: string;
  diaryLocalDate?: string | null;
  description: string;
  portionEstimate: string;
  structuredEstimate: unknown;
  isModelEstimate: boolean;
};

type MealsListData = { meals: Meal[] };

type StructuredEstimate = {
  caloriesKcal?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
  fluidMl?: number;
  notes?: string;
};

function parseStructuredEstimate(raw: unknown): StructuredEstimate | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  return {
    caloriesKcal: num(o.caloriesKcal),
    proteinG: num(o.proteinG),
    fatG: num(o.fatG),
    carbsG: num(o.carbsG),
    fluidMl: num(o.fluidMl),
    notes: str(o.notes),
  };
}

function hasMacroNumbers(raw: unknown): boolean {
  const est = parseStructuredEstimate(raw);
  if (!est) return false;
  return (
    est.caloriesKcal !== undefined ||
    est.proteinG !== undefined ||
    est.fatG !== undefined ||
    est.carbsG !== undefined ||
    est.fluidMl !== undefined
  );
}

function MealMacrosPanel({ raw }: { raw: unknown }) {
  const est = parseStructuredEstimate(raw);
  const rows: { label: string; value: string }[] = [];
  if (est?.caloriesKcal !== undefined) {
    rows.push({ label: 'Ккал', value: `${Math.round(est.caloriesKcal)} ккал` });
  }
  if (est?.proteinG !== undefined) {
    rows.push({ label: 'Белки', value: `${est.proteinG.toFixed(1)} г` });
  }
  if (est?.fatG !== undefined) {
    rows.push({ label: 'Жиры', value: `${est.fatG.toFixed(1)} г` });
  }
  if (est?.carbsG !== undefined) {
    rows.push({ label: 'Углеводы', value: `${est.carbsG.toFixed(1)} г` });
  }
  if (est?.fluidMl !== undefined) {
    rows.push({ label: 'Жидкость', value: `${Math.round(est.fluidMl)} мл (в суточной воде)` });
  }

  if (rows.length === 0 && !est?.notes) {
    return (
      <p className="mt-2 text-sm text-ink-muted">
        Оценка БЖУ недоступна: модель не вернула распознаваемые значения.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border/60 bg-page/80 px-3 py-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Оценка модели (приблизительно)
      </div>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map((r) => (
            <Fragment key={r.label}>
              <dt className="text-ink-muted">{r.label}</dt>
              <dd className="font-medium text-ink-heading">{r.value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToISO(iso: string, deltaDays: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + deltaDays);
  return toLocalISO(d);
}

function formatSelectedDayTitle(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDay(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

/** Последние 7 календарных дней, заканчивая днём `anchorIso` (включительно). */
function weekChipsEndingOn(anchorIso: string): string[] {
  const t = parseLocalDate(anchorIso);
  const out: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(t);
    d.setDate(t.getDate() - i);
    out.push(toLocalISO(d));
  }
  return out;
}

type Profile = {
  age: number | null;
  sex: Sex;
  weightKg: number | null;
  heightCm: number | null;
  goal: NutritionGoal;
  activityLevel: ActivityLevel;
};

type WeightEntry = { recordedAt: string; weightKg: number };

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

function DayCaloriesBar({
  consumedKcal,
  targetKcal,
  profileLoading,
  profileIncomplete,
}: {
  consumedKcal: number;
  targetKcal: number | null;
  profileLoading: boolean;
  profileIncomplete: boolean;
}) {
  const over = targetKcal != null && consumedKcal > targetKcal;
  const fillPct =
    targetKcal != null && targetKcal > 0
      ? Math.min(100, (consumedKcal / targetKcal) * 100)
      : 0;

  return (
    <div className="rounded-xl border border-border/60 bg-page/60 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Калории за день
        </span>
        {targetKcal != null ? (
          <span className="text-sm font-semibold tabular-nums text-ink-heading">
            {Math.round(consumedKcal).toLocaleString('ru-RU')} /{' '}
            {Math.round(targetKcal).toLocaleString('ru-RU')} ккал
          </span>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-ink-heading">
            {Math.round(consumedKcal).toLocaleString('ru-RU')} ккал
          </span>
        )}
      </div>
      {targetKcal != null && targetKcal > 0 ? (
        <>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-border/55"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(consumedKcal, targetKcal * 2))}
            aria-valuemin={0}
            aria-valuemax={Math.round(targetKcal)}
            aria-label="Доля суточной нормы калорий"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                over ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {over
              ? `Выше расчётной нормы примерно на ${Math.round(consumedKcal - targetKcal).toLocaleString('ru-RU')} ккал.`
              : consumedKcal >= targetKcal
                ? 'Норма достигнута.'
                : `До нормы примерно ${Math.round(targetKcal - consumedKcal).toLocaleString('ru-RU')} ккал.`}
          </p>
        </>
      ) : profileLoading ? (
        <p className="mt-2 text-xs text-ink-muted">Загрузка профиля…</p>
      ) : profileIncomplete ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Чтобы показать норму и шкалу, укажите в{' '}
          <Link className="font-medium text-primary underline underline-offset-2" to="/profile">
            профиле
          </Link>{' '}
          рост, возраст и вес (или добавьте запись веса на главной).
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          Норма не рассчитана: проверьте данные профиля и вес.
        </p>
      )}
    </div>
  );
}

export function MealsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(todayISO);
  const [description, setDescription] = useState('');
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
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

  const entries = useMemo(() => weightData?.entries ?? [], [weightData]);
  const latestWeight = useMemo(() => {
    if (entries.length === 0) return profile?.weightKg ?? null;
    const last = entries[entries.length - 1];
    return last?.weightKg ?? null;
  }, [entries, profile?.weightKg]);

  const targetKcal = useMemo(() => {
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
    return Math.round(calorieTargetForAdherence(tdee, profile.goal));
  }, [profile, latestWeight]);

  const queryKey = useMemo(() => ['meals', date] as const, [date]);

  const { data, isLoading } = useQuery<MealsListData>({
    queryKey,
    queryFn: () => fetchMealsAllPagesForCalendarDay(date),
  });

  const consumedKcal = useMemo(() => sumMealCalories(data?.meals ?? []), [data?.meals]);

  const profileIncomplete = Boolean(
    profile &&
      targetKcal == null &&
      (profile.age == null ||
        profile.heightCm == null ||
        (latestWeight == null && profile.weightKg == null)),
  );

  const today = todayISO();
  const weekChips = useMemo(() => weekChipsEndingOn(today), [today]);

  const create = useMutation({
    mutationFn: async () => {
      const occurredAt = new Date(`${date}T${time}:00`).toISOString();
      const desc = description.trim().slice(0, USER_INPUT.mealDescription.max);
      return apiJson<{ meal: Meal }>('/meals', {
        method: 'POST',
        body: JSON.stringify({
          occurredAt,
          description: desc,
          diaryLocalDate: date,
        }),
      });
    },
    onSuccess: (payload) => {
      const meal = payload.meal;
      qc.setQueryData<MealsListData>(queryKey, (prev) => {
        const existing = prev?.meals ?? [];
        const without = existing.filter((m) => m.id !== meal.id);
        const meals = [...without, meal].sort(
          (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
        );
        return { meals };
      });
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ['tracking', 'water'] });
      setDescription('');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Не удалось сохранить приём пищи'),
  });

  const remove = useMutation({
    mutationFn: (mealId: string) =>
      apiJson<{ ok: boolean }>(`/meals/${mealId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ['tracking', 'water'] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Не удалось удалить запись'),
  });

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  День в дневнике
                </p>
                <h2 className="mt-1 text-lg font-semibold capitalize leading-snug text-ink-heading sm:text-xl">
                  {formatSelectedDayTitle(date)}
                </h2>
              </div>
              <div className="flex items-center justify-center gap-1 sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 px-3"
                  aria-label="Предыдущий день"
                  onClick={() => setDate((d) => addDaysToISO(d, -1))}
                >
                  ←
                </Button>
                <label className="sr-only" htmlFor="meals-diary-date">
                  Выбор даты
                </label>
                <Input
                  id="meals-diary-date"
                  className="w-[11.5rem] shrink-0 rounded-full border-border text-center text-sm font-medium"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 px-3"
                  aria-label="Следующий день"
                  onClick={() => setDate((d) => addDaysToISO(d, 1))}
                >
                  →
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Button
                type="button"
                variant="pill"
                className={`text-xs ${date === today ? 'border-primary/40 bg-primary-soft' : ''}`}
                disabled={date === today}
                onClick={() => setDate(today)}
              >
                Сегодня
              </Button>
              <Button
                type="button"
                variant="pill"
                className="text-xs"
                onClick={() => setDate(addDaysToISO(today, -1))}
              >
                Вчера
              </Button>
            </div>
            <div
              className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="list"
              aria-label="Быстрый выбор даты, последние 7 дней"
            >
              {weekChips.map((iso) => {
                const isSelected = iso === date;
                const isTodayChip = iso === today;
                const label = parseLocalDate(iso).toLocaleDateString('ru-RU', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                return (
                  <button
                    key={iso}
                    type="button"
                    role="listitem"
                    onClick={() => setDate(iso)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-left text-xs font-medium transition ${
                      isSelected
                        ? 'border-primary bg-primary text-white shadow-sm'
                        : 'border-border/80 bg-surface text-ink-body hover:border-primary/50'
                    }`}
                  >
                    <span className="block capitalize">{label}</span>
                    {isTodayChip ? (
                      <span
                        className={`mt-0.5 block text-[10px] font-normal ${isSelected ? 'text-white/85' : 'text-ink-muted'}`}
                      >
                        сегодня
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="w-full shrink-0 lg:max-w-sm lg:border-l lg:border-border/50 lg:pl-8">
            <DayCaloriesBar
              consumedKcal={consumedKcal}
              targetKcal={targetKcal}
              profileLoading={profileLoading}
              profileIncomplete={profileIncomplete}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start lg:gap-6">
      <Card className="p-4">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (create.isPending) return;
            const trimmed = description.trim();
            if (!trimmed) return;
            if (trimmed.length > USER_INPUT.mealDescription.max) {
              toast.error(`Описание не длиннее ${USER_INPUT.mealDescription.max} символов`);
              return;
            }
            create.mutate();
          }}
        >
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-ink-heading">Новый приём</h2>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
              Время
              <Input
                className="h-9 w-[6.75rem] rounded-md px-2 py-1 text-sm"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>
          <p className="text-[11px] leading-snug text-ink-muted">
            Запись на <span className="font-medium text-ink-body">{formatShortDay(date)}</span> — день
            меняется вверху. Напитки и жидкие блюда учитываются в суточной воде на дашборде (оценка модели).
          </p>
          <label className="sr-only" htmlFor="meal-description">
            Описание приёма пищи
          </label>
          <Textarea
            id="meal-description"
            rows={2}
            placeholder="Кратко: что и сколько…"
            className="min-h-0 rounded-md py-2 text-sm"
            maxLength={USER_INPUT.mealDescription.max}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
            onKeyDown={(e) =>
              handleEnterSubmit(e, !create.isPending && Boolean(description.trim()), () => {
                const t = description.trim();
                if (t.length > USER_INPUT.mealDescription.max) {
                  toast.error(`Описание не длиннее ${USER_INPUT.mealDescription.max} символов`);
                  return;
                }
                if (t) create.mutate();
              })
            }
          />
          <div className="flex justify-end pt-0.5">
            <Button
              type="submit"
              className="shrink-0 px-4 py-2 text-sm"
              disabled={create.isPending || !description.trim()}
            >
              {create.isPending ? 'Сохранение…' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink-heading">Записи за этот день</h2>
        {isLoading ? <p className="text-ink-muted">Загрузка…</p> : null}
        <ul className="space-y-3">
          {(data?.meals ?? []).map((m) => {
            const est = parseStructuredEstimate(m.structuredEstimate);
            const showModelFooter = m.isModelEstimate || Boolean(est?.notes?.trim());
            return (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-md border border-border px-3 py-3 sm:px-4"
              >
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-ink-muted">
                      {new Date(m.occurredAt).toLocaleString()}
                    </div>
                    <div className="font-medium text-ink-heading">{m.description}</div>
                    {hasMacroNumbers(m.structuredEstimate) ? (
                      <MealMacrosPanel raw={m.structuredEstimate} />
                    ) : m.isModelEstimate ? (
                      <p className="mt-2 text-sm text-ink-muted">
                        Оценка БЖУ недоступна: модель не вернула числовые значения для этой записи.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-start pt-0.5">
                    <Button
                      variant="ghost"
                      className="px-2.5 py-2 text-primary hover:bg-primary-soft hover:text-primary-hover"
                      disabled={remove.isPending || create.isPending}
                      aria-label="Удалить запись о приёме пищи"
                      onClick={() => {
                        if (!window.confirm('Удалить эту запись из дневника?')) {
                          return;
                        }
                        remove.mutate(m.id);
                      }}
                    >
                      <TrashIcon className="size-5 shrink-0 opacity-90" />
                    </Button>
                  </div>
                </div>
                {showModelFooter ? (
                  <div className="border-t border-border/45 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      Комментарий модели
                    </p>
                    {est?.notes?.trim() ? (
                      <p className="mt-1 text-xs leading-relaxed text-ink-body">{est.notes}</p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-muted">Комментарий не сформулирован.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!isLoading && (data?.meals.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-muted">Записей пока нет</p>
        ) : null}
      </Card>
      </div>
    </div>
  );
}
