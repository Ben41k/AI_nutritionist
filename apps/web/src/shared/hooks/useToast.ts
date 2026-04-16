import { useContext } from 'react';
import { ToastContext } from '@/shared/components/toasts/toastContext';

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
