import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiJson, ApiError } from '@/shared/services/apiClient';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { DisclaimerBanner } from '@/shared/components/DisclaimerBanner';

const RATION_STORAGE_PREFIX = 'ai-nutritionist:monthly-ration:';

function readStoredRation(userId: string): string | null {
  try {
    const v = sessionStorage.getItem(RATION_STORAGE_PREFIX + userId);
    return v != null && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function persistRation(userId: string, plan: string | null): void {
  try {
    const key = RATION_STORAGE_PREFIX + userId;
    if (plan == null || plan.length === 0) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, plan);
    }
  } catch {
    /* quota / private mode */
  }
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

export function RationPage() {
  const { data: user } = useAuth();
  const qc = useQueryClient();

  const rationStoredQuery = useQuery({
    queryKey: rationStoredQueryKey(user?.id ?? ''),
    enabled: Boolean(user?.id),
    queryFn: async ({ queryKey }) => {
      const userId = queryKey[2];
      if (typeof userId !== 'string' || userId.length === 0) return null;
      return readStoredRation(userId);
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const plan = rationStoredQuery.data ?? null;

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiJson<{ profile: Profile }>('/profile'),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiJson<{ plan: string; retrievalUsed?: boolean }>('/meal-ration/monthly', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      const uid = user?.id;
      if (uid) {
        persistRation(uid, data.plan);
        qc.setQueryData(rationStoredQueryKey(uid), data.plan);
      }
    },
  });

  const generationError = generate.isError && generate.error != null
    ? generationErrorMessage(generate.error)
    : null;

  const profile = profileQuery.data?.profile;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <DisclaimerBanner />

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
        <>
          {profileLooksSparse(profile) ? (
            <Card className="text-sm text-ink-body">
              Для более точного рациона заполните в{' '}
              <Link className="font-medium text-primary underline" to="/profile">
                профиле
              </Link>{' '}
              возраст, пол, вес, рост и цель — ИИ учтёт их при расчёте примера.
            </Card>
          ) : null}

          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink-heading">Рацион на месяц</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Примерный план питания на 4 недели формируется по вашим данным из профиля (цель,
                активность, аллергии, предпочтения). Это ориентир, а не медицинское назначение.
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
              {plan ? (
                <Button
                  variant="pill"
                  disabled={generate.isPending}
                  onClick={() => {
                    const uid = user?.id;
                    if (uid) {
                      persistRation(uid, null);
                      qc.setQueryData(rationStoredQueryKey(uid), null);
                    }
                  }}
                >
                  Очистить
                </Button>
              ) : null}
            </div>
            {generationError ? <p className="text-sm text-red-600">{generationError}</p> : null}
          </Card>

          {plan ? (
            <Card>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Ваш примерный рацион
              </h3>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-body">
                {plan}
              </pre>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
