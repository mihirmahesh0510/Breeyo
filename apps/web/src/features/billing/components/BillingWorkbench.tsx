'use client';

import { useState } from 'react';
import type { BillingInvoiceRow, BillingWorkbenchResponse } from '../hooks/useBillingWorkbench';
import { StaleStateBanner } from '../../dashboard/components/StaleStateBanner';
import { HighRiskConfirmDialog } from '../../dashboard/components/HighRiskConfirmDialog';
import styles from './BillingWorkbench.module.css';

export interface BillingWorkbenchProps {
  data: BillingWorkbenchResponse;
  /** D-24: the signed-in user about to confirm a risky action. */
  actorName: string;
  hasRealtimeStaleNotice: boolean;
  onRefresh: () => void;
  onReviewChanges: () => void;
  onCollectPayment: (invoiceId: string) => Promise<void>;
  onRefund: (invoiceId: string, amountPaise: number, reason: string) => Promise<void>;
  onVoid: (invoiceId: string, reason: string) => Promise<void>;
}

type PendingAction =
  | { kind: 'refund'; invoice: BillingInvoiceRow; step: 'form' | 'confirm'; amountPaise: number; reason: string }
  | { kind: 'void'; invoice: BillingInvoiceRow; step: 'form' | 'confirm'; reason: string };

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function InvoiceTable({
  title,
  rows,
  refundAllowed,
  voidAllowed,
  isSubmitting,
  onCollectPayment,
  onRequestRefund,
  onRequestVoid,
}: {
  title: string;
  rows: BillingInvoiceRow[];
  refundAllowed: boolean;
  voidAllowed: boolean;
  isSubmitting: boolean;
  onCollectPayment: (invoiceId: string) => void;
  onRequestRefund: (row: BillingInvoiceRow) => void;
  onRequestVoid: (row: BillingInvoiceRow) => void;
}) {
  return (
    <section aria-label={title} className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {rows.length === 0 ? (
        <p className={styles.emptyText}>Nothing here right now.</p>
      ) : (
        <table className={styles.table} aria-label={`${title} invoices`}>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Pet</th>
              <th>Owner</th>
              <th>Balance</th>
              <th>Due</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`invoice-row-${row.id}`}>
                <td>{row.invoiceNumber ?? row.id}</td>
                <td>{row.petName ?? '—'}</td>
                <td>{row.ownerName ?? '—'}</td>
                <td>{formatRupees(row.balancePaise)}</td>
                <td>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</td>
                <td>
                  <span className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={isSubmitting}
                      onClick={() => onCollectPayment(row.id)}
                    >
                      Collect Payment
                    </button>
                    {/* D-22/D-20: refund and void are omitted from the render tree entirely, not disabled, unless the server said this caller may see them. */}
                    {refundAllowed ? (
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.destructiveButton}`}
                        disabled={isSubmitting}
                        onClick={() => onRequestRefund(row)}
                      >
                        Refund
                      </button>
                    ) : null}
                    {voidAllowed ? (
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.destructiveButton}`}
                        disabled={isSubmitting}
                        onClick={() => onRequestVoid(row)}
                      >
                        Void
                      </button>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * D-22, D-24, D-40, D-42, D-43: the browser billing workbench. Supports
 * collect-payment for both Front Desk and Admin (D-05), unpaid/overdue
 * review, payment history with actor attribution (D-24), and refund/void
 * only when the server-derived `refundAllowed`/`voidAllowed` are true --
 * this component never computes that itself.
 *
 * Refund and void both go through the same two-step pattern
 * `RiskyStockChangeDialog` established in Plan 09-03: an inline reason (and,
 * for refund, amount) form first, then the shared `HighRiskConfirmDialog`
 * with the exact 09-UI-SPEC.md destructive-confirmation copy and the acting
 * user's name and timestamp visible before they can confirm.
 */
export function BillingWorkbench({
  data,
  actorName,
  hasRealtimeStaleNotice,
  onRefresh,
  onReviewChanges,
  onCollectPayment,
  onRefund,
  onVoid,
}: BillingWorkbenchProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showStaleBanner = data.staleState === 'stale' || hasRealtimeStaleNotice;

  const handleCollectPayment = async (invoiceId: string) => {
    setIsSubmitting(true);
    try {
      await onCollectPayment(invoiceId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeDialog = () => setPendingAction(null);

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setIsSubmitting(true);
    try {
      if (pendingAction.kind === 'refund') {
        await onRefund(pendingAction.invoice.id, pendingAction.amountPaise, pendingAction.reason);
      } else {
        await onVoid(pendingAction.invoice.id, pendingAction.reason);
      }
      setPendingAction(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {showStaleBanner ? <StaleStateBanner status="stale" onRefresh={onRefresh} onReviewChanges={onReviewChanges} /> : null}

      <InvoiceTable
        title="Unpaid"
        rows={data.unpaid}
        refundAllowed={data.refundAllowed}
        voidAllowed={data.voidAllowed}
        isSubmitting={isSubmitting}
        onCollectPayment={handleCollectPayment}
        onRequestRefund={(invoice) => setPendingAction({ kind: 'refund', invoice, step: 'form', amountPaise: invoice.balancePaise, reason: '' })}
        onRequestVoid={(invoice) => setPendingAction({ kind: 'void', invoice, step: 'form', reason: '' })}
      />

      <InvoiceTable
        title="Overdue"
        rows={data.overdue}
        refundAllowed={data.refundAllowed}
        voidAllowed={data.voidAllowed}
        isSubmitting={isSubmitting}
        onCollectPayment={handleCollectPayment}
        onRequestRefund={(invoice) => setPendingAction({ kind: 'refund', invoice, step: 'form', amountPaise: invoice.balancePaise, reason: '' })}
        onRequestVoid={(invoice) => setPendingAction({ kind: 'void', invoice, step: 'form', reason: '' })}
      />

      <section aria-label="Recent Payments" className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent Payments</h2>
        {data.recentPayments.length === 0 ? (
          <p className={styles.emptyText}>No payments recorded yet.</p>
        ) : (
          <ul className={styles.list}>
            {data.recentPayments.map((payment) => (
              <li key={payment.paymentId} className={styles.paymentRow}>
                <span>{payment.invoiceNumber ?? payment.invoiceId}</span>
                <span>{payment.petName ?? '—'}</span>
                <span>{formatRupees(payment.amountPaise)}</span>
                {/* D-24: actor + timestamp beside the history row, not only in a backend log. */}
                <span>
                  {payment.recordedByName ? `Recorded by ${payment.recordedByName}` : 'Recorded by system'}
                  {payment.paidAt ? ` · ${new Date(payment.paidAt).toLocaleString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingAction && pendingAction.step === 'form' ? (
        <div className={styles.overlay}>
          <div className={styles.panel} role="dialog" aria-modal="true" aria-label={`${pendingAction.kind === 'refund' ? 'Refund' : 'Void'} invoice ${pendingAction.invoice.invoiceNumber ?? ''}`}>
            <h2 className={styles.panelTitle}>
              {pendingAction.kind === 'refund' ? 'Refund payment' : 'Void invoice'} — {pendingAction.invoice.invoiceNumber ?? pendingAction.invoice.id}
            </h2>

            {pendingAction.kind === 'refund' ? (
              <>
                <label className={styles.label} htmlFor="refund-amount">
                  Amount (paise)
                </label>
                <input
                  id="refund-amount"
                  className={styles.input}
                  type="number"
                  value={pendingAction.amountPaise}
                  onChange={(event) =>
                    setPendingAction({ ...pendingAction, amountPaise: Number(event.target.value) })
                  }
                />
              </>
            ) : null}

            <label className={styles.label} htmlFor="risky-action-reason">
              Reason
            </label>
            <textarea
              id="risky-action-reason"
              className={styles.textarea}
              value={pendingAction.reason}
              onChange={(event) => setPendingAction({ ...pendingAction, reason: event.target.value })}
            />

            <div className={styles.dialogActions}>
              <button type="button" className={styles.cancelButton} onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.continueButton}
                disabled={!pendingAction.reason || (pendingAction.kind === 'refund' && pendingAction.amountPaise <= 0)}
                onClick={() => setPendingAction({ ...pendingAction, step: 'confirm' })}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingAction && pendingAction.step === 'confirm' ? (
        <HighRiskConfirmDialog
          open
          title={pendingAction.kind === 'refund' ? 'Refund payment' : 'Void invoice'}
          // 09-UI-SPEC.md "Destructive confirmation" copy, verbatim.
          message={
            pendingAction.kind === 'refund'
              ? `Refund ${formatRupees(pendingAction.amountPaise)} for invoice ${pendingAction.invoice.invoiceNumber ?? pendingAction.invoice.id}? This cannot be cancelled after submission.`
              : `Void invoice ${pendingAction.invoice.invoiceNumber ?? pendingAction.invoice.id}? This keeps the audit trail and may return stock.`
          }
          actorName={actorName}
          timestamp={new Date().toISOString()}
          confirmLabel={pendingAction.kind === 'refund' ? 'Confirm Refund' : 'Confirm Void'}
          isLoading={isSubmitting}
          onConfirm={confirmPendingAction}
          onCancel={closeDialog}
        />
      ) : null}
    </div>
  );
}
