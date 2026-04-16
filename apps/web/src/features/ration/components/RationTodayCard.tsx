import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { addDaysToLocalIso } from '@/features/ration/lib/dateIso';
import { stripLeadingRationDayHeaderRu } from '@/features/ration/lib/normalizeDayRationText';
import { parseRationDayBodyToMealTableRows } from '@/features/ration/lib/rationDayMealTable';

function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export function RationTodayCard({
  selectedIso,
  onSelectedIsoChange,
  minIso,
  maxIso,
  dayBody,
  emptyMessage,
}: {
  selectedIso: string;
  onSelectedIsoChange: (iso: string) => void;
  minIso: string | null;
  maxIso: string | null;
  dayBody: string | null;
  emptyMessage: string;
}) {
  const hasBody = dayBody != null && dayBody.trim().length > 0;
  const canPrev = minIso == null || selectedIso > minIso;
  const canNext = maxIso == null || selectedIso < maxIso;

  const mealRows =
    hasBody && dayBody != null
      ? parseRationDayBodyToMealTableRows(stripLeadingRationDayHeaderRu(selectedIso, dayBody))
      : [];

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Рацион на день</h3>
        <p className="mt-1 text-base font-semibold text-ink-heading">{formatDayHeading(selectedIso)}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Выберите дату — показывается сохранённый фрагмент плана на этот день (если он есть в ответе ИИ).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="shrink-0 px-2"
          aria-label="Предыдущий день"
          disabled={!canPrev}
          onClick={() => onSelectedIsoChange(addDaysToLocalIso(selectedIso, -1))}
        >
          ‹
        </Button>
        <input
          type="date"
          value={selectedIso}
          min={minIso ?? undefined}
          max={maxIso ?? undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 0) onSelectedIsoChange(v);
          }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-page px-2 py-1.5 text-sm text-ink-heading outline-none ring-primary/25 focus-visible:ring-2 sm:max-w-[11rem]"
          aria-label="Дата просмотра рациона"
        />
        <Button
          type="button"
          variant="ghost"
          className="shrink-0 px-2"
          aria-label="Следующий день"
          disabled={!canNext}
          onClick={() => onSelectedIsoChange(addDaysToLocalIso(selectedIso, 1))}
        >
          ›
        </Button>
      </div>

      {hasBody ? (
        <div className="max-h-[min(50vh,24rem)] min-h-0 overflow-y-auto overflow-x-auto rounded-lg border border-border/80 bg-surface/80">
          <table className="w-full min-w-[16rem] border-collapse text-left text-sm text-ink-body">
            <thead className="sticky top-0 z-[1] border-b-2 border-border bg-ink-heading/[0.06]">
              <tr>
                <th className="whitespace-nowrap border-b-2 border-border px-2.5 py-2 text-left text-sm font-semibold text-ink-heading sm:w-[9rem] sm:px-3">
                  Приём пищи
                </th>
                <th className="border-b-2 border-border px-2.5 py-2 text-left text-sm font-semibold text-ink-heading sm:px-3">
                  Меню
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/90 [&>tr:last-child>td]:border-b-0">
              {mealRows.map((row) => (
                <tr key={row.key}>
                  <td className="whitespace-nowrap border-b border-border/80 px-2.5 py-2 align-top font-medium text-ink-heading sm:px-3">
                    {row.label}
                  </td>
                  <td className="border-b border-border/80 px-2.5 py-2 align-top sm:px-3">
                    <span className="block whitespace-pre-wrap leading-relaxed text-ink-body">{row.content}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      )}
    </Card>
  );
}
