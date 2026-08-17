// Pure time-of-day grouping and slot-formatting helpers for the D-24 mobile
// day agenda. Framework-free (no UI-library imports) so this file is
// importable directly by vitest's plain `node` environment -- see
// `apps/mobile/src/lib/wizard-utils.ts` for the established precedent this
// file follows.
import type { AppointmentWithDetails } from '@breeyo/types';

const IST_TIME_ZONE = 'Asia/Kolkata';

export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening';

const GROUP_ORDER: TimeOfDay[] = ['Morning', 'Afternoon', 'Evening'];

/** Minutes since IST midnight for a real Date instant. */
function istMinutesSinceMidnight(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** IST calendar-day key (YYYY-MM-DD) for a real Date instant. */
function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

function timeOfDayFor(date: Date): TimeOfDay {
  const minutes = istMinutesSinceMidnight(date);
  if (minutes < 12 * 60) return 'Morning';
  if (minutes < 17 * 60) return 'Afternoon';
  return 'Evening';
}

/**
 * UI-SPEC § Mobile day agenda: Morning is before 12:00 IST, Afternoon is
 * 12:00 up to (not including) 17:00 IST, Evening is 17:00 onward. Empty
 * groups are omitted entirely; each group is sorted ascending by
 * `scheduledFor`; groups are always returned Morning -> Afternoon -> Evening
 * regardless of input order.
 */
export function groupAppointmentsByTimeOfDay(
  appointments: AppointmentWithDetails[],
): Array<{ title: TimeOfDay; data: AppointmentWithDetails[] }> {
  const buckets: Record<TimeOfDay, AppointmentWithDetails[]> = {
    Morning: [],
    Afternoon: [],
    Evening: [],
  };

  for (const appointment of appointments) {
    buckets[timeOfDayFor(new Date(appointment.scheduledFor))].push(appointment);
  }

  return GROUP_ORDER.filter((title) => buckets[title].length > 0).map((title) => ({
    title,
    data: [...buckets[title]].sort(
      (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
    ),
  }));
}

/**
 * `en-IN`, `hour12: true`, en dash with surrounding spaces, matching
 * `QueueCardItem.formatTime`'s display convention and UI-SPEC's compact
 * agenda-row format (`2:30 – 2:45 PM`): the leading meridiem marker is
 * dropped when both ends share the same AM/PM.
 */
export function formatSlotRange(scheduledFor: Date, durationMinutes: number): string {
  const start = new Date(scheduledFor);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const format = (date: Date) =>
    date
      .toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: IST_TIME_ZONE,
      })
      // Node's ICU renders en-IN am/pm markers lowercase; UI-SPEC mandates
      // capital AM/PM, matching `formatMinutesRange`'s identical fix.
      .toUpperCase();

  const startLabel = format(start);
  const endLabel = format(end);
  const startMeridiem = startLabel.slice(-2);
  const endMeridiem = endLabel.slice(-2);
  const compactStart = startMeridiem === endMeridiem ? startLabel.slice(0, -3) : startLabel;

  return `${compactStart} – ${endLabel}`;
}

/**
 * An appointment is "past" only when the *selected day itself* is today
 * (IST) and its scheduled time has already elapsed. A whole day that is
 * historical (selectedDate before today) or upcoming (selectedDate after
 * today) never dims individual rows -- the day itself already communicates
 * that.
 */
export function isPastOnToday(scheduledFor: Date, selectedDate: Date): boolean {
  const now = new Date();
  if (istDateKey(selectedDate) !== istDateKey(now)) {
    return false;
  }
  return new Date(scheduledFor).getTime() < now.getTime();
}

/**
 * The row index at which `NowIndicator` should render: the count of
 * appointments already in the past, i.e. the boundary between the last past
 * and first future appointment. Assumes `appointments` is already sorted
 * ascending by `scheduledFor` (as `groupAppointmentsByTimeOfDay` produces).
 * Returns `null` when `selectedDate` is not today -- the indicator only
 * makes sense on the day actually in progress.
 */
export function splitIndexForNowIndicator(
  appointments: AppointmentWithDetails[],
  selectedDate: Date,
  now: Date,
): number | null {
  if (istDateKey(selectedDate) !== istDateKey(now)) {
    return null;
  }

  let index = 0;
  for (const appointment of appointments) {
    if (new Date(appointment.scheduledFor).getTime() < now.getTime()) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}
