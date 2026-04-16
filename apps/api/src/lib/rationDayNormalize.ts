const MODEL_FALLBACK_PREFIX = 'За этот день не удалось';

function parseIsoParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

/** Одна строка заголовка дня по ключу YYYY-MM-DD (локальный календарь). */
export function formatRationDayHeaderRu(iso: string): string {
  const p = parseIsoParts(iso);
  if (!p) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(p.y, p.m - 1, p.d));
}

/**
 * Первая строка блока приёмов пищи: модель часто пишет «Завтрак:» / «Завтрак»: — старый regex не находил « в начале.
 */
const BREAKFAST_LINE_RE = /^\s*[«"]?\s*Завтрак\s*[»"]?\s*[:\uFF1A]/i;

function mealsTextFromFirstBreakfast(body: string): string | null {
  const lf = body.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
  const lines = lf.split('\n');
  const idx = lines.findIndex((line) => BREAKFAST_LINE_RE.test(line));
  if (idx === -1) return null;
  return lines.slice(idx).join('\n').trimEnd();
}

/**
 * Один заголовок даты = ключ JSON; всё до первой строки «Завтрак…:» отбрасывается (дубли дат, мусор).
 * Синхронизируйте с apps/web/src/features/ration/lib/normalizeDayRationText.ts
 */
export function normalizeRationDayBodyForIso(iso: string, body: string): string {
  const t = body.trim();
  if (t.startsWith(MODEL_FALLBACK_PREFIX)) return t;

  const header = formatRationDayHeaderRu(iso);
  if (t.length === 0) return `${header}\n\n`;

  const block = mealsTextFromFirstBreakfast(t);
  if (block === null) {
    return `${header}\n\n${t}`;
  }
  return `${header}\n\n${block}`;
}
