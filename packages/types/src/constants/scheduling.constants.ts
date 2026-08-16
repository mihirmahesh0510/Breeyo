export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CHECKED_IN = 'CHECKED_IN',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.SCHEDULED]: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  [AppointmentStatus.CHECKED_IN]: [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.CANCELLED]: [],
  [AppointmentStatus.NO_SHOW]: [],
};

export function isValidAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  [AppointmentStatus.SCHEDULED]: 'Scheduled',
  [AppointmentStatus.CHECKED_IN]: 'Checked in',
  [AppointmentStatus.COMPLETED]: 'Completed',
  [AppointmentStatus.CANCELLED]: 'Cancelled',
  [AppointmentStatus.NO_SHOW]: 'No show',
};

export enum BlockedPeriodReason {
  LUNCH = 'LUNCH',
  BREAK = 'BREAK',
  PERSONAL = 'PERSONAL',
  OFF_SITE = 'OFF_SITE',
  MEETING = 'MEETING',
  OTHER = 'OTHER',
}

export const BLOCKED_PERIOD_REASON_LABELS: Record<BlockedPeriodReason, string> = {
  [BlockedPeriodReason.LUNCH]: 'Lunch',
  [BlockedPeriodReason.BREAK]: 'Break',
  [BlockedPeriodReason.PERSONAL]: 'Personal',
  [BlockedPeriodReason.OFF_SITE]: 'Off-site',
  [BlockedPeriodReason.MEETING]: 'Meeting',
  [BlockedPeriodReason.OTHER]: 'Other',
};

export enum AppointmentSource {
  STAFF = 'STAFF',
  WHATSAPP = 'WHATSAPP',
}

export enum RecurrenceInterval {
  WEEKLY = 'WEEKLY',
  FORTNIGHTLY = 'FORTNIGHTLY',
  FOUR_WEEKLY = 'FOUR_WEEKLY',
}

export const RECURRENCE_INTERVAL_DAYS: Record<RecurrenceInterval, number> = {
  [RecurrenceInterval.WEEKLY]: 7,
  [RecurrenceInterval.FORTNIGHTLY]: 14,
  [RecurrenceInterval.FOUR_WEEKLY]: 28,
};

export const RECURRENCE_MAX_OCCURRENCES = 12;
export const RECURRENCE_MIN_OCCURRENCES = 2;

// D-07: booking horizon cap; RESEARCH.md discretion recommendation of 90 days.
export const BOOKING_HORIZON_DAYS = 90;
// D-09: no-show auto-flip grace window; RESEARCH.md A1 (20 min, within the 15-30 min recommended range).
export const NO_SHOW_GRACE_MINUTES = 20;
// D-27 trigger 1: "starting soon" staff push lead time; RESEARCH.md A3.
export const STARTING_SOON_LEAD_MINUTES = 15;
// D-27 trigger 3: queue backlog push trigger threshold; RESEARCH.md Open Question 2.
export const QUEUE_BACKLOG_THRESHOLD = 5;
// D-27 trigger 3: queue backlog push debounce window; RESEARCH.md A4.
export const QUEUE_BACKLOG_DEBOUNCE_MINUTES = 30;
// RESEARCH.md Pattern 2: sweep cadence for EXPECTED creation, no-show flips and starting-soon pushes.
export const SCHEDULING_SWEEP_CRON = '*/5 * * * *';
// RESEARCH.md A2: sweep and slot generation operate in clinic-local (India) time.
export const SCHEDULING_TIMEZONE = 'Asia/Kolkata';
// Kept in sync with the ServiceCatalog.durationMinutes default plan 08-03 writes into the schema.
export const DEFAULT_SERVICE_DURATION_MINUTES = 15;
// D-18: appointment reminder cadence mirrors Phase 7 D-01 (1 day before, day of).
export const APPOINTMENT_REMINDER_TOUCHES = ['ADVANCE', 'ON_DATE'] as const;

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

export function weekdayIndexFromLabel(label: WeekdayLabel): number {
  return WEEKDAY_LABELS.indexOf(label);
}

const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function hhmmToMinutes(value: string): number {
  const match = HHMM_PATTERN.exec(value);
  if (!match) {
    throw new Error('Invalid HH:MM time: ' + value);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function minutesToHHMM(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new Error('Invalid minutes value: ' + minutes);
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

export function formatMinutesRange(startMinutes: number, endMinutes: number, date?: Date): string {
  const base = date ?? new Date(Date.UTC(1970, 0, 1, 0, 0, 0, 0));
  const anchor = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));

  const format = (totalMinutes: number) => {
    const d = new Date(anchor.getTime() + totalMinutes * 60 * 1000);
    // Node's ICU renders en-IN am/pm markers lowercase; UI-SPEC mandates capital
    // AM/PM (matching QueueCardItem.formatTime's intended display), so normalize.
    return d
      .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
      .toUpperCase();
  };

  return `${format(startMinutes)} – ${format(endMinutes)}`;
}
