'use client';

import { VisitCard, type VisitCardEntry } from './VisitCard';
import styles from './VisitTimeline.module.css';

export interface VisitTimelineProps {
  visits: VisitCardEntry[];
}

/**
 * D-61, OWN-01: read-only visit history rendered as a timeline (server
 * already returns visits most-recent-first, per `PortalRecordsService`'s
 * `orderBy: { startedAt: 'desc' }` -- this component preserves that order
 * rather than re-sorting).
 *
 * Empty-records copy matches the 09-UI-SPEC copywriting contract exactly.
 */
export function VisitTimeline({ visits }: VisitTimelineProps) {
  if (visits.length === 0) {
    return (
      <div className={styles.empty} data-testid="visit-timeline-empty">
        <p className={styles.emptyHeading}>No records for this pet yet</p>
        <p className={styles.emptyBody}>
          Your clinic will add visit records and invoices after your next appointment. If you need help
          now, contact the clinic below.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.timeline} data-testid="visit-timeline">
      {visits.map((visit) => (
        <VisitCard key={visit.visitId} visit={visit} />
      ))}
    </div>
  );
}
