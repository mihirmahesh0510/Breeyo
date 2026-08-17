// Pure week-range, row-bounds and block-placement geometry for the web week
// grid (D-25). No React, no DOM -- unit-testable with plain objects, and
// safe to run at module scope on both server and client.
import type { AppointmentWithDetails } from '@breeyo/types';

const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MINUTES_PER_ROW = 30;
const MS_PER_MINUTE = 60000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const MAX_VISIBLE_PER_CELL = 3;

// Fallback window when no vet has any working hours configured this week --
// 9am to 6pm, matching D-01's own worked example rather than an empty grid.
const DEFAULT_START_MINUTES = 9 * 60;
const DEFAULT_END_MINUTES = 18 * 60;

// Minimal, web-local reimplementation of the fixed-offset IST arithmetic in
// `apps/api/src/lib/ist-date.ts` (`getTodayIST`/`istDateOnly`/`addDaysIST`/
// `weekdayIST`/`istMinutesOfDay`). `apps/web` cannot import across the app
// boundary into `apps/api`, so only the handful of primitives this module
// actually needs are duplicated here -- not the whole module. India has no
// DST, so this fixed +05:30 arithmetic is exact, same as the API's own.
function istDateOnly(date: Date): Date {
  const istString = date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
  const [year, month, day] = istString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
}

function addDaysIST(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function weekdayIST(date: Date): number {
  const istMidnight = istDateOnly(date);
  const calendarUtcMidnight = new Date(istMidnight.getTime() + IST_OFFSET_MS);
  return calendarUtcMidnight.getUTCDay();
}

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

function istMinutesOfDay(date: Date): number {
  return Math.floor((date.getTime() - istDateOnly(date).getTime()) / MS_PER_MINUTE);
}

export interface WeekRange {
  from: Date;
  to: Date;
  days: Date[];
}

/**
 * A Monday-first week of seven IST day starts containing `anchor`. `from` is
 * that week's Monday at IST midnight; `to` is the following Monday at IST
 * midnight (exclusive upper bound, matching `istDayBounds`'s convention).
 */
export function buildWeekRange(anchor: Date): WeekRange {
  const anchorMidnight = istDateOnly(anchor);
  const weekday = weekdayIST(anchor); // 0=Sunday..6=Saturday
  const daysSinceMonday = (weekday + 6) % 7; // Monday=0..Sunday=6
  const monday = addDaysIST(anchorMidnight, -daysSinceMonday);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIST(monday, i));

  return { from: monday, to: addDaysIST(monday, 7), days };
}

export interface RowBounds {
  startMinutes: number;
  endMinutes: number;
  rowCount: number;
}

export type DayHours = { openMinutes: number; closeMinutes: number } | null;

/**
 * The union of every non-null day's open hours across the displayed vets and
 * week, padded by 60 minutes on each side and snapped to 30-minute
 * boundaries. Falls back to a 9am-6pm window when every day is null (no
 * hours configured at all) rather than rendering an empty grid.
 */
export function computeRowBounds(resolvedHoursByDay: DayHours[]): RowBounds {
  const configured = resolvedHoursByDay.filter((hours): hours is NonNullable<DayHours> => hours != null);

  if (configured.length === 0) {
    return {
      startMinutes: DEFAULT_START_MINUTES,
      endMinutes: DEFAULT_END_MINUTES,
      rowCount: (DEFAULT_END_MINUTES - DEFAULT_START_MINUTES) / MINUTES_PER_ROW,
    };
  }

  const earliestOpen = Math.min(...configured.map((h) => h.openMinutes));
  const latestClose = Math.max(...configured.map((h) => h.closeMinutes));

  const startMinutes = Math.max(0, Math.floor((earliestOpen - 60) / MINUTES_PER_ROW) * MINUTES_PER_ROW);
  const endMinutes = Math.min(24 * 60, Math.ceil((latestClose + 60) / MINUTES_PER_ROW) * MINUTES_PER_ROW);

  return { startMinutes, endMinutes, rowCount: (endMinutes - startMinutes) / MINUTES_PER_ROW };
}

export interface PlacedBlock {
  appointment: AppointmentWithDetails;
  dayIndex: number;
  rowIndex: number;
  rowSpan: number;
  columnIndex: number;
  columnCount: number;
  overflowCount: number;
}

interface TimedAppointment {
  appointment: AppointmentWithDetails;
  startMinutes: number;
  endMinutes: number;
}

/**
 * Positions each appointment into a `{ dayIndex, rowIndex, rowSpan }` cell
 * and resolves same-cell overlap into side-by-side columns, capped at 3
 * visible blocks with the remainder folded into `overflowCount` on the last
 * visible block.
 *
 * `rowSpan` is `Math.max(1, Math.ceil(durationMinutes / 30))` -- the
 * `Math.max(1, ...)` is UI-SPEC's explicit no-sub-row-sizing rule: a
 * proportionally-sized 15-minute block would be 32px tall, below the 44px
 * minimum target and too small to hold a pet name.
 */
export function placeAppointments(
  appointments: AppointmentWithDetails[],
  days: Date[],
  bounds: RowBounds,
): PlacedBlock[] {
  const dayKeys = days.map(istDateKey);
  const byDay = new Map<number, TimedAppointment[]>();

  for (const appointment of appointments) {
    const scheduledFor = new Date(appointment.scheduledFor);
    const dayIndex = dayKeys.indexOf(istDateKey(scheduledFor));
    if (dayIndex === -1) {
      // Outside the displayed week -- nothing to place.
      continue;
    }

    const startMinutes = istMinutesOfDay(scheduledFor);
    const durationMinutes = appointment.durationMinutes ?? MINUTES_PER_ROW;

    if (!byDay.has(dayIndex)) {
      byDay.set(dayIndex, []);
    }
    byDay.get(dayIndex)!.push({
      appointment,
      startMinutes,
      endMinutes: startMinutes + durationMinutes,
    });
  }

  const result: PlacedBlock[] = [];

  for (const [dayIndex, dayAppointments] of byDay) {
    const sorted = [...dayAppointments].sort((a, b) => a.startMinutes - b.startMinutes);

    // Cluster transitively-overlapping appointments: a new appointment joins
    // the current cluster if it starts before the cluster's running max end.
    let currentCluster: TimedAppointment[] = [];
    let clusterEnd = -Infinity;
    const clusters: TimedAppointment[][] = [];

    for (const timed of sorted) {
      if (currentCluster.length === 0 || timed.startMinutes < clusterEnd) {
        currentCluster.push(timed);
        clusterEnd = Math.max(clusterEnd, timed.endMinutes);
      } else {
        clusters.push(currentCluster);
        currentCluster = [timed];
        clusterEnd = timed.endMinutes;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    for (const cluster of clusters) {
      const visibleCount = Math.min(cluster.length, MAX_VISIBLE_PER_CELL);
      const overflow = Math.max(0, cluster.length - MAX_VISIBLE_PER_CELL);

      cluster.slice(0, visibleCount).forEach((timed, columnIndex) => {
        const rawRowIndex = Math.floor((timed.startMinutes - bounds.startMinutes) / MINUTES_PER_ROW);
        const rowIndex = Math.max(0, Math.min(bounds.rowCount - 1, rawRowIndex));
        const durationMinutes = timed.endMinutes - timed.startMinutes;
        const rowSpan = Math.max(1, Math.ceil(durationMinutes / MINUTES_PER_ROW));

        result.push({
          appointment: timed.appointment,
          dayIndex,
          rowIndex,
          rowSpan,
          columnIndex,
          columnCount: visibleCount,
          overflowCount: columnIndex === visibleCount - 1 ? overflow : 0,
        });
      });
    }
  }

  return result;
}
