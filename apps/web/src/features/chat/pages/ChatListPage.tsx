import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiJson } from '@/shared/services/apiClient';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { TrashIcon } from '@/shared/components/TrashIcon';
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

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiJson<{ ok: boolean }>(`/chat/threads/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      void qc.removeQueries({ queryKey: ['chat-messages', id] });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink-heading">Диалоги</h2>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          Новый чат
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {(data?.threads ?? []).map((t) => (
            <li key={t.id} className="flex items-stretch">
              <Link
                className="min-w-0 flex-1 px-2 py-3 hover:bg-primary-soft/40"
                to={`/chat/${t.id}`}
              >
                <div className="font-medium text-ink-heading">{t.title ?? 'Чат'}</div>
                <div className="text-xs text-ink-muted">
                  {new Date(t.updatedAt).toLocaleString()}
                </div>
              </Link>
              <div className="flex shrink-0 items-center border-l border-border px-2">
                <Button
                  variant="ghost"
                  className="px-2.5 py-2 text-primary hover:bg-primary-soft hover:text-primary-hover"
                  disabled={remove.isPending}
                  aria-label="Удалить чат"
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Удалить этот чат? Все сообщения будут удалены безвозвратно.',
                      )
                    ) {
                      return;
                    }
                    remove.mutate(t.id);
                  }}
                >
                  <TrashIcon className="size-5 shrink-0 opacity-90" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {(data?.threads.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Создайте первый диалог</p>
        ) : null}
      </Card>
      {remove.isError ? (
        <p className="text-sm text-red-600">
          {remove.error instanceof Error ? remove.error.message : 'Не удалось удалить чат'}
        </p>
      ) : null}
    </div>
  );
}
