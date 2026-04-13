import { useMemo, useState } from 'react';
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

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiJson<{ meals: Meal[] }>(`/meals?date=${encodeURIComponent(date)}`),
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
    onSuccess: () => {
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
              {m.isModelEstimate && m.structuredEstimate ? (
                <pre className="mt-2 overflow-x-auto rounded bg-page p-2 text-xs text-ink-body">
                  {JSON.stringify(m.structuredEstimate, null, 2)}
                </pre>
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
