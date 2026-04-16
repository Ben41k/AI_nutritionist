import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { ToastContext, type ToastContextValue } from './toastContext';
import { TOAST_DEFAULT_DURATION_MS, TOAST_MAX_VISIBLE } from './toast.constants';
import type { ToastOptions, ToastRecord, ToastVariant } from './toast.types';

type ToastState = { visible: ToastRecord[]; queue: ToastRecord[] };

type ToastAction =
  | { type: 'push'; toast: ToastRecord }
  | { type: 'remove'; id: string };

function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'push': {
      const t = action.toast;
      if (state.visible.length < TOAST_MAX_VISIBLE) {
        return { ...state, visible: [...state.visible, t] };
      }
      return { ...state, queue: [...state.queue, t] };
    }
    case 'remove': {
      const visible = state.visible.filter((x) => x.id !== action.id);
      const queue = [...state.queue];
      while (visible.length < TOAST_MAX_VISIBLE && queue.length > 0) {
        const next = queue.shift();
        if (next) visible.push(next);
      }
      return { visible, queue };
    }
    default:
      return state;
  }
}

function newToastId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const common = 'size-[18px] shrink-0';
  if (variant === 'success') {
    return (
      <svg className={clsx(common, 'text-emerald-600')} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M20 6L9 17l-5-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (variant === 'info') {
    return (
      <svg className={clsx(common, 'text-primary')} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 10v6M12 7h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={clsx(common, 'text-rose-600')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      className={clsx(
        'pointer-events-auto relative flex max-w-[min(100vw-2rem,22rem)] gap-3 overflow-hidden rounded-2xl border bg-surface/95 px-3.5 py-3 pr-9 shadow-card backdrop-blur-sm',
        'animate-toast-in',
        toast.variant === 'error' && 'border-rose-200/80',
        toast.variant === 'success' && 'border-emerald-200/80',
        toast.variant === 'info' && 'border-border',
      )}
    >
      <div className="mt-0.5">
        <ToastIcon variant={toast.variant} />
      </div>
      <p className="min-w-0 flex-1 text-sm leading-snug text-ink-heading">{toast.message}</p>
      <button
        type="button"
        className="absolute right-2 top-2 rounded-lg p-1 text-ink-muted transition hover:bg-page hover:text-ink-heading"
        aria-label="Закрыть уведомление"
        onClick={() => onDismiss(toast.id)}
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-border/60">
        <div
          key={toast.id}
          className={clsx(
            'h-full origin-left animate-toast-progress',
            toast.variant === 'error' && 'bg-rose-500/70',
            toast.variant === 'success' && 'bg-emerald-500/70',
            toast.variant === 'info' && 'bg-primary/70',
          )}
          style={
            {
              '--toast-dur': `${toast.duration}ms`,
            } as CSSProperties & { '--toast-dur': string }
          }
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, { visible: [], queue: [] });
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scheduledForVisibleRef = useRef<Set<string>>(new Set());

  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      scheduledForVisibleRef.current.delete(id);
      dispatch({ type: 'remove', id });
    },
    [clearTimer],
  );

  const show = useCallback((message: string, options?: ToastOptions) => {
    const variant = options?.variant ?? 'info';
    const duration = Math.min(
      Math.max(options?.duration ?? TOAST_DEFAULT_DURATION_MS, 2000),
      8000,
    );
    const toast: ToastRecord = {
      id: newToastId(),
      message,
      variant,
      duration,
    };
    dispatch({ type: 'push', toast });
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      error: (message, options) => show(message, { ...options, variant: 'error' }),
      success: (message, options) => show(message, { ...options, variant: 'success' }),
      dismiss,
    }),
    [dismiss, show],
  );

  useEffect(() => {
    for (const t of state.visible) {
      if (scheduledForVisibleRef.current.has(t.id)) continue;
      scheduledForVisibleRef.current.add(t.id);
      const timer = setTimeout(() => {
        scheduledForVisibleRef.current.delete(t.id);
        timersRef.current.delete(t.id);
        dispatch({ type: 'remove', id: t.id });
      }, t.duration);
      timersRef.current.set(t.id, timer);
    }
  }, [state.visible]);

  useEffect(() => {
    const timerMap = timersRef.current;
    const scheduled = scheduledForVisibleRef.current;
    return () => {
      for (const handle of timerMap.values()) {
        clearTimeout(handle);
      }
      timerMap.clear();
      scheduled.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[200] flex max-h-[min(70vh,calc(100vh-5rem))] w-[min(100vw-2rem,22rem)] flex-col-reverse gap-2 sm:bottom-6 sm:right-6"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {state.visible.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
