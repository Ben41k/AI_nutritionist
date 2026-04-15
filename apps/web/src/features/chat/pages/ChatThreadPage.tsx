import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '@/shared/services/apiClient';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Textarea } from '@/shared/components/Textarea';
import { DisclaimerBanner } from '@/shared/components/DisclaimerBanner';
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={chatPaths.root}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink-body transition hover:border-primary hover:shadow-soft"
        >
          ← К диалогам
        </Link>
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
      <DisclaimerBanner />
      {lastMeta ? <p className="text-xs text-ink-muted">{lastMeta}</p> : null}
      <Card className="flex max-h-[60vh] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {(data?.messages ?? []).map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'USER'
                  ? 'ml-8 rounded-lg bg-primary-soft px-3 py-2 text-sm text-ink-heading'
                  : 'mr-8 rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink-body'
              }
            >
              {m.content}
            </div>
          ))}
        </div>
      </Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          className="flex-1 rounded-md"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) =>
            handleEnterSubmit(e, !send.isPending && Boolean(text.trim()), () => send.mutate())
          }
          placeholder="Ваш вопрос…"
        />
        <Button
          className="sm:mb-0.5"
          onClick={() => send.mutate()}
          disabled={send.isPending || !text.trim()}
        >
          {send.isPending ? 'Отправка…' : 'Отправить'}
        </Button>
      </div>
      {send.isError ? (
        <p className="text-sm text-red-600">
          {send.error instanceof Error ? send.error.message : 'Ошибка отправки'}
        </p>
      ) : null}
      {removeThread.isError ? (
        <p className="text-sm text-red-600">
          {removeThread.error instanceof Error
            ? removeThread.error.message
            : 'Не удалось удалить чат'}
        </p>
      ) : null}
    </div>
  );
}
