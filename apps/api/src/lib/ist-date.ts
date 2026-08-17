import { SCHEDULING_TIMEZONE } from '@breeyo/types';

/**
 * IST-anchored date helpers.
 *
 * WHA-01 / D-01, D-02: the WhatsApp reminder sweep needs IST-anchored date
 * arithmetic without importing `QueueRepository` into the WhatsApp module.
 * This module is the single shared source for that arithmetic — extracted
 * verbatim from `QueueRepository.getTodayIST` (Phase 3), which now delegates
 * back to `getTodayIST` here rather than duplicating the logic.
 *
 * Phase 8 (D-08, D-10, SCH-02): every day-scoped scheduling query
 * (availability, appointments, the queue board's EXPECTED group) needs the
 * same IST-anchored arithmetic, so this module is extended here with the
 * bridge between the minutes-from-midnight availability model and absolute
 * timestamps (`minutesToIstDate`/`istMinutesOfDay`), an inclusive/exclusive
 * day-bounds helper (`istDayBounds`), and a weekday accessor (`weekdayIST`)
 * — no new arithmetic, only new entry points onto the same `getTodayIST`
 * primitive.
 */

/**
 * Re-exported for backward compatibility with existing importers
 * (`apps/api/src/modules/whatsapp/booking/slot.service.ts`, this file's own
 * tests) that reference `IST_TIMEZONE` directly. The single source of the
 * timezone literal is `SCHEDULING_TIMEZONE` in
 * `packages/types/src/constants/scheduling.constants.ts` (plan 08-01).
 */
export const IST_TIMEZONE = SCHEDULING_TIMEZONE;

/**
 * Gets start of today in IST (`SCHEDULING_TIMEZONE`, UTC+5:30).
 */
export function getTodayIST(date?: Date): Date {
  const now = date ?? new Date();
  // Convert to IST string, then parse back to get midnight IST
  const istString = now.toLocaleDateString('en-CA', { timeZone: SCHEDULING_TIMEZONE });
  // istString is "YYYY-MM-DD"
  const [year, month, day] = istString.split('-').map(Number);
  // Create UTC date that represents midnight IST (IST = UTC + 5:30)
  return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
}

/**
 * Which IST calendar day is this instant in — same semantics as
 * `getTodayIST`, named for the "which day does this belong to" intent that
 * availability and appointment queries express. Idempotent: applying it to
 * its own result returns the same instant, since it is already IST midnight.
 */
export function istDateOnly(date: Date): Date {
  return getTodayIST(date);
}

/**
 * Adds whole days to an existing IST-midnight `Date`.
 *
 * Adds fixed 24h increments directly to the instant rather than re-deriving
 * the date from the local system clock — India has no DST, so a
 * constant day length is safe, and re-deriving via `getTodayIST` would
 * reinterpret the shifted instant through whatever machine-local timezone is
 * running the process instead of preserving the IST-midnight anchor.
 */
export function addDaysIST(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Returns `{ start, end }` bounding exactly one IST calendar day: `start` is
 * IST midnight of the day containing `date`, `end` is IST midnight of the
 * following day. Every day-scoped query should use `gte: start, lt: end`
 * rather than a same-day equality test.
 */
export function istDayBounds(date: Date): { start: Date; end: Date } {
  const start = istDateOnly(date);
  const end = addDaysIST(start, 1);
  return { start, end };
}

/**
 * Bridges the minutes-from-midnight availability model to an absolute
 * `scheduledFor`-shaped timestamp: `istMidnight` must already be an
 * IST-midnight instant (e.g. from `getTodayIST`/`istDateOnly`).
 */
export function minutesToIstDate(istMidnight: Date, minutes: number): Date {
  return new Date(istMidnight.getTime() + minutes * 60000);
}

/**
 * Inverse of `minutesToIstDate`: how many minutes past IST midnight does
 * this instant fall.
 */
export function istMinutesOfDay(date: Date): number {
  return Math.floor((date.getTime() - istDateOnly(date).getTime()) / 60000);
}

/**
 * Weekday of the IST calendar day containing this instant: 0=Sunday..6=Saturday,
 * matching the `WEEKDAY_LABELS` index convention in `scheduling.constants.ts`.
 *
 * `istDateOnly(date)` is a UTC instant equal to `Date.UTC(y, m, d, -5, -30)`,
 * i.e. midnight UTC of the IST calendar day minus 5h30m. Adding 5h30m back
 * lands exactly on midnight UTC of that same calendar day, whose `getUTCDay()`
 * is the weekday of the IST calendar date itself (day-of-week is a property
 * of the Gregorian date, not of any particular timezone's midnight).
 */
export function weekdayIST(date: Date): number {
  const istMidnight = istDateOnly(date);
  const calendarUtcMidnight = new Date(istMidnight.getTime() + 5.5 * 60 * 60 * 1000);
  return calendarUtcMidnight.getUTCDay();
}
