export type ToastVariant = 'error' | 'success' | 'info';

export type ToastOptions = {
  variant?: ToastVariant;
  /** Длительность показа, мс */
  duration?: number;
};

export type ToastRecord = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};
