'use client';

import { useState } from 'react';
import { HighRiskConfirmDialog } from '../../dashboard/components/HighRiskConfirmDialog';
import styles from './RiskyStockChangeDialog.module.css';

/** Mirrors `ADJUSTMENT_REASON_VALUES` (`@breeyo/types`) -- kept as a local literal list rather than importing the runtime constant, matching this plan's choice to keep the web workbench's contract local to `apps/web` and the API module. */
const ADJUSTMENT_REASONS = ['damage', 'theft', 'correction', 'expired_disposal', 'stock_take', 'other'] as const;

export interface RiskyStockChangeDialogProps {
  open: boolean;
  itemName: string;
  /** D-24: the signed-in user about to make this change -- shown before they can confirm it. */
  actorName: string;
  isLoading?: boolean;
  onConfirm: (reason: string, notes: string) => void;
  onCancel: () => void;
}

/**
 * D-34: stock decreases, batch removals, and override actions route through
 * here instead of an inline table edit. D-24: this builds on Plan 09-02's
 * shared `HighRiskConfirmDialog` for the final confirmation step rather than
 * inventing a second strong-confirmation primitive, and adds the one thing
 * that dialog doesn't carry -- reason capture -- as a first step before the
 * acting user and timestamp become visible.
 */
export function RiskyStockChangeDialog({
  open,
  itemName,
  actorName,
  isLoading = false,
  onConfirm,
  onCancel,
}: RiskyStockChangeDialogProps) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'reason' | 'confirm'>('reason');

  if (!open) {
    return null;
  }

  const handleCancel = () => {
    setStep('reason');
    setReason('');
    setNotes('');
    onCancel();
  };

  if (step === 'confirm') {
    return (
      <HighRiskConfirmDialog
        open={open}
        title={`Adjust stock — ${itemName}`}
        message={`Apply this stock change? Reason: ${reason.replace(/_/g, ' ')}. Reason and actor will be recorded.`}
        actorName={actorName}
        timestamp={new Date().toISOString()}
        confirmLabel="Apply Change"
        isLoading={isLoading}
        onConfirm={() => onConfirm(reason, notes)}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={`Adjust stock for ${itemName}`}>
        <h2 className={styles.title}>Adjust stock — {itemName}</h2>

        <label className={styles.label} htmlFor="risky-stock-change-reason">
          Reason
        </label>
        <select
          id="risky-stock-change-reason"
          className={styles.select}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          <option value="">Select a reason</option>
          {ADJUSTMENT_REASONS.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="risky-stock-change-notes">
          Notes (optional)
        </label>
        <textarea
          id="risky-stock-change-notes"
          className={styles.textarea}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.continueButton}
            disabled={!reason}
            onClick={() => setStep('confirm')}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
