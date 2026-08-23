import { getTodayIST, addDaysIST, weekdayIST, minutesToIstDate } from '../../src/lib/ist-date.js';

/**
 * The `daysAhead`th non-Sunday day after today (Sunday is skipped entirely
 * from the count, not just bumped past when landed on), at `minutesOfDay`
 * past IST midnight. Counting only valid days -- rather than adding
 * `daysAhead` calendar days and then bumping forward off a Sunday landing --
 * keeps the mapping from `daysAhead` to calendar day strictly increasing, so
 * two different `daysAhead` values used by the same test can never collapse
 * onto the same day regardless of which weekday "today" happens to be.
 *
 * Previously duplicated (with the collision-prone bump-forward logic) across
 * appointment-reads/appointment-booking/realtime-broadcast/tenant-isolation
 * scheduling tests -- see `__tests__/future-slot.test.ts` for the regression
 * this fixes (a real CI failure on PR #19's post-merge run).
 */
export function futureSlot(daysAhead: number, minutesOfDay = 600): Date {
  let day = getTodayIST();
  let remaining = daysAhead;
  while (remaining > 0) {
    day = addDaysIST(day, 1);
    if (weekdayIST(day) !== 0) {
      remaining -= 1;
    }
  }
  return minutesToIstDate(day, minutesOfDay);
}

/** Same day selection as `futureSlot`, without a time-of-day offset. */
export function futureWeekday(daysAhead: number): Date {
  return getTodayIST(futureSlot(daysAhead, 0));
}
