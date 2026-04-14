import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/services/apiClient';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Textarea } from '@/shared/components/Textarea';

type Meal = {
  id: string;
  occurredAt: string;
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
    notes: str(o.notes),
  };
}

function hasReadableMacros(raw: unknown): boolean {
  const est = parseStructuredEstimate(raw);
  if (!est) return false;
  return (
    est.caloriesKcal !== undefined ||
    est.proteinG !== undefined ||
    est.fatG !== undefined ||
    est.carbsG !== undefined ||
    Boolean(est.notes?.length)
  );
}

function localDayRangeQuery(dateStr: string): string {
  const from = new Date(`${dateStr}T00:00:00`);
  const to = new Date(`${dateStr}T23:59:59.999`);
  const p = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return `/meals?${p.toString()}`;
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
      {est?.notes ? (
        <p className="mt-2 border-t border-border/40 pt-2 text-xs leading-relaxed text-ink-body">
          {est.notes}
        </p>
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

export function MealsPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO);
  const [description, setDescription] = useState('');
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [analyze, setAnalyze] = useState(false);

  const queryKey = useMemo(() => ['meals', date] as const, [date]);

  const { data, isLoading } = useQuery<MealsListData>({
    queryKey,
    queryFn: () => apiJson<MealsListData>(localDayRangeQuery(date)),
  });

  const create = useMutation({
    mutationFn: async () => {
      const occurredAt = new Date(`${date}T${time}:00`).toISOString();
      return apiJson<{ meal: Meal }>('/meals', {
        method: 'POST',
        body: JSON.stringify({
          occurredAt,
          description,
          analyzeWithModel: analyze,
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
      setDescription('');
      setAnalyze(false);
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink-heading">Новый приём пищи</h2>
        <div className="space-y-3">
          <label className="text-xs font-semibold text-ink-muted">
            Дата
            <Input
              className="mt-1 rounded-md"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-ink-muted">
            Время
            <Input
              className="mt-1 rounded-md"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-ink-muted">
            Описание
            <Textarea
              className="mt-1 rounded-md"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-body">
            <input
              type="checkbox"
              checked={analyze}
              onChange={(e) => setAnalyze(e.target.checked)}
            />
            Оценить БЖУ через модель (приблизительно, не анализ лаборатории)
          </label>
          {create.isError ? <p className="text-sm text-red-600">Не удалось сохранить</p> : null}
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !description.trim()}
          >
            {create.isPending ? 'Сохранение…' : 'Добавить'}
          </Button>
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink-heading">За выбранный день</h2>
        {isLoading ? <p className="text-ink-muted">Загрузка…</p> : null}
        <ul className="space-y-3">
          {(data?.meals ?? []).map((m) => (
            <li key={m.id} className="rounded-md border border-border px-4 py-3">
              <div className="text-xs text-ink-muted">
                {new Date(m.occurredAt).toLocaleString()}
              </div>
              <div className="font-medium text-ink-heading">{m.description}</div>
              {hasReadableMacros(m.structuredEstimate) ? (
                <MealMacrosPanel raw={m.structuredEstimate} />
              ) : m.isModelEstimate ? (
                <p className="mt-2 text-sm text-ink-muted">
                  Оценка БЖУ недоступна: модель не вернула данные для этой записи.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {!isLoading && (data?.meals.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-muted">Записей пока нет</p>
        ) : null}
      </Card>
    </div>
  );
}
