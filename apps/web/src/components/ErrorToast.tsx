'use client';

import styles from './ErrorToast.module.css';

export interface ErrorToastProps {
  /** `null`/`undefined` renders nothing -- this component has no other visibility toggle. */
  message: string | null | undefined;
  onDismiss: () => void;
}

/**
 * D-42/D-43: browser live updates are inline-first (`StaleStateBanner`,
 * `HighRiskConfirmDialog`); toasts are reserved for failures and
 * action-blocking exceptions. This is that one reserved case -- a mutation
 * (collect-payment, refund, void, queue-status-update, stock-adjust) that
 * rejected and would otherwise fail silently from an unawaited `onClick`.
 *
 * Shared under `apps/web/src/components/` rather than duplicated per
 * feature (contrast `StaleStateBanner`/`HighRiskConfirmDialog`, which live
 * under `features/dashboard/components/` but are still imported by
 * billing/queue/inventory) because this exact primitive is needed by
 * billing, queue, and inventory with no per-feature variation at all --
 * unlike those two, which are feature-owned components that happen to be
 * reused, this one has no natural feature owner.
 */
export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className={styles.toast} role="alert" data-testid="error-toast">
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.dismissButton} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
