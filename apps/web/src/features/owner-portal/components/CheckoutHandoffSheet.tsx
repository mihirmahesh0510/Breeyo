'use client';

import styles from './CheckoutHandoffSheet.module.css';

export interface CheckoutHandoffPetBreakdownEntry {
  petId: string;
  petName: string | null;
  invoiceIds: string[];
  amountPaise: number;
}

export interface CheckoutHandoffSheetProps {
  amountDuePaise: number;
  petBreakdown: CheckoutHandoffPetBreakdownEntry[];
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * D-66, D-69, D-70: the explicit pre-Razorpay handoff -- amount, the exact
 * invoices included (via each pet-breakdown entry's `invoiceIds.length`),
 * a per-pet breakdown, and a concise "secure external payment" note, all
 * shown BEFORE the owner ever leaves the portal for Razorpay.
 */
export function CheckoutHandoffSheet({
  amountDuePaise,
  petBreakdown,
  isSubmitting,
  onConfirm,
  onCancel,
}: CheckoutHandoffSheetProps) {
  const invoiceCount = petBreakdown.reduce((sum, entry) => sum + entry.invoiceIds.length, 0);
  const confirmLabel = invoiceCount === 1 ? 'Pay Invoice' : 'Pay Selected Invoices';

  return (
    <div className={styles.sheet} data-testid="checkout-handoff-sheet" role="dialog" aria-label="Confirm payment">
      <h2 className={styles.heading}>Review before you pay</h2>
      <p className={styles.amount} data-testid="checkout-total-amount">
        {formatRupees(amountDuePaise)}
      </p>

      <ul className={styles.breakdownList}>
        {petBreakdown.map((entry) => (
          <li key={entry.petId} className={styles.breakdownRow}>
            <span>
              {entry.petName ?? 'Pet'} ({entry.invoiceIds.length} {entry.invoiceIds.length === 1 ? 'invoice' : 'invoices'})
            </span>
            <span>{formatRupees(entry.amountPaise)}</span>
          </li>
        ))}
      </ul>

      <p className={styles.secureNote}>
        This opens a secure external payment page (Razorpay). You&rsquo;ll return to this portal afterward.
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="button" className={styles.confirmButton} onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? 'Preparing…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
