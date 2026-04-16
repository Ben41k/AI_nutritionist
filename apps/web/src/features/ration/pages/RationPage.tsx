import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { apiJson, ApiError } from '@/shared/services/apiClient';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { RationTodayCard } from '@/features/ration/components/RationTodayCard';
import { RationAiFullResponsePanel } from '@/features/ration/components/RationAiFullResponsePanel';
import { formatFullPlanFromBundle } from '@/features/ration/lib/formatFullPlan';
import { addMonthsYm, monthFromToday, monthTitleRu, todayLocalISO } from '@/features/ration/lib/dateIso';

const RATION_STORAGE_PREFIX = 'ai-nutritionist:monthly-ration:';

export type RationBundleV2 = {
  v: 2;
  month: string;
  preamble: string | null;
  days: Record<string, string>;
};

function readStoredRationRaw(userId: string): string | null {
  try {
    const v = sessionStorage.getItem(RATION_STORAGE_PREFIX + userId);
    return v != null && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function persistRationRaw(userId: string, raw: string | null): void {
  try {
    const key = RATION_STORAGE_PREFIX + userId;
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

function parseStoredRation(raw: string | null): RationBundleV2 | null {
  if (raw == null || raw.length === 0) return null;
  try {
    const j = JSON.parse(raw) as unknown;
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

function serializeBundle(b: RationBundleV2): string {
  return JSON.stringify(b);
}

type Profile = {
  age: number | null;
  sex: string;
  weightKg: number | null;
  heightCm: number | null;
  goal: string;
  activityLevel: string;
  allergies: string | null;
  preferences: string | null;
};

function profileLooksSparse(p: Profile): boolean {
  return (
    p.age == null ||
    p.weightKg == null ||
    p.heightCm == null ||
    p.sex === 'UNSPECIFIED'
  );
}

function generationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Не удалось сформировать рацион. Проверьте соединение и повторите попытку.';
}

const rationStoredQueryKey = (userId: string) => ['ration', 'monthly-plan-stored', userId] as const;

type MonthlyApiResponse = {
  month: string;
  preamble: string | null;
  days: Record<string, string>;
  retrievalUsed?: boolean;
};

export function RationPage() {
  const { data: user } = useAuth();
  const qc = useQueryClient();
  const [generateMonth, setGenerateMonth] = useState(monthFromToday);

  const rationStoredQuery = useQuery({
    queryKey: rationStoredQueryKey(user?.id ?? ''),
    enabled: Boolean(user?.id),
    queryFn: async ({ queryKey }) => {
      const userId = queryKey[2];
      if (typeof userId !== 'string' || userId.length === 0) return null;
      return readStoredRationRaw(userId);
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const rawStored = rationStoredQuery.data ?? null;
  const bundle = useMemo(() => parseStoredRation(rawStored), [rawStored]);

  const todayIso = todayLocalISO();
  const todayMonth = todayIso.slice(0, 7);

  const todayBody =
    bundle != null && bundle.month === todayMonth
      ? (bundle.days[todayIso]?.trim() ?? null)
      : null;
  const hasTodayBody = todayBody != null && todayBody.length > 0;

  const todayEmptyMessage = !bundle
    ? 'Сформируйте рацион ниже — для сегодняшней даты появится фрагмент из ответа ИИ, если он попадает в выбранный при генерации месяц.'
    : bundle.month !== todayMonth
      ? `Сохранён план за ${bundle.month}, а сегодня уже ${todayMonth}. Сгенерируйте рацион за текущий месяц или откройте полный ответ справа.`
      : !hasTodayBody
        ? 'В ответе ИИ для сегодня нет текста — попробуйте сформировать рацион ещё раз.'
        : '';

  const fullPlanText = useMemo(() => (bundle ? formatFullPlanFromBundle(bundle) : null), [bundle]);
  const fullPlanMonthTitle = bundle ? monthTitleRu(bundle.month) : null;

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiJson<{ profile: Profile }>('/profile'),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiJson<MonthlyApiResponse>('/meal-ration/monthly', {
        method: 'POST',
        body: JSON.stringify({ month: generateMonth }),
      }),
    onSuccess: (data) => {
      const uid = user?.id;
      if (uid) {
        const next: RationBundleV2 = {
          v: 2,
          month: data.month,
          preamble: data.preamble,
          days: data.days,
        };
        const raw = serializeBundle(next);
        persistRationRaw(uid, raw);
        qc.setQueryData(rationStoredQueryKey(uid), raw);
      }
      setGenerateMonth(data.month);
    },
  });

  const generationError = generate.isError && generate.error != null
    ? generationErrorMessage(generate.error)
    : null;

  const profile = profileQuery.data?.profile;

  return (
    <div className="mx-auto max-w-6xl">
      {profileQuery.isLoading ? (
        <p className="text-ink-muted">Загрузка профиля…</p>
      ) : profileQuery.isError ? (
        <Card className="border-red-200 bg-red-50/60 text-sm text-red-800">
          Не удалось загрузить профиль.{' '}
          <Link className="font-medium text-primary underline" to="/profile">
            Открыть профиль
          </Link>
        </Card>
      ) : profile ? (
        <div className="flex flex-col gap-6">
          {profileLooksSparse(profile) ? (
            <Card className="text-sm text-ink-body">
              Для более точного рациона заполните в{' '}
              <Link className="font-medium text-primary underline" to="/profile">
                профиле
              </Link>{' '}
              возраст, пол, вес, рост и цель — ИИ учтёт их при расчёте примера.
            </Card>
          ) : null}

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <RationTodayCard
                todayIso={todayIso}
                todayBody={hasTodayBody ? todayBody : null}
                emptyMessage={todayEmptyMessage}
              />

              <Card className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink-heading">Рацион на месяц</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    Слева — рацион на сегодня из ответа модели; справа — полный план месяца. У каждого
                    дня в ответе первая строка: день недели и дата по-русски; форматирование без
                    Markdown.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-page px-2 py-1.5 sm:w-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      className="shrink-0 px-2"
                      aria-label="Предыдущий месяц"
                      onClick={() => setGenerateMonth((m) => addMonthsYm(m, -1))}
                    >
                      ‹
                    </Button>
                    <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-ink-heading">
                      {monthTitleRu(generateMonth)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="shrink-0 px-2"
                      aria-label="Следующий месяц"
                      onClick={() => setGenerateMonth((m) => addMonthsYm(m, 1))}
                    >
                      ›
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    disabled={generate.isPending}
                    onClick={() => void generate.mutateAsync()}
                  >
                    {generate.isPending ? 'Формируем…' : 'Сформировать рацион'}
                  </Button>
                  {bundle ? (
                    <Button
                      variant="pill"
                      disabled={generate.isPending}
                      onClick={() => {
                        const uid = user?.id;
                        if (uid) {
                          persistRationRaw(uid, null);
                          qc.setQueryData(rationStoredQueryKey(uid), null);
                        }
                        setGenerateMonth(monthFromToday());
                      }}
                    >
                      Очистить
                    </Button>
                  ) : null}
                </div>
                {generationError ? <p className="text-sm text-red-600">{generationError}</p> : null}
              </Card>
            </div>

            <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[min(100%,28rem)] xl:w-[32rem]">
              <RationAiFullResponsePanel fullText={fullPlanText} monthLabel={fullPlanMonthTitle} />
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
