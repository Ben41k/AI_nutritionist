import { useContext } from 'react';
import { ConfirmDialogContext } from '@/shared/components/confirmDialog/confirmDialogContext';

export function useConfirmDialog() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  }
  return ctx;
}
