'use client';

import styles from './OwnerSummaryCard.module.css';

export interface OwnerSummaryRecentVisit {
  visitDate: string;
  visitReason: string | null;
  diagnosisGloss: string | null;
}

export interface OwnerSummaryCardProps {
  totalDuePaise: number;
  recentVisit?: OwnerSummaryRecentVisit | null;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * D-47 to D-51: the Overview-tab summary block. When both an unpaid balance
 * AND a recent clinical update exist, both sections render together with
 * equal visual weight (neither dominates) -- this is the "combined" state
 * from the component inventory. When only one exists, only that section
 * renders ("payments-only" / "records-only"); when neither exists, the
 * caller (the Overview page) simply does not render this card at all and
 * falls through to the pet-snapshot-first empty guidance.
 */
export function OwnerSummaryCard({ totalDuePaise, recentVisit }: OwnerSummaryCardProps) {
  const hasDue = totalDuePaise > 0;
  const hasRecentVisit = !!recentVisit;

  if (!hasDue && !hasRecentVisit) {
    return null;
  }

  return (
    <div className={styles.card} data-testid="owner-summary-card">
      {hasDue ? (
        <div className={styles.section} data-testid="owner-summary-due">
          <p className={styles.sectionHeading}>Total due</p>
          <p className={styles.dueAmount}>{formatRupees(totalDuePaise)}</p>
          <p className={styles.dueMeta}>Open Invoices to review and pay.</p>
        </div>
      ) : null}

      {hasDue && hasRecentVisit ? <hr className={styles.divider} /> : null}

      {hasRecentVisit && recentVisit ? (
        <div className={styles.section} data-testid="owner-summary-recent-visit">
          <p className={styles.sectionHeading}>Recent update</p>
          <p className={styles.recentVisitText}>
            {recentVisit.visitReason ?? 'Recent visit'}
            {recentVisit.diagnosisGloss ? ` — ${recentVisit.diagnosisGloss}` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}
