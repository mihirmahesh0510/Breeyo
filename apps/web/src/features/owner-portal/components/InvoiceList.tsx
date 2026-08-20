'use client';

import type { OwnerPortalInvoiceSummary } from '@breeyo/types';
import styles from './InvoiceList.module.css';

export interface InvoiceListProps {
  invoices: OwnerPortalInvoiceSummary[];
  selectedInvoiceIds: string[];
  onToggleSelect: (invoiceId: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
  onProceedToCheckout: () => void;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function statusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'paid') return 'Paid';
  return 'Unpaid';
}

function statusClassName(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'overdue') return styles.statusOverdue;
  if (normalized === 'paid') return styles.statusPaid;
  return styles.statusUnpaid;
}

/**
 * OWN-02, D-59: pet-scoped invoice browsing with per-row selection. The
 * caller (the Invoices tab) owns `selectedInvoiceIds` and can carry it
 * across a pet switch -- this component only ever sees one pet's invoices
 * at a time, but selections made here survive `onToggleSelect` calls made
 * while a DIFFERENT pet's invoices were rendered, which is what makes the
 * combined cross-pet checkout (D-69, D-70) possible.
 */
export function InvoiceList({
  invoices,
  selectedInvoiceIds,
  onToggleSelect,
  onOpenInvoice,
  onProceedToCheckout,
}: InvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <div className={styles.empty} data-testid="invoice-list-empty">
        <p>No invoices yet</p>
      </div>
    );
  }

  const selectedInThisList = invoices.filter((invoice) => selectedInvoiceIds.includes(invoice.invoiceId));
  const selectedTotalPaise = selectedInThisList.reduce((sum, invoice) => sum + invoice.balancePaise, 0);

  return (
    <div className={styles.list} data-testid="invoice-list">
      {invoices.map((invoice) => {
        const isSelected = selectedInvoiceIds.includes(invoice.invoiceId);
        return (
          <div key={invoice.invoiceId} className={styles.row}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={isSelected}
              onChange={() => onToggleSelect(invoice.invoiceId)}
              aria-label={`Select ${invoice.invoiceNumber ?? invoice.invoiceId}`}
              disabled={invoice.balancePaise <= 0}
            />
            <div className={styles.rowMain}>
              <div className={styles.rowTop}>
                <p className={styles.invoiceNumber}>{invoice.invoiceNumber ?? invoice.invoiceId}</p>
                <span className={`${styles.statusChip} ${statusClassName(invoice.status)}`}>
                  {statusLabel(invoice.status)}
                </span>
              </div>
              <p className={styles.balance}>
                {invoice.balancePaise > 0 ? `${formatRupees(invoice.balancePaise)} due` : 'Fully paid'}
              </p>
            </div>
            <button type="button" className={styles.viewButton} onClick={() => onOpenInvoice(invoice.invoiceId)}>
              View
            </button>
          </div>
        );
      })}

      {selectedInvoiceIds.length > 0 ? (
        <div className={styles.checkoutBar} data-testid="invoice-checkout-bar">
          <p className={styles.checkoutBarText}>
            {selectedInThisList.length} selected on this pet · {formatRupees(selectedTotalPaise)}
          </p>
          <button type="button" className={styles.checkoutBarButton} onClick={onProceedToCheckout}>
            {selectedInvoiceIds.length === 1 ? 'Pay Invoice' : 'Pay Selected Invoices'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
