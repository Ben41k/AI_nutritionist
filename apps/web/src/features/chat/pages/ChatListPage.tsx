import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiJson } from '@/shared/services/apiClient';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { DisclaimerBanner } from '@/shared/components/DisclaimerBanner';

type Thread = { id: string; title: string | null; updatedAt: string };

export function ChatListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['chat-threads'],
    queryFn: () => apiJson<{ threads: Thread[] }>('/chat/threads'),
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson<{ thread: Thread }>('/chat/threads', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      navigate(`/chat/${res.thread.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DisclaimerBanner />
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink-heading">Диалоги</h2>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          Новый чат
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {(data?.threads ?? []).map((t) => (
            <li key={t.id}>
              <Link className="block px-2 py-3 hover:bg-primary-soft/40" to={`/chat/${t.id}`}>
                <div className="font-medium text-ink-heading">{t.title ?? 'Чат'}</div>
                <div className="text-xs text-ink-muted">
                  {new Date(t.updatedAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {(data?.threads.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Создайте первый диалог</p>
        ) : null}
      </Card>
    </div>
  );
}
