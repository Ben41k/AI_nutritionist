import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { useConfirmDialog } from '@/shared/hooks/useConfirmDialog';
import { useToast } from '@/shared/hooks/useToast';
import { apiJson, ApiError } from '@/shared/services/apiClient';
import { Button } from '@/shared/components/Button';
import { TrashIcon } from '@/shared/components/TrashIcon';
import { chatPaths } from '@/features/chat/routes';

type Thread = { id: string; title: string | null; updatedAt: string };

export function ChatSidebar() {
  const navigate = useNavigate();
  const { threadId: activeThreadId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const { data, isLoading } = useQuery({
    queryKey: ['chat-threads'],
    queryFn: () => apiJson<{ threads: Thread[] }>('/chat/threads'),
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson<{ thread: Thread }>('/chat/threads', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      toast.success('Новый чат создан');
      navigate(chatPaths.thread(res.thread.id));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiJson<{ ok: boolean }>(`/chat/threads/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      void qc.removeQueries({ queryKey: ['chat-messages', id] });
      toast.success('Чат удалён');
      if (activeThreadId === id) {
        navigate(chatPaths.root);
      }
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Не удалось удалить чат'),
  });

  return (
    <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden border-border bg-surface/40 md:max-h-none md:h-full md:w-72 md:min-w-[18rem] md:max-w-[20rem] md:border-r">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Диалоги
        </h2>
        <Button
          className="shrink-0 px-3 py-2 text-sm"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          Новый
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-3 py-4 text-sm text-ink-muted">Загрузка…</p>
        ) : (
          <ul className="divide-y divide-border">
            {(data?.threads ?? []).map((t) => (
              <li key={t.id} className="flex items-stretch">
                <NavLink
                  to={chatPaths.thread(t.id)}
                  className={({ isActive }) =>
                    clsx(
                      'min-w-0 flex-1 px-3 py-2.5 text-left transition-colors',
                      isActive
                        ? 'bg-primary-soft text-ink-heading'
                        : 'hover:bg-primary-soft/50 text-ink-body',
                    )
                  }
                >
                  <div className="truncate font-medium">{t.title ?? 'Чат'}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {new Date(t.updatedAt).toLocaleString('ru-RU')}
                  </div>
                </NavLink>
                <div className="flex shrink-0 items-center border-l border-border px-1.5">
                  <Button
                    variant="ghost"
                    className="px-2 py-2 text-primary hover:bg-primary-soft hover:text-primary-hover"
                    disabled={remove.isPending}
                    aria-label="Удалить чат"
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: 'Удалить чат?',
                          message: 'Все сообщения будут удалены безвозвратно.',
                          tone: 'danger',
                        });
                        if (!ok) return;
                        remove.mutate(t.id);
                      })();
                    }}
                  >
                    <TrashIcon className="size-5 shrink-0 opacity-90" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isLoading && (data?.threads.length ?? 0) === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-muted">Создайте первый диалог.</p>
        ) : null}
      </div>
    </aside>
  );
}
