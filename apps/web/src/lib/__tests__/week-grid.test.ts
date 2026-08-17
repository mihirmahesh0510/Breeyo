import { describe, it, expect } from 'vitest';
import { buildWeekRange, computeRowBounds, placeAppointments } from '../week-grid';
import type { AppointmentWithDetails } from '@breeyo/types';

// Minimal fake appointment factory -- tests only care about `scheduledFor`
// and `durationMinutes`, the two fields `placeAppointments` actually reads.
// Everything else on `AppointmentWithDetails` is irrelevant to this pure
// geometry module, so it is cast rather than fully populated (the same
// pattern `agenda-utils.test.ts` uses on mobile).
function fakeAppointment(
  isoScheduledFor: string,
  durationMinutes: number,
  id = 'appt-1',
): AppointmentWithDetails {
  return {
    id,
    scheduledFor: new Date(isoScheduledFor),
    durationMinutes,
  } as unknown as AppointmentWithDetails;
}

describe('buildWeekRange', () => {
  it('returns Monday through Sunday containing the given date', () => {
    // 2026-08-19 is a Wednesday (IST).
    const { from, to, days } = buildWeekRange(new Date('2026-08-19T10:00:00+05:30'));

    expect(days).toHaveLength(7);
    // Monday 2026-08-17 IST midnight.
    expect(from.toISOString()).toBe(new Date('2026-08-17T00:00:00+05:30').toISOString());
    // Exclusive upper bound: the following Monday.
    expect(to.toISOString()).toBe(new Date('2026-08-24T00:00:00+05:30').toISOString());
    expect(days[0].toISOString()).toBe(from.toISOString());
    expect(days[6].toISOString()).toBe(new Date('2026-08-23T00:00:00+05:30').toISOString());
  });

  it('is stable across a month boundary', () => {
    // 2026-08-31 is a Monday (IST) -- the week should run Mon 31 Aug through
    // Sun 6 Sep, straddling the month change without off-by-one drift.
    const { from, to, days } = buildWeekRange(new Date('2026-08-31T10:00:00+05:30'));

    expect(from.toISOString()).toBe(new Date('2026-08-31T00:00:00+05:30').toISOString());
    expect(to.toISOString()).toBe(new Date('2026-09-07T00:00:00+05:30').toISOString());
    expect(days[6].toISOString()).toBe(new Date('2026-09-06T00:00:00+05:30').toISOString());
  });

  it('is stable across a year boundary', () => {
    // 2026-12-31 is a Thursday (IST) -- the week should run Mon 28 Dec 2026
    // through Sun 3 Jan 2027.
    const { from, to, days } = buildWeekRange(new Date('2026-12-31T10:00:00+05:30'));

    expect(from.toISOString()).toBe(new Date('2026-12-28T00:00:00+05:30').toISOString());
    expect(to.toISOString()).toBe(new Date('2027-01-04T00:00:00+05:30').toISOString());
    expect(days[6].toISOString()).toBe(new Date('2027-01-03T00:00:00+05:30').toISOString());
  });
});

describe('computeRowBounds', () => {
  it("spans the union of the week's open hours plus one hour of padding", () => {
    const bounds = computeRowBounds([
      { openMinutes: 540, closeMinutes: 1080 },
      { openMinutes: 600, closeMinutes: 1200 },
      null,
    ]);

    expect(bounds.startMinutes).toBe(480);
    expect(bounds.endMinutes).toBe(1260);
    expect(bounds.rowCount).toBe((1260 - 480) / 30);
  });

  it('falls back to a sensible default when no hours are configured', () => {
    const bounds = computeRowBounds([null, null, null]);

    expect(bounds.startMinutes).toBe(540); // 9am
    expect(bounds.endMinutes).toBe(1080); // 6pm
    expect(bounds.rowCount).toBe((1080 - 540) / 30);
  });
});

describe('placeAppointments', () => {
  // A plain 09:00-18:00 grid, 30-minute rows -- matches the fallback bounds.
  const { days } = buildWeekRange(new Date('2026-08-19T10:00:00+05:30'));
  const bounds = computeRowBounds([null]);

  it('assigns a row index and a row span for durations under, at and over 30 minutes', () => {
    // Wednesday 2026-08-19, day index 2 (Mon=0).
    const fifteenMin = fakeAppointment('2026-08-19T14:30:00+05:30', 15, 'a');
    const fortyFiveMin = fakeAppointment('2026-08-19T15:30:00+05:30', 45, 'b');
    const sixtyMin = fakeAppointment('2026-08-19T16:30:00+05:30', 60, 'c');

    const placed = placeAppointments([fifteenMin, fortyFiveMin, sixtyMin], days, bounds);

    const a = placed.find((p) => p.appointment.id === 'a')!;
    const b = placed.find((p) => p.appointment.id === 'b')!;
    const c = placed.find((p) => p.appointment.id === 'c')!;

    // 14:30 is 330 minutes after the 09:00 (540min) grid start -> row 11.
    expect(a.rowIndex).toBe(11);
    expect(a.rowSpan).toBe(1);
    expect(b.rowSpan).toBe(2);
    expect(c.rowSpan).toBe(2);
  });

  it('gives an appointment shorter than 30 minutes a full row (no sub-row sizing)', () => {
    const tenMin = fakeAppointment('2026-08-19T09:00:00+05:30', 10, 'short');
    const [placed] = placeAppointments([tenMin], days, bounds);
    expect(placed.rowSpan).toBe(1);
  });

  it('lays three overlapping appointments side by side with distinct column indices', () => {
    const one = fakeAppointment('2026-08-19T10:00:00+05:30', 30, 'one');
    const two = fakeAppointment('2026-08-19T10:00:00+05:30', 30, 'two');
    const three = fakeAppointment('2026-08-19T10:15:00+05:30', 30, 'three');

    const placed = placeAppointments([one, two, three], days, bounds);
    const columns = placed.map((p) => p.columnIndex).sort();

    expect(placed).toHaveLength(3);
    expect(columns).toEqual([0, 1, 2]);
    for (const block of placed) {
      expect(block.columnCount).toBe(3);
    }
  });

  it('collapses a fourth overlapping appointment into an overflow count instead of a fourth block', () => {
    const one = fakeAppointment('2026-08-19T11:00:00+05:30', 30, 'one');
    const two = fakeAppointment('2026-08-19T11:00:00+05:30', 30, 'two');
    const three = fakeAppointment('2026-08-19T11:00:00+05:30', 30, 'three');
    const four = fakeAppointment('2026-08-19T11:00:00+05:30', 30, 'four');

    const placed = placeAppointments([one, two, three, four], days, bounds);

    // Only 3 blocks are ever rendered for the cell.
    expect(placed).toHaveLength(3);
    const totalOverflow = placed.reduce((sum, p) => sum + p.overflowCount, 0);
    expect(totalOverflow).toBe(1);
    // The overflow count is reported on the last visible block.
    const last = placed.find((p) => p.columnIndex === 2)!;
    expect(last.overflowCount).toBe(1);
  });

  it('clamps an appointment outside the computed row range into the first row instead of dropping it', () => {
    const earlyBird = fakeAppointment('2026-08-19T06:00:00+05:30', 30, 'early');
    const placed = placeAppointments([earlyBird], days, bounds);

    expect(placed).toHaveLength(1);
    expect(placed[0].rowIndex).toBe(0);
  });

  it('groups appointments by day column correctly across the week, including Sunday in the last column', () => {
    const monday = fakeAppointment('2026-08-17T09:00:00+05:30', 30, 'mon');
    const sunday = fakeAppointment('2026-08-23T09:00:00+05:30', 30, 'sun');

    const placed = placeAppointments([monday, sunday], days, bounds);
    const mondayBlock = placed.find((p) => p.appointment.id === 'mon')!;
    const sundayBlock = placed.find((p) => p.appointment.id === 'sun')!;

    expect(mondayBlock.dayIndex).toBe(0);
    expect(sundayBlock.dayIndex).toBe(6);
  });
});
