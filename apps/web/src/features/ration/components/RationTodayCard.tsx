import { Card } from '@/shared/components/Card';

function formatTodayHeading(todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export function RationTodayCard({
  todayIso,
  todayBody,
  emptyMessage,
}: {
  todayIso: string;
  todayBody: string | null;
  emptyMessage: string;
}) {
  const hasBody = todayBody != null && todayBody.trim().length > 0;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Сегодня</h3>
        <p className="mt-1 text-base font-semibold text-ink-heading">
          {formatTodayHeading(todayIso)}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Фрагмент из ответа ИИ для текущей даты (если в сохранённом плане есть этот день).
        </p>
      </div>
      {hasBody ? (
        <pre className="max-h-[min(50vh,24rem)] overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-body">
          {todayBody}
        </pre>
      ) : (
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      )}
    </Card>
  );
}
