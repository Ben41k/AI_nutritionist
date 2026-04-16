import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '@/shared/services/apiClient';
import { Button } from '@/shared/components/Button';
import { Textarea } from '@/shared/components/Textarea';
import { TrashIcon } from '@/shared/components/TrashIcon';
import { chatPaths } from '@/features/chat/routes';
import { handleEnterSubmit } from '@/shared/lib/submitOnEnter';

type Msg = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
};

export function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [lastMeta, setLastMeta] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['chat-messages', threadId],
    enabled: Boolean(threadId),
    queryFn: async () => {
      const messages: Msg[] = [];
      let cursor: string | undefined;
      for (;;) {
        const q = new URLSearchParams({ limit: '100' });
        if (cursor) q.set('cursor', cursor);
        const r = await apiJson<{ messages: Msg[]; hasMore: boolean; nextCursor?: string }>(
          `/chat/threads/${threadId}/messages?${q.toString()}`,
        );
        messages.push(...r.messages);
        if (!r.hasMore || !r.nextCursor) break;
        cursor = r.nextCursor;
      }
      return { messages };
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiJson<{
        message: { content: string };
        retrievalUsed: boolean;
        dialogMemoryUsed: boolean;
      }>(`/chat/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });
      const kb = res.retrievalUsed
        ? 'База знаний: подмешаны выдержки'
        : 'База знаний: без релевантных фрагментов';
      const mem = res.dialogMemoryUsed
        ? 'Память диалога: подмешаны похожие прошлые реплики'
        : 'Память диалога: нет (мало сообщений с эмбеддингами или первые реплики)';
      setLastMeta(`${kb} · ${mem}`);
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-messages', threadId] });
      setText('');
    },
  });

  const removeThread = useMutation({
    mutationFn: async () => {
      if (!threadId) throw new Error('Нет идентификатора чата');
      return apiJson<{ ok: boolean }>(`/chat/threads/${threadId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      void qc.removeQueries({ queryKey: ['chat-messages', threadId] });
      navigate(chatPaths.root);
    },
  });

  if (!threadId) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-3 py-2 sm:px-4">
        {lastMeta ? (
          <p className="mr-auto hidden max-w-[min(100%,28rem)] truncate text-xs text-ink-muted sm:block">
            {lastMeta}
          </p>
        ) : null}
        <Button
          variant="ghost"
          className="px-2.5 py-2 text-primary hover:bg-primary-soft hover:text-primary-hover"
          disabled={removeThread.isPending || send.isPending}
          aria-label={removeThread.isPending ? 'Удаление чата…' : 'Удалить чат'}
          onClick={() => {
            if (
              !window.confirm(
                'Удалить этот чат? Все сообщения будут удалены безвозвратно.',
              )
            ) {
              return;
            }
            removeThread.mutate();
          }}
        >
          <TrashIcon
            className={`size-5 shrink-0 ${removeThread.isPending ? 'animate-pulse opacity-60' : 'opacity-90'}`}
          />
        </Button>
      </div>
      {lastMeta ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-ink-muted sm:hidden">{lastMeta}</p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        {(data?.messages ?? []).map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'USER'
                ? 'ml-4 rounded-xl bg-primary-soft px-3 py-2.5 text-sm text-ink-heading sm:ml-10'
                : 'mr-4 rounded-xl border border-border/80 bg-surface/60 px-3 py-2.5 text-sm text-ink-body sm:mr-10'
            }
          >
            {m.content}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-page/95 p-3 backdrop-blur-sm sm:flex-row sm:items-end sm:px-4 sm:py-3">
        <Textarea
          className="min-h-[5.5rem] flex-1 rounded-xl border-border bg-surface/80"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) =>
            handleEnterSubmit(e, !send.isPending && Boolean(text.trim()), () => send.mutate())
          }
          placeholder="Ваш вопрос…"
        />
        <Button
          className="shrink-0 sm:mb-0.5"
          onClick={() => send.mutate()}
          disabled={send.isPending || !text.trim()}
        >
          {send.isPending ? 'Отправка…' : 'Отправить'}
        </Button>
      </div>

      {send.isError ? (
        <p className="shrink-0 px-3 pb-2 text-sm text-red-600 sm:px-4">
          {send.error instanceof Error ? send.error.message : 'Ошибка отправки'}
        </p>
      ) : null}
      {removeThread.isError ? (
        <p className="shrink-0 px-3 pb-2 text-sm text-red-600 sm:px-4">
          {removeThread.error instanceof Error
            ? removeThread.error.message
            : 'Не удалось удалить чат'}
        </p>
      ) : null}
    </div>
  );
}
