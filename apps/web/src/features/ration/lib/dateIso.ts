export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date YYYY-MM-DD */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM for local today */
export function monthFromToday(): string {
  return todayLocalISO().slice(0, 7);
}

export function parseMonthParts(month: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!y || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

export function monthTitleRu(month: string): string {
  const p = parseMonthParts(month);
  if (!p) return month;
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(p.y, p.m - 1, 1),
  );
}

export function daysInMonthYm(month: string): number {
  const p = parseMonthParts(month);
  if (!p) return 0;
  return new Date(p.y, p.m, 0).getDate();
}

export function listIsoDatesInMonth(month: string): string[] {
  const p = parseMonthParts(month);
  if (!p) return [];
  const n = new Date(p.y, p.m, 0).getDate();
  const ym = `${p.y}-${pad2(p.m)}`;
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    out.push(`${ym}-${pad2(d)}`);
  }
  return out;
}

export function isoInMonth(iso: string, month: string): boolean {
  return iso.startsWith(`${month}-`);
}

export function firstDayOfMonth(month: string): string {
  return `${month}-01`;
}

export function clampIsoToMonth(iso: string, month: string): string {
  if (isoInMonth(iso, month)) return iso;
  const today = todayLocalISO();
  if (isoInMonth(today, month)) return today;
  return firstDayOfMonth(month);
}

export function addMonthsYm(month: string, delta: number): string {
  const p = parseMonthParts(month);
  if (!p) return month;
  const d = new Date(p.y, p.m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function weekdayMon0(iso: string): number {
  const [y, mo, da] = iso.split('-').map(Number);
  const wd = new Date(y, mo - 1, da).getDay();
  return (wd + 6) % 7;
}
