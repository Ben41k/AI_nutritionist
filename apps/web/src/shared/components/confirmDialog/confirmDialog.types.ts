export type ConfirmDialogTone = 'default' | 'danger';

export type ConfirmDialogOptions = {
  /** Короткий заголовок; если не задан — показывается только текст */
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
};
