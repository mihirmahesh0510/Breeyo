import { describe, it, expect, vi, afterEach } from 'vitest';
import { futureSlot, futureWeekday } from '../future-slot.js';
import { getTodayIST, weekdayIST } from '../../../src/lib/ist-date.js';

/**
 * Regression for a real CI failure on PR #19's post-merge run: the old
 * `futureSlot` independently Sunday-skipped each call by bumping a Sunday
 * landing forward by one day, so two *different* `daysAhead` values could
 * collapse onto the *same* calendar day -- e.g. `futureSlot(2)` and
 * `futureSlot(3)` both landed on Monday when "today" was a Friday (2 -> Sun
 * -> bumped to Mon; 3 -> Mon directly). `getTodayIST`/`weekdayIST` are pure
 * functions of the system clock, so this is reproduced deterministically
 * across all 7 possible "today" weekdays rather than depending on which day
 * the suite happens to run.
 */
describe('futureSlot / futureWeekday day selection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never collapses two different daysAhead values onto the same calendar day, for any weekday "today"', () => {
    // 2026-08-17..23 is a verified Mon..Sun week -- one fixed instant per
    // weekday, each at 04:00 UTC (09:30 IST, safely mid-day so IST-midnight
    // rounding never shifts which calendar day "today" resolves to).
    for (let dayOfMonth = 17; dayOfMonth <= 23; dayOfMonth += 1) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`2026-08-${dayOfMonth}T04:00:00Z`));

      const seenDays = new Map<number, number>();
      for (let daysAhead = 1; daysAhead <= 6; daysAhead += 1) {
        const slot = futureSlot(daysAhead, 600);
        const dayKey = getTodayIST(slot).getTime();
        const collidesWith = seenDays.get(dayKey);
        expect(
          collidesWith,
          `daysAhead=${daysAhead} landed on the same day as daysAhead=${collidesWith} ` +
            `when "today" was 2026-08-${dayOfMonth}`,
        ).toBeUndefined();
        seenDays.set(dayKey, daysAhead);
      }

      vi.useRealTimers();
    }
  });

  it('futureWeekday matches the day component of futureSlot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T04:00:00Z'));

    expect(futureWeekday(2).getTime()).toBe(getTodayIST(futureSlot(2, 600)).getTime());
  });

  it('never lands on a Sunday', () => {
    for (let dayOfMonth = 17; dayOfMonth <= 23; dayOfMonth += 1) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`2026-08-${dayOfMonth}T04:00:00Z`));

      for (let daysAhead = 1; daysAhead <= 6; daysAhead += 1) {
        expect(weekdayIST(futureWeekday(daysAhead))).not.toBe(0);
      }

      vi.useRealTimers();
    }
  });
});
