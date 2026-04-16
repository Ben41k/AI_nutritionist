import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { apiJson, ApiError } from '@/shared/services/apiClient';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { RationTodayCard } from '@/features/ration/components/RationTodayCard';
import { RationAiFullResponsePanel } from '@/features/ration/components/RationAiFullResponsePanel';
import { formatFullPlanFromBundle, type StoredRationPlanBundle } from '@/features/ration/lib/formatFullPlan';
import { rationPlanPeriodLabel, todayLocalISO } from '@/features/ration/lib/dateIso';
import { normalizeRationDayBodyForIso } from '@/features/ration/lib/normalizeDayRationText';
import {
  bundleDateBounds,
  parseStoredRation,
  persistRationRaw,
  readStoredRationRaw,
  serializeBundle,
  type RationBundleV3,
} from '@/features/ration/lib/rationSessionStorage';

function dayViewEmptyMessage(
  bundle: StoredRationPlanBundle | null,
  selectedIso: string,
  hasBody: boolean,
): string {
  if (hasBody) return '';
  if (!bundle) {
    return 'Сформируйте рацион ниже — затем выберите день в календаре, чтобы открыть пример питания на эту дату.';
  }
  const { min, max } = bundleDateBounds(bundle);
  if (selectedIso < min || selectedIso > max) {
    return `Выбранная дата вне сохранённого периода плана. Доступны дни с ${min} по ${max}. Выберите день в этом диапазоне или сформируйте новый рацион.`;
  }
  return 'В ответе ИИ для этого дня нет текста — попробуйте сформировать рацион ещё раз.';
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
  periodStart: string;
  periodEnd: string;
  preamble: string | null;
  days: Record<string, string>;
  retrievalUsed?: boolean;
};

export function RationPage() {
  const { data: user } = useAuth();
  const qc = useQueryClient();
  const [selectedIso, setSelectedIso] = useState(todayLocalISO);

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

  const bounds = bundle != null ? bundleDateBounds(bundle) : null;
  const minIso = bounds?.min ?? null;
  const maxIso = bounds?.max ?? null;

  /** Дата для UI: при смене плана «поджимаем» к допустимому диапазону без setState в эффекте. */
  const resolvedIso = useMemo(() => {
    if (bundle == null || minIso == null || maxIso == null) return selectedIso;
    if (selectedIso >= minIso && selectedIso <= maxIso) return selectedIso;
    const t = todayLocalISO();
    return t >= minIso && t <= maxIso ? t : minIso;
  }, [bundle, minIso, maxIso, selectedIso]);

  const dayBody = useMemo(() => {
    if (bundle == null) return null;
    const v = bundle.days[resolvedIso]?.trim();
    if (v == null || v.length === 0) return null;
    return normalizeRationDayBodyForIso(resolvedIso, v);
  }, [bundle, resolvedIso]);

  const hasBody = dayBody != null && dayBody.length > 0;
  const todayEmptyMessage = dayViewEmptyMessage(bundle, resolvedIso, hasBody);

  const fullPlanText = useMemo(() => (bundle ? formatFullPlanFromBundle(bundle) : null), [bundle]);
  const fullPlanPeriodLabel = bundle ? rationPlanPeriodLabel(bundle) : null;

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiJson<{ profile: Profile }>('/profile'),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiJson<MonthlyApiResponse>('/meal-ration/monthly', {
        method: 'POST',
        body: JSON.stringify({ startDate: todayLocalISO() }),
      }),
    onSuccess: (data) => {
      const uid = user?.id;
      if (uid) {
        const next: RationBundleV3 = {
          v: 3,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          preamble: data.preamble,
          days: data.days,
        };
        const raw = serializeBundle(next);
        persistRationRaw(uid, raw);
        qc.setQueryData(rationStoredQueryKey(uid), raw);
      }
      const t = todayLocalISO();
      const sel =
        t >= data.periodStart && t <= data.periodEnd ? t : data.periodStart;
      setSelectedIso(sel);
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
                selectedIso={resolvedIso}
                onSelectedIsoChange={setSelectedIso}
                minIso={minIso}
                maxIso={maxIso}
                dayBody={hasBody ? dayBody : null}
                emptyMessage={todayEmptyMessage}
              />

              <Card className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink-heading">Рацион на месяц вперёд</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    ИИ строит примерный план на 31 день подряд, начиная с сегодняшней даты на вашем
                    устройстве. По каждому дню — завтрак, обед и ужин (обязательно) и при желании
                    перекусы, отдельными строками. Слева можно открыть любой день из сохранённого
                    периода; справа — полный текст ответа модели (без Markdown).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
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
                        setSelectedIso(todayLocalISO());
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
              <RationAiFullResponsePanel fullText={fullPlanText} periodLabel={fullPlanPeriodLabel} />
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
