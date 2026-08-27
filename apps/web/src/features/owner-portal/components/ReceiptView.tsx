import styles from './ReceiptView.module.css';

/**
 * WR-8 (.planning/WHOLE-REPO-AUDIT-FIX-PLAN.md): mirrors
 * `PortalReceiptData` (`apps/api/src/modules/owner-portal/portal-receipt.service.ts`)
 * -- the exact shape the scoped `GET /owner-portal/:token/invoices/:invoiceId/receipt`
 * endpoint returns under its `data` envelope.
 */
export interface OwnerPortalReceiptData {
  invoiceId: string;
  receiptNumber: string;
  amountPaise: number;
  method: string;
  transactionRef: string | null;
  issuedAt: string;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Matches `VisitCard`/`UpcomingCareCard`'s `en-IN` day/month/year convention elsewhere in this feature. */
function formatIssuedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMethod(method: string): string {
  if (!method) {
    return method;
  }
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

export interface ReceiptViewProps {
  receipt: OwnerPortalReceiptData;
}

/**
 * WR-8: the formatted document rendered by the internal receipt route
 * (`apps/web/app/portal/[token]/invoice/[invoiceId]/receipt/page.tsx`) --
 * amount in rupees rather than raw paise, a human-readable issued date
 * rather than an ISO string, and no JSON in sight. Kept as a plain,
 * presentational component (all formatting is a pure function of
 * `receipt`) so it renders identically whether the page fetches
 * server-side or client-side.
 */
export function ReceiptView({ receipt }: ReceiptViewProps) {
  return (
    <div className={styles.page}>
      <div className={styles.receipt} data-testid="receipt-view">
        <h1 className={styles.heading}>Payment Receipt</h1>

        <dl className={styles.fieldList}>
          <div className={styles.field}>
            <dt className={styles.label}>Receipt No.</dt>
            <dd className={styles.value} data-testid="receipt-number">
              {receipt.receiptNumber}
            </dd>
          </div>

          <div className={styles.field}>
            <dt className={styles.label}>Amount Paid</dt>
            <dd className={`${styles.value} ${styles.amount}`} data-testid="receipt-amount">
              {formatRupees(receipt.amountPaise)}
            </dd>
          </div>

          <div className={styles.field}>
            <dt className={styles.label}>Payment Method</dt>
            <dd className={styles.value} data-testid="receipt-method">
              {formatMethod(receipt.method)}
            </dd>
          </div>

          {receipt.transactionRef ? (
            <div className={styles.field}>
              <dt className={styles.label}>Transaction Ref.</dt>
              <dd className={styles.value} data-testid="receipt-transaction-ref">
                {receipt.transactionRef}
              </dd>
            </div>
          ) : null}

          <div className={styles.field}>
            <dt className={styles.label}>Issued On</dt>
            <dd className={styles.value} data-testid="receipt-issued-at">
              {formatIssuedDate(receipt.issuedAt)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
