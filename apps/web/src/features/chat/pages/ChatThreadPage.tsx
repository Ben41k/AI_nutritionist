import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '@/shared/services/apiClient';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getStoredRationPlanPlainText } from '@/features/ration/lib/rationSessionStorage';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Textarea } from '@/shared/components/Textarea';
import { TrashIcon } from '@/shared/components/TrashIcon';
import { chatPaths } from '@/features/chat/routes';
import { handleEnterSubmit } from '@/shared/lib/submitOnEnter';
import { ChatAssistantMarkdown } from '@/features/chat/components/ChatAssistantMarkdown';

type Msg = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
};

type ChatThreadSummary = { id: string; title: string | null; updatedAt: string };

export function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: user } = useAuth();
  const [text, setText] = useState('');
  const [lastMeta, setLastMeta] = useState<string | null>(null);
  const [optimisticUserContent, setOptimisticUserContent] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleBlurSkipRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const threadQuery = useQuery({
    queryKey: ['chat-thread', threadId],
    enabled: Boolean(threadId),
    queryFn: () => apiJson<{ thread: ChatThreadSummary }>(`/chat/threads/${threadId}`),
  });
  const threadData = threadQuery.data;

  const renameThread = useMutation({
    mutationFn: async (title: string) => {
      if (!threadId) throw new Error('Нет идентификатора чата');
      return apiJson<{ thread: ChatThreadSummary }>(`/chat/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(['chat-thread', threadId], { thread: res.thread });
      void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      setEditingTitle(false);
    },
  });

  const send = useMutation({
    mutationFn: async (content: string) => {
      const rationText = user?.id ? getStoredRationPlanPlainText(user.id) : null;
      return apiJson<{
        message: { content: string };
        retrievalUsed: boolean;
        dialogMemoryUsed: boolean;
        threadTitle?: string;
      }>(`/chat/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          ...(rationText ? { clientRationPlanText: rationText } : {}),
        }),
      });
    },
    onMutate: (content) => {
      setOptimisticUserContent(content);
      setText('');
      return { previousContent: content };
    },
    onSuccess: async (res) => {
      const kb = res.retrievalUsed
        ? 'База знаний: подмешаны выдержки'
        : 'База знаний: без релевантных фрагментов';
      const mem = res.dialogMemoryUsed
        ? 'Память диалога: подмешаны похожие прошлые реплики'
        : 'Память диалога: нет (мало сообщений с эмбеддингами или первые реплики)';
      setLastMeta(`${kb} · ${mem}`);
      if (typeof res.threadTitle === 'string' && res.threadTitle.length > 0 && threadId) {
        qc.setQueryData(['chat-thread', threadId], (prev) => {
          const base: ChatThreadSummary = prev?.thread ?? {
            id: threadId,
            title: null,
            updatedAt: new Date().toISOString(),
          };
          return { thread: { ...base, title: res.threadTitle } };
        });
        void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      }
      try {
        await qc.invalidateQueries({ queryKey: ['chat-messages', threadId] });
      } finally {
        setOptimisticUserContent(null);
      }
    },
    onError: (_err, _content, ctx) => {
      setOptimisticUserContent(null);
      if (ctx?.previousContent) setText(ctx.previousContent);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [data?.messages, optimisticUserContent, send.isPending]);

  useEffect(() => {
    setEditingTitle(false);
  }, [threadId]);

  const removeThread = useMutation({
    mutationFn: async () => {
      if (!threadId) throw new Error('Нет идентификатора чата');
      return apiJson<{ ok: boolean }>(`/chat/threads/${threadId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-threads'] });
      void qc.removeQueries({ queryKey: ['chat-messages', threadId] });
      void qc.removeQueries({ queryKey: ['chat-thread', threadId] });
      navigate(chatPaths.root);
    },
  });

  if (!threadId) return null;

  const headerTitle =
    threadQuery.isPending && !editingTitle
      ? 'Загрузка…'
      : threadData?.thread.title?.trim() || 'Чат';

  const beginTitleEdit = () => {
    setTitleDraft(threadData?.thread.title?.trim() || '');
    setEditingTitle(true);
  };

  const commitTitleEdit = () => {
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0) {
      setEditingTitle(false);
      return;
    }
    const current = threadData?.thread.title?.trim() ?? '';
    if (trimmed === current) {
      setEditingTitle(false);
      return;
    }
    renameThread.mutate(trimmed.slice(0, 200));
  };

  const cancelTitleEdit = () => {
    titleBlurSkipRef.current = true;
    setEditingTitle(false);
    setTitleDraft(threadData?.thread.title?.trim() ?? '');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <Input
              className="max-w-full rounded-lg py-2 text-sm sm:max-w-md"
              value={titleDraft}
              autoFocus
              maxLength={200}
              disabled={renameThread.isPending}
              aria-label="Название чата"
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTitleEdit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelTitleEdit();
                }
              }}
              onBlur={() => {
                if (titleBlurSkipRef.current) {
                  titleBlurSkipRef.current = false;
                  return;
                }
                if (!renameThread.isPending) commitTitleEdit();
              }}
            />
          ) : (
            <button
              type="button"
              className="block max-w-full truncate text-left text-sm font-semibold text-ink-heading hover:text-primary sm:text-base"
              title="Нажмите, чтобы переименовать"
              disabled={send.isPending || removeThread.isPending}
              onClick={beginTitleEdit}
            >
              {headerTitle}
            </button>
          )}
        </div>
        {lastMeta ? (
          <p className="hidden max-w-[min(100%,20rem)] shrink-0 truncate text-xs text-ink-muted sm:block">
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
            {m.role === 'ASSISTANT' ? (
              <ChatAssistantMarkdown text={m.content} />
            ) : (
              m.content
            )}
          </div>
        ))}
        {optimisticUserContent ? (
          <div className="ml-4 rounded-xl bg-primary-soft px-3 py-2.5 text-sm text-ink-heading sm:ml-10">
            {optimisticUserContent}
          </div>
        ) : null}
        {send.isPending && optimisticUserContent ? (
          <div
            className="mr-4 rounded-xl border border-border/80 bg-surface/60 px-3 py-2.5 text-sm text-ink-muted sm:mr-10"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="inline-flex items-center gap-2">
              <span>Печатает</span>
              <span className="inline-flex translate-y-px gap-0.5">
                <span className="size-1.5 animate-bounce rounded-full bg-ink-muted/70 [animation-duration:1s] [animation-delay:0ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-ink-muted/70 [animation-duration:1s] [animation-delay:150ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-ink-muted/70 [animation-duration:1s] [animation-delay:300ms]" />
              </span>
            </span>
          </div>
        ) : null}
        <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-page/95 p-3 backdrop-blur-sm sm:flex-row sm:items-end sm:px-4 sm:py-3">
        <Textarea
          className="min-h-[5.5rem] flex-1 rounded-xl border-border bg-surface/80"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) =>
            handleEnterSubmit(e, !send.isPending && Boolean(text.trim()), () => {
              const c = text.trim();
              if (c) send.mutate(c);
            })
          }
          placeholder="Ваш вопрос…"
        />
        <Button
          className="shrink-0 sm:mb-0.5"
          onClick={() => {
            const c = text.trim();
            if (c) send.mutate(c);
          }}
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
      {renameThread.isError ? (
        <p className="shrink-0 px-3 pb-2 text-sm text-red-600 sm:px-4">
          {renameThread.error instanceof Error
            ? renameThread.error.message
            : 'Не удалось сохранить название'}
        </p>
      ) : null}
    </div>
  );
}
