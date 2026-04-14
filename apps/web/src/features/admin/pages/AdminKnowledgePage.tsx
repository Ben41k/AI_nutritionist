import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, ApiError } from '@/shared/services/apiClient';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { TrashIcon } from '@/shared/components/TrashIcon';
import { Input } from '@/shared/components/Input';
import { Textarea } from '@/shared/components/Textarea';

type Doc = { id: string; title: string; createdAt: string; updatedAt: string; chunkCount: number };

export function AdminKnowledgePage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin-docs'],
    queryFn: () => apiJson<{ documents: Doc[] }>('/admin/knowledge/documents'),
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson<{ document: { id: string; title: string; chunks: number } }>(
        '/admin/knowledge/documents',
        {
          method: 'POST',
          body: JSON.stringify({ title, content }),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-docs'] });
      setTitle('');
      setContent('');
      setError(null);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Ошибка');
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiJson(`/admin/knowledge/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-docs'] }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
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
        />
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || !title.trim() || !content.trim()}
        >
          {create.isPending ? 'Индексация…' : 'Загрузить'}
        </Button>
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink-heading">Документы</h2>
        <ul className="space-y-2">
          {(data?.documents ?? []).map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-ink-heading">{d.title}</div>
                <div className="text-xs text-ink-muted">{d.chunkCount} чанков</div>
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
    </div>
  );
}
