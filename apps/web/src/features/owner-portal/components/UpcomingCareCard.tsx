'use client';

import styles from './UpcomingCareCard.module.css';

export type CareDateStatus = 'overdue' | 'dueSoon' | 'upcoming';

export interface UpcomingCareVaccination {
  vaccineName: string;
  nextDueDate: string;
  status: CareDateStatus;
}

export interface UpcomingCareDeworming {
  drugName: string;
  nextDueDate: string;
  status: CareDateStatus;
}

export interface UpcomingCareAppointment {
  scheduledAt: string;
  reason: string;
  staffName: string;
}

export interface UpcomingCareCardProps {
  vaccinations: UpcomingCareVaccination[];
  deworming: UpcomingCareDeworming | null;
  nextAppointment: UpcomingCareAppointment | null;
}

const IST_TIME_ZONE = 'Asia/Kolkata';

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TIME_ZONE,
  });
}

function formatAppointmentDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = formatDueDate(iso);
  const timePart = date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST_TIME_ZONE })
    .toUpperCase();
  return `${datePart}, ${timePart}`;
}

/**
 * D-73 to D-77: a light, non-clinical note paired with a handful of the
 * most common vaccine names -- kept deliberately small (not an NLP system,
 * not a "heavy coaching product" per D-77). An unmatched vaccine name gets
 * no gloss rather than a guess, exactly like `portal-records.service.ts`'s
 * own `DIAGNOSIS_GLOSS_TERMS` convention.
 */
const VACCINE_GLOSS_TERMS: ReadonlyArray<{ pattern: RegExp; gloss: string }> = [
  { pattern: /rabies/i, gloss: 'Annual booster' },
  { pattern: /dhpp|dhppi|dapp/i, gloss: 'Core booster' },
  { pattern: /lepto/i, gloss: 'Booster' },
  { pattern: /fvrcp/i, gloss: 'Core booster (cats)' },
];

function buildVaccineGloss(vaccineName: string): string | null {
  const match = VACCINE_GLOSS_TERMS.find((entry) => entry.pattern.test(vaccineName));
  return match ? match.gloss : null;
}

const STATUS_LABEL: Record<CareDateStatus, string> = {
  overdue: 'Overdue',
  dueSoon: 'Due soon',
  upcoming: 'Upcoming',
};

const STATUS_CLASS: Record<CareDateStatus, string> = {
  overdue: styles.statusOverdue,
  dueSoon: styles.statusDueSoon,
  upcoming: styles.statusUpcoming,
};

/**
 * 09-UI-SPEC "Color": `#E65100` (warning/tertiary accent) is reserved for
 * overdue / low-stock / expiring / urgent exception chips; `#BA1A1A`
 * (destructive) is reserved for irreversible actions (void, refund, access
 * removal, invalid-link) and is deliberately NOT used here even though the
 * plan's own task text suggested destructive red for "overdue" -- see
 * `09-07-SUMMARY.md` for the full writeup of this deviation. `upcoming`
 * renders no badge at all, matching the "neutral for upcoming" behavior.
 */
function StatusBadge({ status, testIdPrefix }: { status: CareDateStatus; testIdPrefix: string }) {
  if (status === 'upcoming') return null;
  return (
    <span className={`${styles.statusBadge} ${STATUS_CLASS[status]}`} data-testid={`${testIdPrefix}-status-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * OWN-07: the Overview-tab upcoming-care-dates card -- vaccination due
 * dates, the latest deworming due date, and the next scheduled appointment,
 * scoped server-side by `PortalCareDatesService`. Every section renders
 * unconditionally with its own reassuring empty-state copy (never a raw
 * blank/"no data" gap) so the card always has something to say for the
 * selected pet.
 */
export function UpcomingCareCard({ vaccinations, deworming, nextAppointment }: UpcomingCareCardProps) {
  return (
    <div className={styles.card} data-testid="upcoming-care-card">
      <div className={styles.section} data-testid="upcoming-care-vaccinations">
        <p className={styles.sectionHeading}>Vaccinations</p>
        {vaccinations.length === 0 ? (
          <p className={styles.emptyText}>No vaccinations due right now.</p>
        ) : (
          vaccinations.map((vaccination) => {
            const gloss = buildVaccineGloss(vaccination.vaccineName);
            return (
              <div key={`${vaccination.vaccineName}-${vaccination.nextDueDate}`} className={styles.entryRow}>
                <div>
                  <p className={styles.entryName}>{vaccination.vaccineName}</p>
                  {gloss ? <p className={styles.entryGloss}>{gloss}</p> : null}
                </div>
                <div>
                  <StatusBadge status={vaccination.status} testIdPrefix="vaccination" />
                  <p className={styles.entryDate}>{formatDueDate(vaccination.nextDueDate)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.section} data-testid="upcoming-care-deworming">
        <p className={styles.sectionHeading}>Deworming</p>
        {deworming ? (
          <div className={styles.entryRow}>
            <p className={styles.entryName}>{deworming.drugName}</p>
            <div>
              <StatusBadge status={deworming.status} testIdPrefix="deworming" />
              <p className={styles.entryDate}>{formatDueDate(deworming.nextDueDate)}</p>
            </div>
          </div>
        ) : (
          <p className={styles.emptyText}>No deworming due right now.</p>
        )}
      </div>

      <div className={styles.section} data-testid="upcoming-care-appointment">
        <p className={styles.sectionHeading}>Next appointment</p>
        {nextAppointment ? (
          <div>
            <p className={styles.appointmentReason}>{nextAppointment.reason}</p>
            <p className={styles.appointmentMeta}>
              {formatAppointmentDateTime(nextAppointment.scheduledAt)} · with {nextAppointment.staffName}
            </p>
          </div>
        ) : (
          <p className={styles.emptyText}>No upcoming appointment scheduled.</p>
        )}
      </div>
    </div>
  );
}
