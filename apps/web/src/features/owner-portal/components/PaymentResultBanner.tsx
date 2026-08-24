'use client';

import styles from './PaymentResultBanner.module.css';

export type PaymentReturnState = 'success' | 'failure' | 'interrupted';

export interface PaymentResultBannerProps {
  state: PaymentReturnState;
  receiptUrl?: string | null;
  onRetry?: () => void;
}

/**
 * D-71, D-72: the post-return summary for all three checkout outcomes.
 * `success` surfaces receipt access before any further navigation (it is
 * the first and only action on that banner). `failure` and `interrupted`
 * both offer retry plus clinic help (D-78, D-81's "helpful first, then
 * human support") -- they read differently to the owner (a definite failure
 * vs. an unclear/unconfirmed return) but recover the same way, since this
 * UI cannot distinguish "the payment failed" from "the webhook simply has
 * not settled yet" (see usePortalCheckout.ts and 09-06-SUMMARY.md
 * "Deviations" for why: no Razorpay `callback_url` is configured and no
 * endpoint reports live payment status back to this client).
 */
export function PaymentResultBanner({ state, receiptUrl, onRetry }: PaymentResultBannerProps) {
  if (state === 'success') {
    return (
      <div className={`${styles.banner} ${styles.success}`} role="status" data-testid="payment-result-success">
        <h2 className={styles.heading}>Payment received</h2>
        <p className={styles.body}>Thank you -- your payment has been recorded.</p>
        <div className={styles.actions}>
          {receiptUrl ? (
            <a className={styles.receiptLink} href={receiptUrl} target="_blank" rel="noopener noreferrer">
              View Receipt
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const isFailure = state === 'failure';

  return (
    <div
      className={`${styles.banner} ${isFailure ? styles.failure : styles.interrupted}`}
      role="alert"
      data-testid={isFailure ? 'payment-result-failure' : 'payment-result-interrupted'}
    >
      <h2 className={styles.heading}>{isFailure ? 'Payment didn’t go through' : 'Payment was interrupted'}</h2>
      <p className={styles.body}>
        {isFailure
          ? 'We couldn’t confirm this payment. No amount was deducted, or it will be automatically reversed.'
          : 'We didn’t get a confirmation for this payment yet. If money was deducted, it will be reflected shortly.'}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          Try Again
        </button>
      </div>
      <p className={styles.body}>Need help? Contact your clinic using the actions below.</p>
    </div>
  );
}
