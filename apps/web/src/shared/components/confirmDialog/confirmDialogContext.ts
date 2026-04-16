import { createContext } from 'react';
import type { ConfirmDialogOptions } from './confirmDialog.types';

export type ConfirmDialogContextValue = (options: ConfirmDialogOptions) => Promise<boolean>;

export const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);
