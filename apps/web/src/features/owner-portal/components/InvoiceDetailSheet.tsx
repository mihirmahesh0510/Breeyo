'use client';

import type { OwnerPortalInvoiceSummary } from '@breeyo/types';
import styles from './InvoiceDetailSheet.module.css';

export interface InvoiceDetailSheetProps {
  invoice: OwnerPortalInvoiceSummary;
  onClose: () => void;
  onPay: (invoiceId: string) => void;
  receiptUrl?: string | null;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * D-54, D-55: payment status and receipt access live in invoice DETAIL, not
 * a home-screen widget, and PDF/receipt access opens from here rather than
 * a home card. `processing` (a payment link outstanding but not yet
 * settled) is inferred from `status` containing "pending" -- the API's
 * `OwnerPortalInvoiceSummary.status` mirrors billing's `InvoiceStatus`
 * (06-CONTEXT.md), which does not have a distinct "processing" value of its
 * own; a pending Razorpay leg keeps the invoice `UNPAID`/`PARTIALLY_PAID`
 * until the webhook settles it (T-06-50), so this sheet treats any
 * still-unpaid invoice with a live payment link the same as "unpaid" for
 * the Pay action, and only reads `processing` off an explicit status value
 * if one is ever introduced.
 */
export function InvoiceDetailSheet({ invoice, onClose, onPay, receiptUrl }: InvoiceDetailSheetProps) {
  const normalizedStatus = invoice.status.toLowerCase();
  const isPaid = normalizedStatus === 'paid' || invoice.balancePaise <= 0;
  const isProcessing = normalizedStatus.includes('processing') || normalizedStatus.includes('pending');

  return (
    <div className={styles.sheet} data-testid="invoice-detail-sheet" role="dialog" aria-label="Invoice detail">
      <div className={styles.header}>
        <p className={styles.invoiceNumber}>{invoice.invoiceNumber ?? invoice.invoiceId}</p>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className={styles.amountRow}>
        <span>Total</span>
        <span>{formatRupees(invoice.grandTotalPaise)}</span>
      </div>
      <div className={styles.amountRow}>
        <span>Balance</span>
        <span className={styles.balance} data-testid="invoice-detail-balance">
          {formatRupees(invoice.balancePaise)}
        </span>
      </div>

      <p>{isPaid ? 'Paid' : isProcessing ? 'Payment processing' : `Status: ${invoice.status}`}</p>

      {isPaid ? (
        receiptUrl ? (
          <a className={styles.receiptLink} href={receiptUrl} target="_blank" rel="noopener noreferrer">
            View Receipt
          </a>
        ) : null
      ) : isProcessing ? (
        <p>Your payment is being confirmed. This can take a few minutes.</p>
      ) : (
        <button type="button" className={styles.payButton} onClick={() => onPay(invoice.invoiceId)}>
          Pay Invoice
        </button>
      )}
    </div>
  );
}
