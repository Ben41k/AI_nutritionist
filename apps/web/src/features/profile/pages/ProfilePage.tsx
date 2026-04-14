import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/services/apiClient';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Textarea } from '@/shared/components/Textarea';
import { DisclaimerBanner } from '@/shared/components/DisclaimerBanner';
import { useState } from 'react';

const goals = ['WEIGHT_LOSS', 'WEIGHT_GAIN', 'MAINTENANCE', 'HEALTH'] as const;
const activity = ['SEDENTARY', 'LIGHT', 'MODERATE', 'HIGH', 'ATHLETE'] as const;
const sexes = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const;

const AGE_MIN = 14;
const AGE_MAX = 110;
const WEIGHT_MIN = 35;
const WEIGHT_MAX = 250;
const HEIGHT_MIN = 120;
const HEIGHT_MAX = 230;
const WATER_GOAL_MIN = 500;
const WATER_GOAL_MAX = 12000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const sexLabels: Record<(typeof sexes)[number], string> = {
  MALE: 'мужской',
  FEMALE: 'женский',
  OTHER: 'другое',
  UNSPECIFIED: 'не указан',
};

const goalLabels: Record<(typeof goals)[number], string> = {
  WEIGHT_LOSS: 'снижение веса',
  WEIGHT_GAIN: 'набор веса',
  MAINTENANCE: 'поддержание веса',
  HEALTH: 'здоровье',
};

const activityLabels: Record<(typeof activity)[number], string> = {
  SEDENTARY: 'сидячий образ жизни',
  LIGHT: 'лёгкая активность',
  MODERATE: 'умеренная активность',
  HIGH: 'высокая активность',
  ATHLETE: 'очень высокая нагрузка',
};

type Profile = {
  id: string;
  updatedAt: string;
  age: number | null;
  sex: (typeof sexes)[number];
  weightKg: number | null;
  heightCm: number | null;
  goal: (typeof goals)[number];
  activityLevel: (typeof activity)[number];
  allergies: string | null;
  preferences: string | null;
  targetWeightKg: number | null;
  startWeightKg: number | null;
  waterGoalMl: number;
};

function ProfileForm({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Profile>>(() => profile);

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<Profile> = {
        ...form,
        age:
          form.age != null && !Number.isNaN(form.age)
            ? clamp(Math.round(form.age), AGE_MIN, AGE_MAX)
            : null,
        weightKg:
          form.weightKg != null && !Number.isNaN(form.weightKg)
            ? clamp(form.weightKg, WEIGHT_MIN, WEIGHT_MAX)
            : null,
        heightCm:
          form.heightCm != null && !Number.isNaN(form.heightCm)
            ? clamp(Math.round(form.heightCm), HEIGHT_MIN, HEIGHT_MAX)
            : null,
        targetWeightKg:
          form.targetWeightKg != null && !Number.isNaN(form.targetWeightKg)
            ? clamp(form.targetWeightKg, WEIGHT_MIN, WEIGHT_MAX)
            : null,
        startWeightKg:
          form.startWeightKg != null && !Number.isNaN(form.startWeightKg)
            ? clamp(form.startWeightKg, WEIGHT_MIN, WEIGHT_MAX)
            : null,
        waterGoalMl:
          form.waterGoalMl != null && !Number.isNaN(form.waterGoalMl)
            ? clamp(Math.round(form.waterGoalMl), WATER_GOAL_MIN, WATER_GOAL_MAX)
            : 2000,
      };
      return apiJson<{ profile: Profile }>('/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['profile'] }),
  });

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-ink-heading">Антропометрия и цели</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-ink-muted">
          Возраст
          <Input
            className="mt-1 rounded-md"
            type="number"
            min={AGE_MIN}
            max={AGE_MAX}
            value={form.age ?? ''}
            onChange={(e) =>
              setForm({ ...form, age: e.target.value ? Number(e.target.value) : null })
            }
            onBlur={() => {
              if (form.age == null || Number.isNaN(form.age)) return;
              const next = clamp(Math.round(form.age), AGE_MIN, AGE_MAX);
              if (next !== form.age) setForm({ ...form, age: next });
            }}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            от {AGE_MIN} до {AGE_MAX} лет
          </span>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          пол
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm"
            value={form.sex ?? 'UNSPECIFIED'}
            onChange={(e) => setForm({ ...form, sex: e.target.value as Profile['sex'] })}
          >
            {sexes.map((s) => (
              <option key={s} value={s}>
                {sexLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Вес (кг)
          <Input
            className="mt-1 rounded-md"
            type="number"
            min={WEIGHT_MIN}
            max={WEIGHT_MAX}
            step="0.1"
            value={form.weightKg ?? ''}
            onChange={(e) =>
              setForm({ ...form, weightKg: e.target.value ? Number(e.target.value) : null })
            }
            onBlur={() => {
              if (form.weightKg == null || Number.isNaN(form.weightKg)) return;
              const next = clamp(form.weightKg, WEIGHT_MIN, WEIGHT_MAX);
              if (next !== form.weightKg) setForm({ ...form, weightKg: next });
            }}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            от {WEIGHT_MIN} до {WEIGHT_MAX} кг
          </span>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Рост (см)
          <Input
            className="mt-1 rounded-md"
            type="number"
            min={HEIGHT_MIN}
            max={HEIGHT_MAX}
            value={form.heightCm ?? ''}
            onChange={(e) =>
              setForm({ ...form, heightCm: e.target.value ? Number(e.target.value) : null })
            }
            onBlur={() => {
              if (form.heightCm == null || Number.isNaN(form.heightCm)) return;
              const next = clamp(Math.round(form.heightCm), HEIGHT_MIN, HEIGHT_MAX);
              if (next !== form.heightCm) setForm({ ...form, heightCm: next });
            }}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            от {HEIGHT_MIN} до {HEIGHT_MAX} см
          </span>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          цель
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm"
            value={form.goal ?? 'MAINTENANCE'}
            onChange={(e) => setForm({ ...form, goal: e.target.value as Profile['goal'] })}
          >
            {goals.map((g) => (
              <option key={g} value={g}>
                {goalLabels[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          активность
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm"
            value={form.activityLevel ?? 'SEDENTARY'}
            onChange={(e) =>
              setForm({ ...form, activityLevel: e.target.value as Profile['activityLevel'] })
            }
          >
            {activity.map((a) => (
              <option key={a} value={a}>
                {activityLabels[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Целевой вес (кг)
          <Input
            className="mt-1 rounded-md"
            type="number"
            min={WEIGHT_MIN}
            max={WEIGHT_MAX}
            step="0.1"
            value={form.targetWeightKg ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                targetWeightKg: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            Для процента выполнения цели на вкладке «Метрики»
          </span>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Стартовый вес (кг)
          <Input
            className="mt-1 rounded-md"
            type="number"
            min={WEIGHT_MIN}
            max={WEIGHT_MAX}
            step="0.1"
            value={form.startWeightKg ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                startWeightKg: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            Если пусто — берётся самая ранняя запись веса из журнала
          </span>
        </label>
        <label className="text-xs font-semibold text-ink-muted sm:col-span-2">
          Норма воды (мл / сутки)
          <Input
            className="mt-1 max-w-xs rounded-md"
            type="number"
            min={WATER_GOAL_MIN}
            max={WATER_GOAL_MAX}
            step="50"
            value={form.waterGoalMl ?? 2000}
            onChange={(e) =>
              setForm({
                ...form,
                waterGoalMl: e.target.value ? Number(e.target.value) : 2000,
              })
            }
          />
        </label>
      </div>
      <label className="mt-4 block text-xs font-semibold text-ink-muted">
        Аллергии / непереносимости
        <Textarea
          className="mt-1 rounded-md"
          value={form.allergies ?? ''}
          onChange={(e) => setForm({ ...form, allergies: e.target.value })}
        />
      </label>
      <label className="mt-4 block text-xs font-semibold text-ink-muted">
        Предпочтения в еде
        <Textarea
          className="mt-1 rounded-md"
          value={form.preferences ?? ''}
          onChange={(e) => setForm({ ...form, preferences: e.target.value })}
        />
      </label>
      {save.isError ? <p className="mt-3 text-sm text-red-600">Ошибка сохранения</p> : null}
      {save.isSuccess ? <p className="mt-3 text-sm text-primary">Сохранено</p> : null}
      <Button className="mt-6" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Сохранение…' : 'Сохранить'}
      </Button>
    </Card>
  );
}

export function ProfilePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiJson<{ profile: Profile }>('/profile'),
  });

  if (isLoading) return <p className="text-ink-muted">Загрузка профиля…</p>;
  if (!data?.profile) return <p className="text-ink-muted">Профиль не найден</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DisclaimerBanner />
      <ProfileForm key={data.profile.updatedAt} profile={data.profile} />
    </div>
  );
}
