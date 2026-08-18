import { describe, it, expect } from 'vitest';
import {
  createAppointmentSchema,
  createBlockedPeriodSchema,
  upsertAvailabilityTemplateSchema,
  appointmentRangeQuerySchema,
} from '../scheduling.js';
import { queueStatusUpdateSchema } from '../queue.js';

const UUID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const UUID_2 = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';

describe('createAppointmentSchema — minimal valid booking', () => {
  it('accepts one pet, uuid refs, ISO scheduledFor, no recurrence', () => {
    const result = createAppointmentSchema.safeParse({
      ownerId: UUID,
      petIds: [UUID_2],
      vetId: UUID,
      serviceCatalogId: UUID,
      scheduledFor: '2026-09-01T09:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowDoubleBook).toBe(false);
      expect(result.data.recurrence).toBeUndefined();
    }
  });

  it('rejects an empty petIds array', () => {
    const result = createAppointmentSchema.safeParse({
      ownerId: UUID,
      petIds: [],
      vetId: UUID,
      serviceCatalogId: UUID,
      scheduledFor: '2026-09-01T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 6 petIds', () => {
    const result = createAppointmentSchema.safeParse({
      ownerId: UUID,
      petIds: Array.from({ length: 7 }, () => UUID_2),
      vetId: UUID,
      serviceCatalogId: UUID,
      scheduledFor: '2026-09-01T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('createAppointmentSchema — recurrence', () => {
  const base = {
    ownerId: UUID,
    petIds: [UUID_2],
    vetId: UUID,
    serviceCatalogId: UUID,
    scheduledFor: '2026-09-01T09:00:00.000Z',
  };

  it('parses a valid recurrence block', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      recurrence: { interval: 'WEEKLY', occurrences: 4 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects occurrences below the minimum', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      recurrence: { interval: 'WEEKLY', occurrences: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects occurrences above the maximum', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      recurrence: { interval: 'WEEKLY', occurrences: 13 },
    });
    expect(result.success).toBe(false);
  });
});

describe('createBlockedPeriodSchema — OTHER reason requires reasonText', () => {
  const base = { vetId: UUID, date: '2026-09-01T00:00:00.000Z', startMinutes: 600, endMinutes: 660 };

  it('rejects OTHER with no reasonText', () => {
    const result = createBlockedPeriodSchema.safeParse({ ...base, reason: 'OTHER' });
    expect(result.success).toBe(false);
  });

  it('parses OTHER with reasonText', () => {
    const result = createBlockedPeriodSchema.safeParse({ ...base, reason: 'OTHER', reasonText: 'Vet conference' });
    expect(result.success).toBe(true);
  });

  it('parses LUNCH with no reasonText', () => {
    const result = createBlockedPeriodSchema.safeParse({ ...base, reason: 'LUNCH' });
    expect(result.success).toBe(true);
  });

  it('rejects endMinutes <= startMinutes', () => {
    const result = createBlockedPeriodSchema.safeParse({ ...base, reason: 'LUNCH', endMinutes: 600 });
    expect(result.success).toBe(false);
  });
});

describe('upsertAvailabilityTemplateSchema', () => {
  function dayEntry(weekday: number, overrides: Record<string, unknown> = {}) {
    return {
      weekday,
      isClosed: false,
      openMinutes: 540 as number | null,
      closeMinutes: 1080 as number | null,
      ...overrides,
    };
  }

  it('parses a 7-entry array covering weekdays 0..6', () => {
    const days = Array.from({ length: 7 }, (_, weekday) => dayEntry(weekday));
    const result = upsertAvailabilityTemplateSchema.safeParse({ vetId: UUID, days });
    expect(result.success).toBe(true);
  });

  it('rejects a duplicate weekday', () => {
    const days = Array.from({ length: 6 }, (_, weekday) => dayEntry(weekday));
    days.push(dayEntry(0));
    const result = upsertAvailabilityTemplateSchema.safeParse({ vetId: UUID, days });
    expect(result.success).toBe(false);
  });

  it('rejects isClosed false with null openMinutes', () => {
    const days = Array.from({ length: 7 }, (_, weekday) => dayEntry(weekday));
    days[0] = { weekday: 0, isClosed: false, openMinutes: null, closeMinutes: 1080 };
    const result = upsertAvailabilityTemplateSchema.safeParse({ vetId: UUID, days });
    expect(result.success).toBe(false);
  });

  it('rejects closeMinutes <= openMinutes', () => {
    const days = Array.from({ length: 7 }, (_, weekday) => dayEntry(weekday));
    days[0] = { weekday: 0, isClosed: false, openMinutes: 600, closeMinutes: 600 };
    const result = upsertAvailabilityTemplateSchema.safeParse({ vetId: UUID, days });
    expect(result.success).toBe(false);
  });

  it('rejects weekday 7', () => {
    const days = Array.from({ length: 6 }, (_, weekday) => dayEntry(weekday));
    days.push(dayEntry(7));
    const result = upsertAvailabilityTemplateSchema.safeParse({ vetId: UUID, days });
    expect(result.success).toBe(false);
  });
});

describe('queueStatusUpdateSchema accepts EXPECTED', () => {
  it('parses EXPECTED', () => {
    const result = queueStatusUpdateSchema.safeParse({ status: 'EXPECTED' });
    expect(result.success).toBe(true);
  });
});

describe('appointmentRangeQuerySchema', () => {
  it('coerces from/to from ISO strings', () => {
    const result = appointmentRangeQuerySchema.safeParse({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-05T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from instanceof Date).toBe(true);
    }
  });

  it('rejects to before from', () => {
    const result = appointmentRangeQuerySchema.safeParse({
      from: '2026-09-05T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a range wider than 62 days', () => {
    const result = appointmentRangeQuerySchema.safeParse({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
