import { useMemo } from 'react';
import { Card } from '@/shared/components/Card';
import type { StoredRationPlanBundle } from '@/features/ration/lib/formatFullPlan';
import { listRationAiDayTableRows } from '@/features/ration/lib/rationAiTableRows';

export function RationAiFullResponsePanel({
  bundle,
  periodLabel,
}: {
  bundle: StoredRationPlanBundle | null;
  periodLabel: string | null;
}) {
  const rows = useMemo(() => (bundle != null ? listRationAiDayTableRows(bundle) : []), [bundle]);
  const preamble = bundle?.preamble?.trim() ?? '';

  return (
    <Card className="flex max-h-[min(75vh,calc(100dvh-10rem))] flex-col lg:max-h-[calc(100dvh-8rem)]">
      <h3 className="mb-2 shrink-0 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Ответ ИИ{periodLabel ? ` · ${periodLabel}` : ''}
      </h3>
      {bundle != null && (rows.length > 0 || preamble.length > 0) ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {preamble.length > 0 ? (
            <p className="shrink-0 whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{preamble}</p>
          ) : null}
          {rows.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto pr-1">
              <div className="rounded-lg border border-border/80 bg-surface/80">
                <table className="w-full min-w-[18rem] border-collapse text-left text-sm text-ink-body">
                  <thead className="sticky top-0 z-[1] border-b-2 border-border bg-ink-heading/[0.06]">
                    <tr>
                      <th className="whitespace-nowrap px-2.5 py-2 text-left text-sm font-semibold text-ink-heading sm:w-[11rem] sm:px-3">
                        Дата
                      </th>
                      <th className="px-2.5 py-2 text-left text-sm font-semibold text-ink-heading sm:px-3">
                        Рацион на день
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/90 [&>tr:last-child>td]:border-b-0">
                    {rows.map((row) => (
                      <tr key={row.iso}>
                        <td className="border-b border-border/80 px-2.5 py-2 align-top font-medium text-ink-heading sm:px-3">
                          {row.dateLabel}
                        </td>
                        <td className="border-b border-border/80 px-2.5 py-2 align-top sm:px-3">
                          <span className="block whitespace-pre-wrap leading-relaxed text-ink-body">
                            {row.body}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          После генерации здесь будет полный текст плана по дням из ответа модели.
        </p>
      )}
    </Card>
  );
}
