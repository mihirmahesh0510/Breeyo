import type { ResolvedDayHours, SlotOption } from '@breeyo/types';

/**
 * Pure slot-generation engine (RESEARCH § No Analog Found: genuinely
 * greenfield, no Phase 7 transplant source). Exported plain functions --
 * no class, no Prisma, no `Date` construction. Every argument is a plain
 * object of minutes-from-midnight integers, which is what makes this module
 * exhaustively unit-testable without fixtures or timezone setup.
 */

interface DayHoursLike {
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
}

/**
 * D-01: an override, when present, wins completely -- whether it opens or
 * closes the day -- over the recurring weekly template. With no override,
 * the template's own isClosed/minutes apply. With neither a usable override
 * nor an open template, the vet is not bookable that day (`null`), which is
 * what UI-SPEC's "No working hours set yet" empty state communicates.
 */
export function resolveDayHours(
  template: DayHoursLike | null,
  override: DayHoursLike | null,
): ResolvedDayHours | null {
  const source = override ?? template;

  if (!source || source.isClosed) {
    return null;
  }

  return {
    openMinutes: source.openMinutes as number,
    closeMinutes: source.closeMinutes as number,
  };
}

/**
 * Sorts by `startMinutes` and merges any overlapping or touching ranges into
 * a normalized, non-overlapping list -- so the slot loop's overlap test is a
 * single pass per candidate slot instead of an accumulating one.
 */
export function subtractBlockedRanges(
  ranges: Array<{ startMinutes: number; endMinutes: number }>,
): Array<{ startMinutes: number; endMinutes: number }> {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a.startMinutes - b.startMinutes);
  const merged: Array<{ startMinutes: number; endMinutes: number }> = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, current.endMinutes);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Tiles `hours` into `durationMinutes`-sized slots, excluding any slot that
 * overlaps a blocked range at all (a half-blocked slot is not bookable) and
 * flagging -- but never excluding -- any slot that overlaps an already-booked
 * `existing` range.
 *
 * Per D-14, double-booking is allowed with a warning only, so `existing`
 * FLAGS a slot via `isDoubleBooked` and never excludes it -- excluding it
 * would silently contradict a locked decision (RESEARCH anti-pattern A4).
 */
export function generateSlotsForVetDay(
  hours: ResolvedDayHours | null,
  blocked: Array<{ startMinutes: number; endMinutes: number }>,
  existing: Array<{ startMinutes: number; endMinutes: number }>,
  durationMinutes: number,
): SlotOption[] {
  if (!hours || durationMinutes <= 0) {
    return [];
  }

  const normalizedBlocked = subtractBlockedRanges(blocked);
  const slots: SlotOption[] = [];

  for (
    let startMinutes = hours.openMinutes;
    startMinutes + durationMinutes <= hours.closeMinutes;
    startMinutes += durationMinutes
  ) {
    const endMinutes = startMinutes + durationMinutes;

    const overlapsBlocked = normalizedBlocked.some(
      (b) => startMinutes < b.endMinutes && endMinutes > b.startMinutes,
    );
    if (overlapsBlocked) {
      continue;
    }

    const isDoubleBooked = existing.some(
      (e) => startMinutes < e.endMinutes && endMinutes > e.startMinutes,
    );

    slots.push({ startMinutes, endMinutes, isDoubleBooked });
  }

  return slots;
}
