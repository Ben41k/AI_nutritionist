import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink-heading outline-none ring-primary/30 placeholder:text-ink-muted focus:border-primary focus:ring-2',
        className,
      )}
      {...props}
    />
  );
}
