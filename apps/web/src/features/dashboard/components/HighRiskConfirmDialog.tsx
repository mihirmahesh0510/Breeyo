'use client';

import styles from './HighRiskConfirmDialog.module.css';

export interface HighRiskConfirmDialogProps {
  open: boolean;
  title: string;
  /** The exact 09-UI-SPEC.md "Destructive confirmation" copy for this action (refund/void/stock-change/access-change/cancel). */
  message: string;
  /** D-24: who last touched the thing this dialog is about to change, and when -- rendered here, not only in a backend log. */
  actorName?: string;
  timestamp?: string;
  confirmLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * D-23: the strong-confirmation contract for refunds, invoice voids, stock
 * corrections, and browser-access edits -- everything else on the browser
 * dashboard stays fast and inline (no dialog). D-24: actor + timestamp are
 * part of the confirmation surface itself, not just something a caller could
 * look up in a separate audit screen.
 */
export function HighRiskConfirmDialog({
  open,
  title,
  message,
  actorName,
  timestamp,
  confirmLabel = 'Confirm',
  isLoading = false,
  onConfirm,
  onCancel,
}: HighRiskConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const hasActorInfo = Boolean(actorName || timestamp);

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>

        {hasActorInfo ? (
          <p className={styles.actorRow} data-testid="actor-timestamp">
            {actorName ? `Last changed by ${actorName}` : null}
            {actorName && timestamp ? ' · ' : null}
            {timestamp ? new Date(timestamp).toLocaleString() : null}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
          <button type="button" className={styles.confirmButton} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
