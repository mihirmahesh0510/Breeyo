import { describe, it, expect } from 'vitest';
import { generateSlotsForVetDay, resolveDayHours, subtractBlockedRanges } from '../slot.service.js';

describe('slot.service', () => {
  describe('generateSlotsForVetDay', () => {
    it('closed day yields no slots', () => {
      expect(generateSlotsForVetDay(null, [], [], 15)).toEqual([]);
    });

    it('open day tiles slots by duration', () => {
      const slots = generateSlotsForVetDay({ openMinutes: 540, closeMinutes: 600 }, [], [], 15);
      expect(slots).toHaveLength(4);
      expect(slots.map((s) => s.startMinutes)).toEqual([540, 555, 570, 585]);
      for (const s of slots) {
        expect(s.endMinutes).toBe(s.startMinutes + 15);
      }
    });

    it('a trailing partial slot is not offered', () => {
      const slots = generateSlotsForVetDay({ openMinutes: 540, closeMinutes: 590 }, [], [], 15);
      expect(slots).toHaveLength(3);
      expect(slots.map((s) => s.startMinutes)).toEqual([540, 555, 570]);
      for (const s of slots) {
        expect(s.endMinutes).toBeLessThanOrEqual(590);
      }
    });

    it('duration longer than the day yields no slots', () => {
      const slots = generateSlotsForVetDay({ openMinutes: 540, closeMinutes: 600 }, [], [], 90);
      expect(slots).toEqual([]);
    });

    it('blocked periods are excluded, not flagged', () => {
      const slots = generateSlotsForVetDay(
        { openMinutes: 540, closeMinutes: 600 },
        [{ startMinutes: 555, endMinutes: 570 }],
        [],
        15,
      );
      expect(slots.map((s) => s.startMinutes)).toEqual([540, 570, 585]);
    });

    it('a blocked period partially overlapping a slot removes that slot entirely', () => {
      const slots = generateSlotsForVetDay(
        { openMinutes: 540, closeMinutes: 600 },
        [{ startMinutes: 560, endMinutes: 565 }],
        [],
        15,
      );
      // the 555-570 slot is fully removed by the partial overlap
      expect(slots.map((s) => s.startMinutes)).not.toContain(555);
      expect(slots.map((s) => s.startMinutes)).toEqual([540, 570, 585]);
    });

    it('existing appointments are flagged, never removed (D-14)', () => {
      const slots = generateSlotsForVetDay(
        { openMinutes: 540, closeMinutes: 600 },
        [],
        [{ startMinutes: 555, endMinutes: 570 }],
        15,
      );
      expect(slots).toHaveLength(4);
      const bySlot = Object.fromEntries(slots.map((s) => [s.startMinutes, s.isDoubleBooked]));
      expect(bySlot[540]).toBe(false);
      expect(bySlot[555]).toBe(true);
      expect(bySlot[570]).toBe(false);
      expect(bySlot[585]).toBe(false);
    });

    it('an existing appointment of a different length still flags every overlapping slot', () => {
      const slots = generateSlotsForVetDay(
        { openMinutes: 540, closeMinutes: 600 },
        [],
        [{ startMinutes: 550, endMinutes: 580 }],
        15,
      );
      const bySlot = Object.fromEntries(slots.map((s) => [s.startMinutes, s.isDoubleBooked]));
      expect(bySlot[540]).toBe(true);
      expect(bySlot[555]).toBe(true);
      expect(bySlot[570]).toBe(true);
      expect(bySlot[585]).toBe(false);
    });

    it('guards durationMinutes <= 0 by returning no slots', () => {
      expect(generateSlotsForVetDay({ openMinutes: 540, closeMinutes: 600 }, [], [], 0)).toEqual([]);
      expect(generateSlotsForVetDay({ openMinutes: 540, closeMinutes: 600 }, [], [], -15)).toEqual([]);
    });
  });

  describe('resolveDayHours', () => {
    const openTemplate = { isClosed: false, openMinutes: 540, closeMinutes: 1080 };
    const closedTemplate = { isClosed: true, openMinutes: null, closeMinutes: null };

    it('prefers an override over the template (half-day override)', () => {
      const override = { isClosed: false, openMinutes: 540, closeMinutes: 780 };
      expect(resolveDayHours(openTemplate, override)).toEqual({ openMinutes: 540, closeMinutes: 780 });
    });

    it('a full-day-closed override wins even when the template is open', () => {
      const override = { isClosed: true, openMinutes: null, closeMinutes: null };
      expect(resolveDayHours(openTemplate, override)).toBeNull();
    });

    it('falls back to the template when there is no override', () => {
      expect(resolveDayHours(openTemplate, null)).toEqual({ openMinutes: 540, closeMinutes: 1080 });
    });

    it('returns null when the template is closed and there is no override', () => {
      expect(resolveDayHours(closedTemplate, null)).toBeNull();
    });
  });

  describe('subtractBlockedRanges', () => {
    it('merges overlapping blocks into a single normalized range', () => {
      const merged = subtractBlockedRanges([
        { startMinutes: 540, endMinutes: 600 },
        { startMinutes: 590, endMinutes: 640 },
      ]);
      expect(merged).toEqual([{ startMinutes: 540, endMinutes: 640 }]);
    });

    it('leaves non-overlapping ranges distinct', () => {
      const merged = subtractBlockedRanges([
        { startMinutes: 540, endMinutes: 560 },
        { startMinutes: 600, endMinutes: 620 },
      ]);
      expect(merged).toEqual([
        { startMinutes: 540, endMinutes: 560 },
        { startMinutes: 600, endMinutes: 620 },
      ]);
    });

    it('returns an empty array for an empty input', () => {
      expect(subtractBlockedRanges([])).toEqual([]);
    });
  });
});
