import { colors } from '../../theme/colors';

// --- Testable exports ---

export type ToastType = 'success' | 'error' | 'info';

export interface ToastConfig {
  backgroundColor: string;
  textColor: string;
  icon: string;
}

export const toastConfig: Record<ToastType, ToastConfig> = {
  success: {
    backgroundColor: colors.primaryContainer,
    textColor: colors.onPrimaryContainer,
    icon: 'check-circle',
  },
  error: {
    backgroundColor: colors.errorContainer,
    textColor: colors.onErrorContainer,
    icon: 'alert-circle',
  },
  info: {
    backgroundColor: colors.surfaceVariant,
    textColor: colors.onSurfaceVariant,
    icon: 'information',
  },
};

export interface ToastMessage {
  type: ToastType;
  message: string;
  duration?: number;
}

/** Queue of toast messages; consumed by a Snackbar host in the app shell. */
let toastQueue: ToastMessage[] = [];
let listener: ((msg: ToastMessage) => void) | null = null;

export function showToast(
  type: ToastType,
  message: string,
  duration = 3000,
): void {
  const toast: ToastMessage = { type, message, duration };
  if (listener) {
    listener(toast);
  } else {
    toastQueue.push(toast);
  }
}

export function onToast(cb: (msg: ToastMessage) => void): () => void {
  listener = cb;
  // Flush queued messages
  toastQueue.forEach(cb);
  toastQueue = [];
  return () => {
    listener = null;
  };
}
