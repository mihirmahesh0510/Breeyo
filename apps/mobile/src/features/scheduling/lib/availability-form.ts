// Pure conversion module bridging two shapes that never agree with each
// other by accident:
//
//   - The setup wizard's editor shape (`apps/mobile/src/lib/wizard-utils.ts`):
//     Monday-first day-name strings (`DAYS_OF_WEEK`) and `"HH:MM"` time
//     strings (`DayHours.openTime`/`closeTime`).
//   - The availability API's storage shape (`packages/types/src/scheduling.ts`
//     / `packages/validators/src/scheduling.ts`): 0=Sunday integer `weekday`
//     and minutes-from-midnight (`openMinutes`/`closeMinutes`).
//
// This file is the ONLY place that bridge lives. Every HH:MM<->minutes
// conversion goes through `@breeyo/types`'s `hhmmToMinutes`/`minutesToHHMM` --
// never a local hand-rolled numeric-string split -- and every weekday index
// is derived from `WEEKDAY_LABELS`/`weekdayIndexFromLabel`, never trusted
// off a caller-supplied ordinal that might reflect Monday-first display
// order instead of the real 0=Sunday storage order.
//
// Framework-free (no React, no React Native) so it is unit-testable exactly
// like `wizard-utils.ts` and `agenda-utils.ts`.

import {
  hhmmToMinutes,
  minutesToHHMM,
  WEEKDAY_LABELS,
  weekdayIndexFromLabel,
  BlockedPeriodReason,
  type WeekdayLabel,
} from '@breeyo/types';
import type { VetAvailabilityTemplate } from '@breeyo/types';
import type {
  UpsertAvailabilityTemplateInput,
  CreateBlockedPeriodInput,
} from '@breeyo/validators';

export interface AvailabilityDayForm {
  weekday: number;
  label: string;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
}

const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '18:00';

/**
 * Seven rows indexed 0 through 6 (0=Sunday, matching `WEEKDAY_LABELS`),
 * Sunday closed and the rest 09:00-18:00 -- matching `getDefaultHours()`'s
 * existing wizard defaults so the two surfaces never disagree about what a
 * normal week looks like.
 */
export function defaultAvailabilityForm(): AvailabilityDayForm[] {
  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    isClosed: weekday === 0, // Sunday
    openTime: DEFAULT_OPEN_TIME,
    closeTime: DEFAULT_CLOSE_TIME,
  }));
}

/**
 * Converts editor rows into the API's `days` payload shape. The weekday
 * index is always re-derived from `row.label` via `weekdayIndexFromLabel` --
 * never taken from `row.weekday` directly -- so a row built in a
 * Monday-first display order (its array ordinal) can never leak into the
 * 0=Sunday storage index by accident.
 *
 * Throws (does not swallow) on an inverted range or a malformed `HH:MM`
 * string, because `hhmmToMinutes` itself throws for the latter and this
 * function extends that same fail-fast contract for the former -- the
 * caller (the settings screen) is expected to validate before calling the
 * save mutation, exactly like the malformed-time case.
 */
export function toTemplatePayload(
  days: AvailabilityDayForm[],
): UpsertAvailabilityTemplateInput['days'] {
  return days.map((row) => {
    const weekday = weekdayIndexFromLabel(row.label as WeekdayLabel);

    if (row.isClosed) {
      return { weekday, isClosed: true, openMinutes: null, closeMinutes: null };
    }

    const openMinutes = hhmmToMinutes(row.openTime);
    const closeMinutes = hhmmToMinutes(row.closeTime);
    if (closeMinutes <= openMinutes) {
      throw new Error('End time must be after start time.');
    }

    return { weekday, isClosed: false, openMinutes, closeMinutes };
  });
}

/**
 * The inverse of `toTemplatePayload`: converts API rows back into seven
 * editor rows, always. Any weekday absent from `rows` (a template that was
 * never fully saved, or a server response that omitted a day) is filled
 * with a closed default row so the editor always has exactly seven rows to
 * render, one per weekday.
 */
export function fromTemplateResponse(
  rows: VetAvailabilityTemplate[],
): AvailabilityDayForm[] {
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));

  return WEEKDAY_LABELS.map((label, weekday) => {
    const row = byWeekday.get(weekday);
    if (!row) {
      return {
        weekday,
        label,
        isClosed: true,
        openTime: DEFAULT_OPEN_TIME,
        closeTime: DEFAULT_CLOSE_TIME,
      };
    }

    return {
      weekday,
      label,
      isClosed: row.isClosed,
      openTime: row.isClosed || row.openMinutes == null ? DEFAULT_OPEN_TIME : minutesToHHMM(row.openMinutes),
      closeTime: row.isClosed || row.closeMinutes == null ? DEFAULT_CLOSE_TIME : minutesToHHMM(row.closeMinutes),
    };
  });
}

export interface BlockedPeriodFormInput {
  date: Date;
  startTime: string;
  endTime: string;
  reason: BlockedPeriodReason;
  reasonText?: string;
}

export type BlockedPeriodPayload = Omit<CreateBlockedPeriodInput, 'vetId'>;

export type BlockedPeriodConversionResult =
  | { ok: true; payload: BlockedPeriodPayload }
  | { ok: false; error: string };

/**
 * Converts the blocked-period sheet's form state into the API payload
 * (minus `vetId`, which the sheet's caller already knows and this module
 * does not). Returns a discriminated result rather than throwing -- unlike
 * `toTemplatePayload` -- so `BlockedPeriodSheet` can render the failure
 * inline (UI-SPEC's `End time must be after start time.` / `Add a short
 * reason.`) without a try/catch around every keystroke.
 */
export function toBlockedPeriodPayload(
  input: BlockedPeriodFormInput,
): BlockedPeriodConversionResult {
  let startMinutes: number;
  let endMinutes: number;
  try {
    startMinutes = hhmmToMinutes(input.startTime);
    endMinutes = hhmmToMinutes(input.endTime);
  } catch {
    return { ok: false, error: 'End time must be after start time.' };
  }

  if (endMinutes <= startMinutes) {
    return { ok: false, error: 'End time must be after start time.' };
  }

  if (
    input.reason === BlockedPeriodReason.OTHER &&
    (!input.reasonText || input.reasonText.trim().length === 0)
  ) {
    return { ok: false, error: 'Add a short reason.' };
  }

  return {
    ok: true,
    payload: {
      date: input.date,
      startMinutes,
      endMinutes,
      reason: input.reason,
      reasonText: input.reasonText,
    },
  };
}
