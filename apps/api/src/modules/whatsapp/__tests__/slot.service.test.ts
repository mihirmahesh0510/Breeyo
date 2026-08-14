import { describe, it, expect, vi } from 'vitest';
import { WA_CAPABILITY_LIMITS } from '@breeyo/types';
import { SlotService, generateSlotsForDay, formatSlotLabel } from '../booking/slot.service.js';

/**
 * WHA-03 / D-07, D-08, Pitfall 15 — SlotService (07-RESEARCH § Pattern 8,
 * Cloud API Constraints).
 *
 * `generateSlotsForDay` and `formatSlotLabel` are pure (no I/O, no live
 * clock unless a `now` is passed explicitly) — every test below fixes `now`
 * to a value years away from the fixture dates so "is this today" never
 * depends on the actual wall clock the suite happens to run on.
 */

// A fixed "not today" reference instant — every generateSlotsForDay case
// that is not specifically testing the "today" branch passes this so the
// fixture dates below are never accidentally treated as today.
const FAR_PAST_NOW = new Date('2020-01-01T00:00:00.000Z');

// IST midnight for 2026-08-14 (a Friday), expressed as the UTC instant
// getTodayIST() would produce for that IST calendar date.
const AUG_14_2026_IST_MIDNIGHT = new Date(Date.UTC(2026, 7, 14, -5, -30, 0, 0));

const OPEN_9_TO_12 = { open: '09:00', close: '12:00', closed: false };

describe('generateSlotsForDay (WHA-03, D-08)', () => {
  it('returns 6 slots at 540/570/600/630/660/690 for 09:00-12:00 at 30-minute spacing', () => {
    const slots = generateSlotsForDay(AUG_14_2026_IST_MIDNIGHT, OPEN_9_TO_12, 30, [], FAR_PAST_NOW);

    expect(slots.map((s) => s.slotStartMinutes)).toEqual([540, 570, 600, 630, 660, 690]);
  });

  it('returns an empty array when the day is closed', () => {
    const slots = generateSlotsForDay(
      AUG_14_2026_IST_MIDNIGHT,
      { open: '09:00', close: '12:00', closed: true },
      30,
      [],
      FAR_PAST_NOW,
    );

    expect(slots).toEqual([]);
  });

  it('excludes slots whose startMinutes appear in the held list (D-08)', () => {
    const slots = generateSlotsForDay(
      AUG_14_2026_IST_MIDNIGHT,
      OPEN_9_TO_12,
      30,
      [570, 660],
      FAR_PAST_NOW,
    );

    expect(slots.map((s) => s.slotStartMinutes)).toEqual([540, 600, 630, 690]);
  });

  it('never returns more than WA_CAPABILITY_LIMITS.maxListRows slots, and preserves ascending order', () => {
    // 08:00-16:00 at 30 minutes = 16 open slots.
    const slots = generateSlotsForDay(
      AUG_14_2026_IST_MIDNIGHT,
      { open: '08:00', close: '16:00', closed: false },
      30,
      [],
      FAR_PAST_NOW,
    );

    expect(slots.length).toBe(WA_CAPABILITY_LIMITS.maxListRows);
    expect(slots.length).toBeLessThanOrEqual(10);
    const starts = slots.map((s) => s.slotStartMinutes);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('excludes slots whose start time has already passed in IST when the date is today', () => {
    // "Now" is 10:15 IST on 2026-08-14 itself: 615 minutes since IST midnight.
    const nowToday = new Date(AUG_14_2026_IST_MIDNIGHT.getTime() + 615 * 60 * 1000);

    const slots = generateSlotsForDay(AUG_14_2026_IST_MIDNIGHT, OPEN_9_TO_12, 30, [], nowToday);

    // 540, 570, 600 are <= 615 and must be excluded; 630/660/690 remain.
    expect(slots.map((s) => s.slotStartMinutes)).toEqual([630, 660, 690]);
  });

  it('does not emit a partial trailing slot that would end after close (close 12:15, 30-minute duration)', () => {
    const slots = generateSlotsForDay(
      AUG_14_2026_IST_MIDNIGHT,
      { open: '09:00', close: '12:15', closed: false },
      30,
      [],
      FAR_PAST_NOW,
    );

    // A slot starting at 720 (12:00) would end at 750 (12:30), after the
    // 735 (12:15) close — it must not appear.
    expect(slots.some((s) => s.slotStartMinutes === 720)).toBe(false);
    expect(slots.map((s) => s.slotStartMinutes)).toEqual([540, 570, 600, 630, 660, 690]);
  });
});

describe('formatSlotLabel (Meta 24-char row-title limit)', () => {
  it("formats 2026-08-14 at 630 minutes as 'Fri 14 Aug, 10:30 AM' (Aug 14 2026 is a Friday) and stays within the 24-char limit", () => {
    const label = formatSlotLabel(AUG_14_2026_IST_MIDNIGHT, 630);

    expect(label).toBe('Fri 14 Aug, 10:30 AM');
    expect(label.length).toBeLessThanOrEqual(WA_CAPABILITY_LIMITS.maxListRowTitleChars);
  });

  it('keeps every generated slot label in a full-day fixture at or under 24 characters', () => {
    const slots = generateSlotsForDay(
      AUG_14_2026_IST_MIDNIGHT,
      { open: '00:00', close: '23:30', closed: false },
      30,
      [],
      FAR_PAST_NOW,
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.label.length).toBeLessThanOrEqual(WA_CAPABILITY_LIMITS.maxListRowTitleChars);
    }
  });
});

// ─── SlotService.getOfferableSlots — the only method that touches Postgres ──

function buildWorkingHours(dayHours: { open: string; close: string; closed: boolean }) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hours: Record<string, typeof dayHours> = {};
  for (const day of days) hours[day] = dayHours;
  return { hours };
}

function createMockPrisma(overrides: {
  workingHours?: unknown;
  holds?: { slotDate: Date; slotStartMinutes: number }[];
} = {}) {
  return {
    clinic: {
      findUnique: vi.fn().mockResolvedValue({ workingHours: overrides.workingHours ?? null }),
    },
    whatsAppSlotHold: {
      findMany: vi.fn().mockResolvedValue(overrides.holds ?? []),
    },
  };
}

describe('SlotService.getOfferableSlots (Pitfall 15, D-07/D-08)', () => {
  it("returns { slots: [], reason: 'NO_WORKING_HOURS' } when Clinic.workingHours is null", async () => {
    const prisma = createMockPrisma({ workingHours: null });
    const service = new SlotService(prisma as any);

    const result = await service.getOfferableSlots('clinic-1', { now: FAR_PAST_NOW });

    expect(result).toEqual({ slots: [], reason: 'NO_WORKING_HOURS' });
  });

  it("returns { slots: [], reason: 'NO_WORKING_HOURS' } when workingHours fails workingHoursBodySchema parsing", async () => {
    const prisma = createMockPrisma({ workingHours: { notHours: true } });
    const service = new SlotService(prisma as any);

    const result = await service.getOfferableSlots('clinic-1', { now: FAR_PAST_NOW });

    expect(result).toEqual({ slots: [], reason: 'NO_WORKING_HOURS' });
  });

  it("returns { slots: [], reason: 'FULLY_BOOKED' } when every generated slot is held", async () => {
    // A fixed "now" whose IST-midnight never matches any generated fixture
    // date, so no slot is ever excluded as "already past" here — only the
    // held-slot exclusion is under test.
    const now = FAR_PAST_NOW;
    const workingHours = buildWorkingHours({ open: '09:00', close: '09:30', closed: false });
    // getTodayIST(FAR_PAST_NOW) anchors the fromDate; hold every day in the
    // default horizon at the one 30-minute slot (540).
    const fromDate = new Date(
      Date.UTC(
        FAR_PAST_NOW.getUTCFullYear(),
        FAR_PAST_NOW.getUTCMonth(),
        FAR_PAST_NOW.getUTCDate(),
        -5,
        -30,
        0,
        0,
      ),
    );
    const horizonDays = 14;
    const holds = Array.from({ length: horizonDays + 1 }, (_, i) => ({
      slotDate: new Date(fromDate.getTime() + i * 24 * 60 * 60 * 1000),
      slotStartMinutes: 540,
    }));

    const prisma = createMockPrisma({ workingHours, holds });
    const service = new SlotService(prisma as any);

    const result = await service.getOfferableSlots('clinic-1', { now, horizonDays });

    expect(result).toEqual({ slots: [], reason: 'FULLY_BOOKED' });
  });

  it('looks ahead across days until it finds up to 10 offerable slots, and never returns more than 10', async () => {
    // One 30-minute slot per day (09:00-09:30), no holds — 10 slots requires
    // walking forward across 10 distinct days.
    const workingHours = buildWorkingHours({ open: '09:00', close: '09:30', closed: false });
    const prisma = createMockPrisma({ workingHours, holds: [] });
    const service = new SlotService(prisma as any);

    const result = await service.getOfferableSlots('clinic-1', {
      now: FAR_PAST_NOW,
      horizonDays: 20,
    });

    expect(result.reason).toBeUndefined();
    expect(result.slots.length).toBe(10);
    const distinctDates = new Set(result.slots.map((s) => s.slotDate.getTime()));
    expect(distinctDates.size).toBe(10);
  });

  it('uses IST-anchored dates from ist-date.ts, never the raw local clock', async () => {
    const workingHours = buildWorkingHours({ open: '09:00', close: '12:00', closed: false });
    const prisma = createMockPrisma({ workingHours, holds: [] });
    const service = new SlotService(prisma as any);

    const result = await service.getOfferableSlots('clinic-1', { now: FAR_PAST_NOW });

    expect(result.slots.length).toBeGreaterThan(0);
    // Every returned slotDate must be IST midnight-anchored: minutes/seconds
    // portion of the underlying instant must match getTodayIST's own
    // construction (UTC hour -5, minute -30 => 18:30 UTC on the previous day).
    for (const slot of result.slots) {
      expect(slot.slotDate.getUTCHours()).toBe(18);
      expect(slot.slotDate.getUTCMinutes()).toBe(30);
    }
  });
});
