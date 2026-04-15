import { apiJson } from '@/shared/services/apiClient';

export type MealListItem = {
  id: string;
  occurredAt: string;
  description: string;
  portionEstimate: string;
  structuredEstimate: unknown;
  isModelEstimate: boolean;
};

type PaginatedMeals = { meals: MealListItem[]; hasMore: boolean; nextCursor?: string };

/** Local calendar day → UTC ISO bounds (same as previous `/meals?from=&to=` client). */
export function calendarDayToUtcRange(dateStr: string): { from: string; to: string } {
  const from = new Date(`${dateStr}T00:00:00`);
  const to = new Date(`${dateStr}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function fetchMealsAllPagesForCalendarDay(
  dateStr: string,
): Promise<{ meals: MealListItem[] }> {
  return fetchMealsAllPagesForRange(calendarDayToUtcRange(dateStr));
}

export async function fetchMealsAllPagesForRange(params: {
  from: string;
  to: string;
}): Promise<{ meals: MealListItem[] }> {
  const base = new URLSearchParams({
    from: params.from,
    to: params.to,
    limit: '100',
  });
  const meals: MealListItem[] = [];
  let cursor: string | undefined;
  for (;;) {
    const q = new URLSearchParams(base);
    if (cursor) q.set('cursor', cursor);
    const r = await apiJson<PaginatedMeals>(`/meals?${q.toString()}`);
    meals.push(...r.meals);
    if (!r.hasMore || !r.nextCursor) break;
    cursor = r.nextCursor;
  }
  return { meals };
}
