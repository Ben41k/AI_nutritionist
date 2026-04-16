import { listIsoDatesInInclusiveRange, listIsoDatesInMonth } from '@/features/ration/lib/dateIso';
import type { StoredRationPlanBundle } from '@/features/ration/lib/formatFullPlan';
import {
  formatRationDayHeaderRu,
  normalizeRationDayBodyForIso,
  stripLeadingRationDayHeaderRu,
} from '@/features/ration/lib/normalizeDayRationText';

export type RationAiDayTableRow = { iso: string; dateLabel: string; body: string };

export function listRationAiDayTableRows(bundle: StoredRationPlanBundle): RationAiDayTableRow[] {
  const sequence =
    bundle.v === 2
      ? listIsoDatesInMonth(bundle.month)
      : listIsoDatesInInclusiveRange(bundle.periodStart, bundle.periodEnd);
  const out: RationAiDayTableRow[] = [];
  for (const iso of sequence) {
    const raw = bundle.days[iso]?.trim();
    if (!raw) continue;
    const normalized = normalizeRationDayBodyForIso(iso, raw);
    const dateLabel = formatRationDayHeaderRu(iso);
    const body = stripLeadingRationDayHeaderRu(iso, normalized).trim() || normalized.trim();
    out.push({ iso, dateLabel, body });
  }
  return out;
}
