import { Card } from '@/shared/components/Card';

export function RationAiFullResponsePanel({
  fullText,
  monthLabel,
}: {
  fullText: string | null;
  monthLabel: string | null;
}) {
  return (
    <Card className="flex max-h-[min(75vh,calc(100dvh-10rem))] flex-col lg:max-h-[calc(100dvh-8rem)]">
      <h3 className="mb-2 shrink-0 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Ответ ИИ{monthLabel ? ` · ${monthLabel}` : ''}
      </h3>
      {fullText != null && fullText.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-body">
            {fullText}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          После генерации здесь будет полный текст плана по дням из ответа модели.
        </p>
      )}
    </Card>
  );
}
