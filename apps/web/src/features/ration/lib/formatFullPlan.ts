import { listIsoDatesInInclusiveRange, listIsoDatesInMonth } from '@/features/ration/lib/dateIso';

function formatRuLongWeekdayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export type StoredRationPlanBundle =
  | { v: 2; month: string; preamble: string | null; days: Record<string, string> }
  | { v: 3; periodStart: string; periodEnd: string; preamble: string | null; days: Record<string, string> };

/** Сборка полного текста плана из структуры ответа ИИ (для правой колонки). */
export function formatFullPlanFromBundle(bundle: StoredRationPlanBundle): string {
  const lines: string[] = [];
  if (bundle.preamble?.trim()) {
    lines.push(bundle.preamble.trim(), '');
  }
  const sequence =
    bundle.v === 2
      ? listIsoDatesInMonth(bundle.month)
      : listIsoDatesInInclusiveRange(bundle.periodStart, bundle.periodEnd);
  for (const iso of sequence) {
    const body = bundle.days[iso]?.trim();
    if (!body) continue;
    lines.push(formatRuLongWeekdayDate(iso), body, '');
  }
  return lines.join('\n').trimEnd();
}
