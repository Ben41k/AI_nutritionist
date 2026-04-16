import { createContext } from 'react';
import type { ToastOptions } from './toast.types';

export type ToastContextValue = {
  show: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: Omit<ToastOptions, 'variant'>) => void;
  success: (message: string, options?: Omit<ToastOptions, 'variant'>) => void;
  dismiss: (id: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);
