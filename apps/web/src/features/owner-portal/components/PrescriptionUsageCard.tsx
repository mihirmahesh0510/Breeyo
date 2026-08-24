'use client';

import type { OwnerPortalPrescriptionCard } from '@breeyo/types';
import styles from './PrescriptionUsageCard.module.css';

export interface PrescriptionUsageCardProps {
  prescription: OwnerPortalPrescriptionCard;
}

/**
 * D-74, D-76, D-77: an owner-friendly medication card -- drug name, the
 * dosage/route/frequency/duration usage instruction (already expanded from
 * shorthand server-side by `buildUsageInstruction` in
 * `portal-records.service.ts`), and an optional plain-language gloss drawn
 * from the prescription's `ownerInstructions` field. Never a raw table row,
 * and never `clinicalInstructions` (vet-facing) -- that field is
 * structurally unreachable from this component's props.
 */
export function PrescriptionUsageCard({ prescription }: PrescriptionUsageCardProps) {
  return (
    <div className={styles.card} data-testid="prescription-usage-card">
      <p className={styles.drugName}>{prescription.drugName}</p>
      <p className={styles.instruction}>{prescription.usageInstruction}</p>
      {prescription.plainLanguageGloss ? (
        <p className={styles.gloss}>{prescription.plainLanguageGloss}</p>
      ) : null}
    </div>
  );
}
