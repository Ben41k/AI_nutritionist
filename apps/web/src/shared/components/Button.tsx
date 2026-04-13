import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'pill' | 'ghost';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50',
        variant === 'primary' &&
          'rounded-full bg-primary px-5 py-2.5 text-white shadow-[0_4px_14px_rgba(90,103,216,0.35)] hover:bg-primary-hover',
        variant === 'pill' &&
          'rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink-body hover:border-primary hover:shadow-soft',
        variant === 'ghost' &&
          'rounded-full px-3 py-2 text-sm text-ink-muted hover:bg-primary-soft hover:text-primary',
        className,
      )}
      {...props}
    />
  );
}
