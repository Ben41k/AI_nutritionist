export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type CursorPayload = { t: string; id: string };

export function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (raw == null || raw.trim() === '') return null;
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (typeof j !== 'object' || j === null) return null;
    const o = j as Record<string, unknown>;
    if (typeof o.t !== 'string' || typeof o.id !== 'string') return null;
    return { t: o.t, id: o.id };
  } catch {
    return null;
  }
}

export function clampLimit(n: unknown): number {
  const d = DEFAULT_PAGE_SIZE;
  if (n == null) return d;
  const num = typeof n === 'string' ? Number(n) : typeof n === 'number' ? n : NaN;
  if (!Number.isFinite(num)) return d;
  const x = Math.floor(num);
  return Math.min(Math.max(x, 1), MAX_PAGE_SIZE);
}
