'use client';

import styles from './OwnerSummaryCard.module.css';
import { UpcomingCareCard, type UpcomingCareCardProps } from './UpcomingCareCard';

export interface OwnerSummaryRecentVisit {
  visitDate: string;
  visitReason: string | null;
  diagnosisGloss: string | null;
}

export interface OwnerSummaryCardProps {
  totalDuePaise: number;
  recentVisit?: OwnerSummaryRecentVisit | null;
  /** OWN-07, D-49: upcoming vaccination/deworming due dates + next
   * appointment, rendered below the due/recent-visit sections. Optional so
   * every existing OwnerSummaryCard caller keeps compiling untouched. */
  careDates?: UpcomingCareCardProps | null;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * D-47 to D-51: the Overview-tab summary block. When both an unpaid balance
 * AND a recent clinical update exist, both sections render together with
 * equal visual weight (neither dominates) -- this is the "combined" state
 * from the component inventory. When only one exists, only that section
 * renders ("payments-only" / "records-only"); when neither exists AND no
 * `careDates` was supplied, the caller (the Overview page) simply does not
 * render this card at all and falls through to the pet-snapshot-first empty
 * guidance. `careDates` (OWN-07) keeps the card mounted on its own -- D-49's
 * "rich medical preview" posture means upcoming care dates are worth
 * showing even for a pet with no due balance and no recent visit yet.
 */
export function OwnerSummaryCard({ totalDuePaise, recentVisit, careDates }: OwnerSummaryCardProps) {
  const hasDue = totalDuePaise > 0;
  const hasRecentVisit = !!recentVisit;
  const hasCareDates = !!careDates;

  if (!hasDue && !hasRecentVisit && !hasCareDates) {
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

      {(hasDue || hasRecentVisit) && hasCareDates ? <hr className={styles.divider} /> : null}

      {careDates ? (
        <UpcomingCareCard
          vaccinations={careDates.vaccinations}
          deworming={careDates.deworming}
          nextAppointment={careDates.nextAppointment}
        />
      ) : null}
    </div>
  );
}
