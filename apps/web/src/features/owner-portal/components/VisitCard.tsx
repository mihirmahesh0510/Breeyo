'use client';

import type { OwnerPortalPrescriptionCard, OwnerPortalVisitSummary } from '@breeyo/types';
import { PrescriptionUsageCard } from './PrescriptionUsageCard';
import styles from './VisitCard.module.css';

export interface VisitCardEntry extends OwnerPortalVisitSummary {
  prescriptions: OwnerPortalPrescriptionCard[];
}

export interface VisitCardProps {
  visit: VisitCardEntry;
}

/**
 * D-61, D-73, D-75, D-76: one visit-timeline row. Keeps the clinic's real
 * diagnosis term (`diagnosisText`) visible, and only adds the
 * `diagnosisGloss` plain-language line when the server provided one --
 * D-77 bans a "heavy coaching product", so an ungloss-able term (server
 * returned `null`) is shown as-is rather than a guessed explanation.
 */
export function VisitCard({ visit }: VisitCardProps) {
  const visitDate = new Date(visit.visitDate);
  const formattedDate = Number.isNaN(visitDate.getTime())
    ? visit.visitDate
    : visitDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <article className={styles.card} data-testid="visit-card">
      <p className={styles.date}>{formattedDate}</p>
      {visit.visitReason ? <p className={styles.reason}>{visit.visitReason}</p> : null}
      {visit.diagnosisText ? <p className={styles.diagnosis}>{visit.diagnosisText}</p> : null}
      {visit.diagnosisGloss ? <p className={styles.gloss}>{visit.diagnosisGloss}</p> : null}

      {visit.prescriptions.length > 0 ? (
        <div className={styles.prescriptions}>
          {visit.prescriptions.map((prescription) => (
            <PrescriptionUsageCard key={prescription.prescriptionId} prescription={prescription} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
