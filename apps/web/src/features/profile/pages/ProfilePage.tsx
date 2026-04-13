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
};

function ProfileForm({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Profile>>(() => profile);

  const save = useMutation({
    mutationFn: () =>
      apiJson<{ profile: Profile }>('/profile', { method: 'PATCH', body: JSON.stringify(form) }),
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
            value={form.age ?? ''}
            onChange={(e) =>
              setForm({ ...form, age: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Пол
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm"
            value={form.sex ?? 'UNSPECIFIED'}
            onChange={(e) => setForm({ ...form, sex: e.target.value as Profile['sex'] })}
          >
            {sexes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Вес (кг)
          <Input
            className="mt-1 rounded-md"
            type="number"
            step="0.1"
            value={form.weightKg ?? ''}
            onChange={(e) =>
              setForm({ ...form, weightKg: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Рост (см)
          <Input
            className="mt-1 rounded-md"
            type="number"
            value={form.heightCm ?? ''}
            onChange={(e) =>
              setForm({ ...form, heightCm: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Цель
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm"
            value={form.goal ?? 'MAINTENANCE'}
            onChange={(e) => setForm({ ...form, goal: e.target.value as Profile['goal'] })}
          >
            {goals.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Активность
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm"
            value={form.activityLevel ?? 'SEDENTARY'}
            onChange={(e) =>
              setForm({ ...form, activityLevel: e.target.value as Profile['activityLevel'] })
            }
          >
            {activity.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
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
