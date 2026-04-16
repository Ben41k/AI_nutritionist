import { formatFullPlanFromBundle, type StoredRationPlanBundle } from '@/features/ration/lib/formatFullPlan';
import { listIsoDatesInMonth, monthFromToday, todayLocalISO } from '@/features/ration/lib/dateIso';

export const RATION_SESSION_STORAGE_PREFIX = 'ai-nutritionist:monthly-ration:';

export type RationBundleV2 = {
  v: 2;
  month: string;
  preamble: string | null;
  days: Record<string, string>;
};

export type RationBundleV3 = {
  v: 3;
  periodStart: string;
  periodEnd: string;
  preamble: string | null;
  days: Record<string, string>;
};

export function readStoredRationRaw(userId: string): string | null {
  try {
    const v = sessionStorage.getItem(RATION_SESSION_STORAGE_PREFIX + userId);
    return v != null && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function persistRationRaw(userId: string, raw: string | null): void {
  try {
    const key = RATION_SESSION_STORAGE_PREFIX + userId;
    if (raw == null || raw.length === 0) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, raw);
    }
  } catch {
    /* quota / private mode */
  }
}

function isV2Bundle(j: unknown): j is RationBundleV2 {
  if (typeof j !== 'object' || j === null) return false;
  const o = j as Record<string, unknown>;
  return (
    o.v === 2 &&
    typeof o.month === 'string' &&
    typeof o.days === 'object' &&
    o.days !== null &&
    !Array.isArray(o.days)
  );
}

function isV3Bundle(j: unknown): j is RationBundleV3 {
  if (typeof j !== 'object' || j === null) return false;
  const o = j as Record<string, unknown>;
  return (
    o.v === 3 &&
    typeof o.periodStart === 'string' &&
    typeof o.periodEnd === 'string' &&
    typeof o.days === 'object' &&
    o.days !== null &&
    !Array.isArray(o.days)
  );
}

export function parseStoredRation(raw: string | null): StoredRationPlanBundle | null {
  if (raw == null || raw.length === 0) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (isV3Bundle(j)) {
      return {
        v: 3,
        periodStart: j.periodStart,
        periodEnd: j.periodEnd,
        preamble: typeof j.preamble === 'string' ? j.preamble : null,
        days: j.days as Record<string, string>,
      };
    }
    if (isV2Bundle(j)) {
      return {
        v: 2,
        month: j.month,
        preamble: typeof j.preamble === 'string' ? j.preamble : null,
        days: j.days as Record<string, string>,
      };
    }
    return null;
  } catch {
    const m = monthFromToday();
    const day = todayLocalISO();
    return { v: 2, month: m, preamble: null, days: { [day]: raw } };
  }
}

export function serializeBundle(b: StoredRationPlanBundle): string {
  return JSON.stringify(b);
}

export function bundleDateBounds(bundle: StoredRationPlanBundle): { min: string; max: string } {
  if (bundle.v === 3) return { min: bundle.periodStart, max: bundle.periodEnd };
  const seq = listIsoDatesInMonth(bundle.month);
  const first = seq[0];
  const last = seq[seq.length - 1];
  if (first === undefined || last === undefined) {
    return { min: `${bundle.month}-01`, max: `${bundle.month}-01` };
  }
  return { min: first, max: last };
}

/** Полный текст сохранённого рациона для передачи в чат (ИИ). */
export function getStoredRationPlanPlainText(userId: string, maxChars = 20_000): string | null {
  const raw = readStoredRationRaw(userId);
  const bundle = parseStoredRation(raw);
  if (!bundle) return null;
  const text = formatFullPlanFromBundle(bundle).trim();
  if (!text) return null;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[... текст рациона обрезан из‑за лимита длины ...]`;
}
