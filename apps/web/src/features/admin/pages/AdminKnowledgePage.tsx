import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFormDataJson, apiJson, ApiError } from '@/shared/services/apiClient';
import { Card } from '@/shared/components/Card';
import { useToast } from '@/shared/hooks/useToast';
import { Button } from '@/shared/components/Button';
import { TrashIcon } from '@/shared/components/TrashIcon';
import { Input } from '@/shared/components/Input';
import { Textarea } from '@/shared/components/Textarea';
import { handleEnterSubmit } from '@/shared/lib/submitOnEnter';

type Doc = { id: string; title: string; createdAt: string; updatedAt: string; chunkCount: number };

type DocDetail = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  chunks: { id: string; chunkIndex: number; content: string }[];
};

export function AdminKnowledgePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [lastSavedChunks, setLastSavedChunks] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ['admin-docs'],
    queryFn: async () => {
      const documents: Doc[] = [];
      let cursor: string | undefined;
      for (;;) {
        const q = new URLSearchParams({ limit: '100' });
        if (cursor) q.set('cursor', cursor);
        const r = await apiJson<{ documents: Doc[]; hasMore: boolean; nextCursor?: string }>(
          `/admin/knowledge/documents?${q.toString()}`,
        );
        documents.push(...r.documents);
        if (!r.hasMore || !r.nextCursor) break;
        cursor = r.nextCursor;
      }
      return { documents };
    },
  });

  const detailQuery = useQuery({
    queryKey: ['admin-doc', editingId],
    enabled: Boolean(editingId),
    queryFn: () =>
      apiJson<{ document: DocDetail }>(`/admin/knowledge/documents/${editingId}`),
  });

  useEffect(() => {
    const d = detailQuery.data?.document;
    if (!d) return;
    setEditTitle(d.title);
    setEditContent(d.content);
    setLastSavedChunks(d.chunks.length);
  }, [detailQuery.data?.document]);

  useEffect(() => {
    if (!editingId || !detailQuery.isError) return;
    toast.error('Не удалось загрузить документ.');
  }, [editingId, detailQuery.isError, toast]);

  const create = useMutation({
    mutationFn: () =>
      apiJson<{ document: { id: string; title: string; chunks: number } }>(
        '/admin/knowledge/documents',
        {
          method: 'POST',
          body: JSON.stringify({ title, content }),
        },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin-docs'] });
      setTitle('');
      setContent('');
      setLastSavedChunks(res.document.chunks);
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка');
    },
  });

  const patch = useMutation({
    mutationFn: () =>
      apiJson<{ document: { id: string; title: string; chunks: number } }>(
        `/admin/knowledge/documents/${editingId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...(editTitle.trim() !== detailQuery.data?.document.title
              ? { title: editTitle.trim() }
              : {}),
            ...(editContent !== detailQuery.data?.document.content ? { content: editContent } : {}),
          }),
        },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin-docs'] });
      void qc.invalidateQueries({ queryKey: ['admin-doc', editingId] });
      setLastSavedChunks(res.document.chunks);
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка');
    },
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      if (uploadTitle.trim()) fd.append('title', uploadTitle.trim());
      return apiFormDataJson<{ document: { id: string; title: string; chunks: number } }>(
        '/admin/knowledge/documents/upload',
        fd,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-docs'] });
      setUploadTitle('');
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка загрузки');
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiJson(`/admin/knowledge/documents/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['admin-docs'] });
      if (editingId === id) {
        setEditingId(null);
        setLastSavedChunks(null);
      }
    },
  });

  const canPatch =
    Boolean(editingId) &&
    editTitle.trim().length > 0 &&
    editContent.trim().length > 0 &&
    (editTitle !== detailQuery.data?.document.title ||
      editContent !== detailQuery.data?.document.content);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (create.isPending || !title.trim() || !content.trim()) return;
            create.mutate();
          }}
        >
          <h2 className="mb-4 text-lg font-semibold text-ink-heading">Новый документ</h2>
          <p className="mb-3 text-sm text-ink-muted">
            Текст будет разбит на чанки и проиндексирован для RAG.
          </p>
          <Input
            className="mb-3 rounded-md"
            placeholder="Заголовок"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            className="mb-3 rounded-md"
            placeholder="Содержимое"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) =>
              handleEnterSubmit(
                e,
                !create.isPending && Boolean(title.trim()) && Boolean(content.trim()),
                () => create.mutate(),
              )
            }
          />
          {create.isSuccess && lastSavedChunks != null && !editingId ? (
            <p className="mb-2 text-sm text-ink-muted">
              Индексация: {lastSavedChunks} чанков (успех).
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={create.isPending || !title.trim() || !content.trim()}
          >
            {create.isPending ? 'Индексация…' : 'Загрузить'}
          </Button>
        </form>
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink-heading">Загрузка файла (.txt, .md)</h3>
          <p className="mb-3 text-xs text-ink-muted">Опционально укажите заголовок; иначе будет взято имя файла.</p>
          <Input
            className="mb-3 rounded-md"
            placeholder="Заголовок (необязательно)"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
          />
          <input
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            className="mb-3 block w-full text-sm text-ink-body file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile.mutate(f);
              e.target.value = '';
            }}
            disabled={uploadFile.isPending}
          />
          {uploadFile.isPending ? <p className="text-xs text-ink-muted">Индексация файла…</p> : null}
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink-heading">Документы</h2>
        <ul className="space-y-2">
          {(data?.documents ?? []).map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-heading">{d.title}</div>
                <div className="text-xs text-ink-muted">{d.chunkCount} чанков</div>
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-primary underline"
                  onClick={() => {
                    setEditingId(d.id);
                  }}
                >
                  Редактировать
                </button>
              </div>
              <Button
                variant="ghost"
                className="px-2.5 py-2 text-primary hover:bg-primary-soft hover:text-primary-hover"
                onClick={() => del.mutate(d.id)}
                disabled={del.isPending}
                aria-label="Удалить документ"
              >
                <TrashIcon className="size-5 shrink-0 opacity-90" />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {editingId ? (
        <Card className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink-heading">Редактирование документа</h2>
            <Button
              type="button"
              variant="ghost"
              className="text-ink-muted"
              onClick={() => {
                setEditingId(null);
              }}
            >
              Закрыть
            </Button>
          </div>
          {detailQuery.isLoading ? (
            <p className="text-sm text-ink-muted">Загрузка…</p>
          ) : detailQuery.isError ? (
            <p className="text-sm text-ink-muted">
              Не удалось загрузить документ. Закройте панель и попробуйте снова.
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (patch.isPending || !canPatch) return;
                patch.mutate();
              }}
            >
              <Input
                className="rounded-md"
                placeholder="Заголовок"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <Textarea
                className="min-h-[200px] rounded-md"
                placeholder="Содержимое"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) =>
                  handleEnterSubmit(e, !patch.isPending && canPatch, () => patch.mutate())
                }
              />
              {lastSavedChunks != null && !patch.isPending && !patch.isError ? (
                <p className="text-sm text-ink-muted">
                  Чанков в индексе: {lastSavedChunks}
                  {patch.isSuccess ? ' · последнее сохранение успешно' : ''}
                </p>
              ) : null}
              <Button type="submit" disabled={patch.isPending || !canPatch}>
                {patch.isPending ? 'Переиндексация…' : 'Сохранить'}
              </Button>
            </form>
          )}
        </Card>
      ) : null}
    </div>
  );
}
