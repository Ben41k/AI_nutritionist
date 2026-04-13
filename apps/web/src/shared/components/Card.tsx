import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export function Card({
  className,
  lavender,
  ...props
}: HTMLAttributes<HTMLDivElement> & { lavender?: boolean }) {
  return (
    <div
      className={clsx(
        'rounded-card p-6 shadow-card',
        lavender ? 'bg-lavender' : 'bg-surface',
        className,
      )}
      {...props}
    />
  );
}
