import type { KeyboardEvent } from 'react';

/**
 * Enter без модификаторов (Shift оставляет перенос строки в textarea).
 * Не срабатывает во время IME-композиции.
 */
export function handleEnterSubmit(
  e: KeyboardEvent<HTMLElement>,
  canSubmit: boolean,
  onSubmit: () => void,
): void {
  if (e.key !== 'Enter' || e.shiftKey) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.repeat) return;
  if (e.nativeEvent.isComposing) return;
  if (!canSubmit) return;
  e.preventDefault();
  onSubmit();
}
