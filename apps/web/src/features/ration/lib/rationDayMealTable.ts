/**
 * Строка «Завтрак:» / ««Завтрак»:» и аналоги для остальных приёмов — как в normalizeDayRationText / API.
 */
const MEAL_START_LINE_RE =
  /^\s*[«"]?\s*(Завтрак|Обед|Ужин|Перекус(?:ы)?|Полдник|Второй\s+завтрак)\s*[»"]?\s*[:\uFF1A]\s*(.*)$/iu;

export type RationMealTableRow = { key: string; label: string; content: string };

export function parseRationDayBodyToMealTableRows(dayBody: string): RationMealTableRow[] {
  const lines = dayBody.replace(/\r\n/g, '\n').split('\n');
  const rows: RationMealTableRow[] = [];
  const preambleLines: string[] = [];
  let current: { label: string; contentLines: string[] } | null = null;

  const pushCurrent = () => {
    if (current == null) return;
    const content = current.contentLines.join('\n').trimEnd();
    rows.push({
      key: `${current.label}-${rows.length}`,
      label: current.label,
      content: content.length > 0 ? content : '—',
    });
    current = null;
  };

  for (const line of lines) {
    const m = MEAL_START_LINE_RE.exec(line);
    if (m) {
      if (current == null && preambleLines.some((l) => l.trim().length > 0)) {
        rows.push({
          key: `preamble-${rows.length}`,
          label: 'Дополнительно',
          content: preambleLines.join('\n').trim() || '—',
        });
        preambleLines.length = 0;
      }
      pushCurrent();
      const label = m[1].trim();
      const rest = (m[2] ?? '').trimEnd();
      current = { label, contentLines: rest.length > 0 ? [rest] : [] };
    } else if (current != null) {
      current.contentLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  pushCurrent();

  if (rows.length === 0) {
    const t = dayBody.trim();
    return [{ key: 'whole', label: 'Рацион', content: t.length > 0 ? t : '—' }];
  }
  return rows;
}
