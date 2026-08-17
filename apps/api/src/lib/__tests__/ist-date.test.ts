import { describe, it, expect } from 'vitest';
import {
  getTodayIST,
  addDaysIST,
  IST_TIMEZONE,
  istDateOnly,
  istDayBounds,
  minutesToIstDate,
  istMinutesOfDay,
  weekdayIST,
} from '../ist-date.js';
import { QueueRepository } from '../../modules/queue/queue.repository.js';

describe('ist-date (WHA-01 / D-01, D-02)', () => {
  it('exports IST_TIMEZONE as Asia/Kolkata', () => {
    expect(IST_TIMEZONE).toBe('Asia/Kolkata');
  });

  it('getTodayIST rolls over to the next IST day when UTC time is past 18:30', () => {
    // 20:30 UTC on 2026-08-12 is 02:00 IST on 2026-08-13
    const result = getTodayIST(new Date('2026-08-12T20:30:00Z'));
    expect(result.toISOString()).toBe('2026-08-12T18:30:00.000Z');
  });

  it('getTodayIST stays on the same IST day when UTC time is before 18:30', () => {
    // 18:29 UTC on 2026-08-12 is 23:59 IST on 2026-08-12
    const result = getTodayIST(new Date('2026-08-12T18:29:00Z'));
    expect(result.toISOString()).toBe('2026-08-11T18:30:00.000Z');
  });

  it('getTodayIST with no argument returns midnight IST expressed as 18:30 UTC the previous day', () => {
    const result = getTodayIST();
    expect(result.getUTCHours()).toBe(18);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it('addDaysIST adds whole days forward across a normal boundary', () => {
    const today = getTodayIST(new Date('2026-08-12T06:00:00Z'));
    const result = addDaysIST(today, 3);
    // midnight IST on 2026-08-15
    expect(result.toISOString()).toBe('2026-08-14T18:30:00.000Z');
  });

  it('addDaysIST subtracts a day for a negative offset', () => {
    const today = getTodayIST(new Date('2026-08-12T06:00:00Z'));
    const result = addDaysIST(today, -1);
    // previous IST midnight (2026-08-11)
    expect(result.toISOString()).toBe('2026-08-10T18:30:00.000Z');
  });

  it('addDaysIST crosses a month boundary correctly', () => {
    const aug30Midnight = getTodayIST(new Date('2026-08-30T06:00:00Z'));
    const result = addDaysIST(aug30Midnight, 3);
    // midnight IST on 2026-09-02
    expect(result.toISOString()).toBe('2026-09-01T18:30:00.000Z');
  });

  it('QueueRepository.getTodayIST delegates to the shared helper (same value for the same input)', () => {
    const input = new Date('2026-08-12T20:30:00Z');
    expect(QueueRepository.getTodayIST(input).toISOString()).toBe(
      getTodayIST(input).toISOString(),
    );
  });
});

describe('ist-date extensions (08-04 D-08/D-10/D-11)', () => {
  it('getTodayIST returns IST midnight as a UTC instant', () => {
    // 2026-08-13T02:00:00Z is 07:30 IST on 13 Aug
    const result = getTodayIST(new Date('2026-08-13T02:00:00Z'));
    expect(result.toISOString()).toBe('2026-08-12T18:30:00.000Z');
  });

  it('getTodayIST rolls over at IST midnight, not UTC midnight', () => {
    // 2026-08-13T18:29:00Z is 23:59 IST on 13 Aug
    const beforeMidnight = getTodayIST(new Date('2026-08-13T18:29:00Z'));
    // 2026-08-13T18:31:00Z is 00:01 IST on 14 Aug
    const afterMidnight = getTodayIST(new Date('2026-08-13T18:31:00Z'));
    expect(beforeMidnight.toISOString()).not.toBe(afterMidnight.toISOString());
    expect(beforeMidnight.toISOString()).toBe('2026-08-12T18:30:00.000Z');
    expect(afterMidnight.toISOString()).toBe('2026-08-13T18:30:00.000Z');
  });

  it('istDateOnly returns IST midnight for the calendar day containing the instant, and is idempotent', () => {
    const input = new Date('2026-08-13T09:15:00Z'); // 14:45 IST on 13 Aug
    const once = istDateOnly(input);
    const twice = istDateOnly(once);
    expect(once.toISOString()).toBe('2026-08-12T18:30:00.000Z');
    expect(twice.toISOString()).toBe(once.toISOString());
  });

  it('addDaysIST(getTodayIST(ref), 1) equals IST midnight of the following IST day', () => {
    const ref = new Date('2026-08-13T09:15:00Z');
    const today = getTodayIST(ref);
    const tomorrow = addDaysIST(today, 1);
    expect(tomorrow.toISOString()).toBe(getTodayIST(new Date('2026-08-14T09:15:00Z')).toISOString());
  });

  it('addDaysIST(x, 90) lands exactly 90 IST days later, including across a month boundary', () => {
    const start = getTodayIST(new Date('2026-08-13T09:15:00Z'));
    const result = addDaysIST(start, 90);
    // 2026-08-13 + 90 days = 2026-11-11
    expect(result.toISOString()).toBe(getTodayIST(new Date('2026-11-11T09:15:00Z')).toISOString());
  });

  it('istDayBounds returns { start, end } spanning exactly one IST calendar day', () => {
    const input = new Date('2026-08-13T09:15:00Z');
    const { start, end } = istDayBounds(input);
    expect(start.toISOString()).toBe('2026-08-12T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-08-13T18:30:00.000Z');

    // gte start, lt end selects exactly the IST calendar day containing `input`
    expect(input.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(input.getTime()).toBeLessThan(end.getTime());
  });

  it('minutesToIstDate converts minutes-from-midnight to an absolute instant', () => {
    const istMidnight = getTodayIST(new Date('2026-08-13T09:15:00Z'));
    // 540 minutes = 09:00 IST on 13 Aug = 03:30 UTC on 13 Aug
    const result = minutesToIstDate(istMidnight, 540);
    expect(result.toISOString()).toBe('2026-08-13T03:30:00.000Z');
  });

  it('minutesToIstDate(x, 0) returns x', () => {
    const istMidnight = getTodayIST(new Date('2026-08-13T09:15:00Z'));
    const result = minutesToIstDate(istMidnight, 0);
    expect(result.toISOString()).toBe(istMidnight.toISOString());
  });

  it('istMinutesOfDay is the inverse of minutesToIstDate', () => {
    // 09:00 IST -> 540
    expect(istMinutesOfDay(new Date('2026-08-13T03:30:00.000Z'))).toBe(540);
    // 23:59 IST -> 1439
    expect(istMinutesOfDay(new Date('2026-08-13T18:29:00.000Z'))).toBe(1439);

    const istMidnight = getTodayIST(new Date('2026-08-13T09:15:00Z'));
    const roundTripped = minutesToIstDate(istMidnight, istMinutesOfDay(new Date('2026-08-13T10:00:00.000Z')));
    expect(roundTripped.toISOString()).toBe(new Date('2026-08-13T10:00:00.000Z').toISOString());
  });

  it('weekdayIST returns 0 for a known Sunday and 6 for the following Saturday', () => {
    // 2026-08-09 is a Sunday; 2026-08-15 is the following Saturday.
    const sunday = weekdayIST(new Date('2026-08-09T10:00:00Z')); // 15:30 IST, still Aug 9
    const saturday = weekdayIST(new Date('2026-08-15T10:00:00Z')); // 15:30 IST, still Aug 15
    expect(sunday).toBe(0);
    expect(saturday).toBe(6);
  });
});
