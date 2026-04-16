import { listIsoDatesInMonth } from '@/features/ration/lib/dateIso';

function formatRuLongWeekdayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

/** Сборка полного текста плана из структуры ответа ИИ (для правой колонки). */
export function formatFullPlanFromBundle(bundle: {
  month: string;
  preamble: string | null;
  days: Record<string, string>;
}): string {
  const lines: string[] = [];
  if (bundle.preamble?.trim()) {
    lines.push(bundle.preamble.trim(), '');
  }
  for (const iso of listIsoDatesInMonth(bundle.month)) {
    const body = bundle.days[iso]?.trim();
    if (!body) continue;
    lines.push(formatRuLongWeekdayDate(iso), body, '');
  }
  return lines.join('\n').trimEnd();
}
