import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/shared/components/Button';
import { ConfirmDialogContext } from './confirmDialogContext';
import type { ConfirmDialogOptions, ConfirmDialogTone } from './confirmDialog.types';

type OpenState = ConfirmDialogOptions & { open: true };

function toneDefaults(tone: ConfirmDialogTone | undefined) {
  const t = tone ?? 'default';
  return {
    confirmLabel: t === 'danger' ? 'Удалить' : 'ОК',
  };
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const titleId = useId();
  const descId = useId();
  const [dialog, setDialog] = useState<OpenState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialog(null);
    resolve?.(value);
  }, []);

  const requestConfirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialog({ open: true, ...options });
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, settle]);

  const tone = dialog?.tone ?? 'default';
  const { confirmLabel: defaultConfirm } = toneDefaults(dialog?.tone);
  const confirmLabel = dialog?.confirmLabel ?? defaultConfirm;
  const cancelLabel = dialog?.cancelLabel ?? 'Отмена';

  const overlay =
    dialog != null ? (
      <div
        className="fixed inset-0 z-[240] flex items-center justify-center p-4 sm:p-6"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-ink-heading/30 backdrop-blur-[3px] transition-opacity"
          aria-label="Закрыть"
          onClick={() => settle(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={dialog.title ? undefined : 'Подтвердите действие'}
          aria-labelledby={dialog.title ? titleId : undefined}
          aria-describedby={descId}
          className={clsx(
            'relative z-10 w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-[0_12px_48px_rgba(15,23,42,0.14)]',
            'animate-[toast-in_0.28s_cubic-bezier(0.22,1,0.36,1)_both]',
          )}
        >
          {dialog.title ? (
            <h2 id={titleId} className="text-lg font-semibold text-ink-heading">
              {dialog.title}
            </h2>
          ) : null}
          <p
            id={descId}
            className={clsx('text-sm leading-relaxed text-ink-body', dialog.title ? 'mt-3' : '')}
          >
            {dialog.message}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="pill" type="button" onClick={() => settle(false)}>
              {cancelLabel}
            </Button>
            {tone === 'danger' ? (
              <Button
                type="button"
                variant="pill"
                className="border border-red-200 bg-red-50 font-semibold text-red-900 hover:bg-red-100"
                onClick={() => settle(true)}
              >
                {confirmLabel}
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={() => settle(true)}>
                {confirmLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <ConfirmDialogContext.Provider value={requestConfirm}>
      {children}
      {typeof document !== 'undefined' && overlay ? createPortal(overlay, document.body) : null}
    </ConfirmDialogContext.Provider>
  );
}
