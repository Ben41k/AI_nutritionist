import clsx from 'clsx';
import type { TextareaHTMLAttributes } from 'react';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        'min-h-[120px] w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-ink-heading outline-none ring-primary/30 placeholder:text-ink-muted focus:border-primary focus:ring-2',
        className,
      )}
      {...props}
    />
  );
}
