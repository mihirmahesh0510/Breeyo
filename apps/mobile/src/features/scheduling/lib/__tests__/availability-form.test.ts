import { describe, it, expect } from 'vitest';
import { BlockedPeriodReason, WEEKDAY_LABELS } from '@breeyo/types';
import type { VetAvailabilityTemplate } from '@breeyo/types';
import {
  defaultAvailabilityForm,
  toTemplatePayload,
  fromTemplateResponse,
  toBlockedPeriodPayload,
  type AvailabilityDayForm,
} from '../availability-form';

function makeTemplateRow(
  overrides: Partial<VetAvailabilityTemplate> & { weekday: number },
): VetAvailabilityTemplate {
  return {
    id: `tmpl-${overrides.weekday}`,
    clinicId: 'clinic-1',
    vetId: 'vet-1',
    isClosed: false,
    openMinutes: 540,
    closeMinutes: 1080,
    ...overrides,
  };
}

describe('availability-form', () => {
  describe('toTemplatePayload', () => {
    it('converts a full week', () => {
      const days = defaultAvailabilityForm();
      const payload = toTemplatePayload(days);

      expect(payload).toHaveLength(7);
      for (let weekday = 0; weekday < 7; weekday++) {
        const entry = payload.find((d) => d.weekday === weekday);
        expect(entry).toBeDefined();
        if (weekday === 0) {
          // Sunday closed by default
          expect(entry!.isClosed).toBe(true);
          expect(entry!.openMinutes).toBeNull();
          expect(entry!.closeMinutes).toBeNull();
        } else {
          expect(entry!.isClosed).toBe(false);
          expect(entry!.openMinutes).toBe(540);
          expect(entry!.closeMinutes).toBe(1080);
        }
      }
    });

    it('maps weekday indexes correctly regardless of the row.weekday field', () => {
      // Simulate rows built in the wizard's Monday-first display order, with
      // a deliberately wrong `weekday` field (its Monday-first array
      // ordinal) to prove the conversion derives the real 0=Sunday weekday
      // from the label, never trusting a possibly-mis-set numeric field.
      const mondayFirstLabels = [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ] as const;
      const days: AvailabilityDayForm[] = mondayFirstLabels.map((label, ordinal) => ({
        weekday: ordinal, // WRONG on purpose: Monday-first ordinal, not 0=Sunday
        label,
        isClosed: label === 'Sunday',
        openTime: '09:00',
        closeTime: '18:00',
      }));

      const payload = toTemplatePayload(days);
      const monday = payload.find((d) => d.weekday === 1);
      const sunday = payload.find((d) => d.weekday === 0);

      expect(monday).toBeDefined();
      expect(monday!.isClosed).toBe(false);
      expect(sunday).toBeDefined();
      expect(sunday!.isClosed).toBe(true);
    });

    it('rejects an inverted range', () => {
      const days = defaultAvailabilityForm();
      days[1] = { ...days[1], isClosed: false, openTime: '18:00', closeTime: '09:00' };

      expect(() => toTemplatePayload(days)).toThrow();
    });

    it('rejects a malformed time', () => {
      const days = defaultAvailabilityForm();
      const badStart = [...days];
      badStart[1] = { ...badStart[1], isClosed: false, openTime: '9:0', closeTime: '18:00' };
      expect(() => toTemplatePayload(badStart)).toThrow();

      const badEnd = [...days];
      badEnd[1] = { ...badEnd[1], isClosed: false, openTime: '09:00', closeTime: '24:00' };
      expect(() => toTemplatePayload(badEnd)).toThrow();
    });
  });

  describe('fromTemplateResponse', () => {
    it('is the inverse of toTemplatePayload', () => {
      const original = defaultAvailabilityForm();
      const payload = toTemplatePayload(original);
      const rows: VetAvailabilityTemplate[] = payload.map((entry) =>
        makeTemplateRow({ ...entry }),
      );
      const roundTripped = fromTemplateResponse(rows);
      const roundTrippedPayload = toTemplatePayload(roundTripped);

      expect(roundTrippedPayload).toEqual(payload);
    });

    it('fills a missing weekday with a sensible (closed) default', () => {
      // Only 5 of 7 weekdays present.
      const rows: VetAvailabilityTemplate[] = [1, 2, 3, 4, 5].map((weekday) =>
        makeTemplateRow({ weekday, isClosed: false, openMinutes: 540, closeMinutes: 1080 }),
      );

      const form = fromTemplateResponse(rows);
      expect(form).toHaveLength(7);

      const sunday = form.find((d) => d.weekday === 0);
      const saturday = form.find((d) => d.weekday === 6);
      expect(sunday?.isClosed).toBe(true);
      expect(saturday?.isClosed).toBe(true);

      const monday = form.find((d) => d.weekday === 1);
      expect(monday?.isClosed).toBe(false);
      expect(monday?.openTime).toBe('09:00');
      expect(monday?.closeTime).toBe('18:00');
    });

    it('produces a label for every row using WEEKDAY_LABELS', () => {
      const form = fromTemplateResponse([]);
      for (const row of form) {
        expect(WEEKDAY_LABELS[row.weekday]).toBe(row.label);
      }
    });
  });

  describe('toBlockedPeriodPayload', () => {
    const baseInput = {
      date: new Date('2026-08-20T00:00:00.000Z'),
      startTime: '13:00',
      endTime: '14:00',
    };

    it('requires reasonText for OTHER: blank text fails', () => {
      const result = toBlockedPeriodPayload({
        ...baseInput,
        reason: BlockedPeriodReason.OTHER,
        reasonText: '   ',
      });
      expect(result.ok).toBe(false);
    });

    it('requires reasonText for OTHER: LUNCH with no text succeeds', () => {
      const result = toBlockedPeriodPayload({
        ...baseInput,
        reason: BlockedPeriodReason.LUNCH,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.reason).toBe(BlockedPeriodReason.LUNCH);
        expect(result.payload.startMinutes).toBe(780);
        expect(result.payload.endMinutes).toBe(840);
      }
    });
  });
});
