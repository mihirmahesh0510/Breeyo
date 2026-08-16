import { describe, it, expect } from 'vitest';
import { getTodayIST, addDaysIST, IST_TIMEZONE } from '../ist-date.js';
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
