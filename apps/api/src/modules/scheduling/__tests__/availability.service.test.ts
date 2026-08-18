import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import { BlockedPeriodReason } from '@breeyo/types';
import { AvailabilityService } from '../availability.service.js';
import type { AvailabilityRepository } from '../availability.repository.js';
import { weekdayIST, istDateOnly, minutesToIstDate } from '../../../lib/ist-date.js';

function createMockRepository(): AvailabilityRepository {
  return {
    getTemplateForVet: vi.fn(),
    getTemplateDay: vi.fn(),
    replaceTemplate: vi.fn(),
    getOverride: vi.fn(),
    getOverridesInRange: vi.fn(),
    upsertOverride: vi.fn(),
    deleteOverride: vi.fn(),
    getBlockedPeriods: vi.fn(),
    getBlockedPeriodsInRange: vi.fn(),
    createBlockedPeriod: vi.fn(),
    deleteBlockedPeriod: vi.fn(),
    findOverlappingBlockedPeriod: vi.fn(),
    listClinicVets: vi.fn(),
  } as unknown as AvailabilityRepository;
}

function createMockPrisma() {
  return {
    clinicMember: {
      findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }),
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    authAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

function createMockIO(): Server {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
  } as unknown as Server;
}

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_CLINIC_ID = '00000000-0000-0000-0000-000000000099';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const VET_ID = '00000000-0000-0000-0000-000000000020';
const BLOCKED_PERIOD_ID = '00000000-0000-0000-0000-000000000030';

// A fixed instant, used only to derive a real IST weekday via the
// already-tested ist-date helpers -- this test never hardcodes which
// weekday number a date maps to.
const REFERENCE_DATE = new Date('2026-08-19T06:00:00.000Z');
const REFERENCE_WEEKDAY = weekdayIST(REFERENCE_DATE);
const REFERENCE_DAY_MIDNIGHT = istDateOnly(REFERENCE_DATE);

function buildTemplateDays(overrides: Partial<Record<number, { isClosed: boolean; openMinutes: number | null; closeMinutes: number | null }>> = {}) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    isClosed: false,
    openMinutes: 540,
    closeMinutes: 1080,
    ...(overrides[weekday] ?? {}),
  }));
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let repo: ReturnType<typeof createMockRepository>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let io: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    repo = createMockRepository();
    prisma = createMockPrisma();
    io = createMockIO();
    service = new AvailabilityService(repo, prisma, io);
  });

  describe('resolveAvailabilityForDate', () => {
    it('uses the weekday template when there is no override', async () => {
      vi.mocked(repo.getTemplateDay).mockResolvedValue({
        isClosed: false,
        openMinutes: 540,
        closeMinutes: 1080,
      } as any);
      vi.mocked(repo.getOverride).mockResolvedValue(null);

      const result = await service.resolveAvailabilityForDate({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        vetId: VET_ID,
        date: REFERENCE_DATE,
      });

      expect(result).toEqual({ openMinutes: 540, closeMinutes: 1080 });
      expect(repo.getTemplateDay).toHaveBeenCalledWith(CLINIC_ID, VET_ID, REFERENCE_WEEKDAY);
    });

    it('applies a full-day-closed override even when the template is open', async () => {
      vi.mocked(repo.getTemplateDay).mockResolvedValue({
        isClosed: false,
        openMinutes: 540,
        closeMinutes: 1080,
      } as any);
      vi.mocked(repo.getOverride).mockResolvedValue({
        isClosed: true,
        openMinutes: null,
        closeMinutes: null,
      } as any);

      const result = await service.resolveAvailabilityForDate({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        vetId: VET_ID,
        date: REFERENCE_DATE,
      });

      expect(result).toBeNull();
    });

    it('applies a half-day override', async () => {
      vi.mocked(repo.getTemplateDay).mockResolvedValue({
        isClosed: false,
        openMinutes: 540,
        closeMinutes: 1080,
      } as any);
      vi.mocked(repo.getOverride).mockResolvedValue({
        isClosed: false,
        openMinutes: 540,
        closeMinutes: 780,
      } as any);

      const result = await service.resolveAvailabilityForDate({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        vetId: VET_ID,
        date: REFERENCE_DATE,
      });

      expect(result).toEqual({ openMinutes: 540, closeMinutes: 780 });
    });
  });

  describe('getOfferableSlots', () => {
    it('composes resolved hours, blocked ranges and injected existing appointments', async () => {
      vi.mocked(repo.getTemplateDay).mockResolvedValue({
        isClosed: false,
        openMinutes: 540,
        closeMinutes: 600,
      } as any);
      vi.mocked(repo.getOverride).mockResolvedValue(null);
      vi.mocked(repo.getBlockedPeriods).mockResolvedValue([
        { startMinutes: 555, endMinutes: 570 },
      ] as any);

      const slots = await service.getOfferableSlots({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        vetId: VET_ID,
        date: REFERENCE_DATE,
        durationMinutes: 15,
        existing: [{ startMinutes: 570, endMinutes: 585 }],
      });

      expect(slots.map((s) => s.startMinutes)).toEqual([540, 570, 585]);
      const bySlot = Object.fromEntries(slots.map((s) => [s.startMinutes, s.isDoubleBooked]));
      expect(bySlot[540]).toBe(false);
      expect(bySlot[570]).toBe(true);
      expect(bySlot[585]).toBe(false);
    });
  });

  describe('createBlockedPeriod', () => {
    const validParams = {
      clinicId: CLINIC_ID,
      userId: USER_ID,
      vetId: VET_ID,
      date: REFERENCE_DATE,
      startMinutes: 780,
      endMinutes: 840,
      reason: BlockedPeriodReason.LUNCH,
    };

    it('rejects an overlap with an existing blocked period (409 BLOCKED_PERIOD_OVERLAP)', async () => {
      vi.mocked(repo.findOverlappingBlockedPeriod).mockResolvedValue({ id: 'existing' } as any);

      await expect(service.createBlockedPeriod(validParams as any)).rejects.toMatchObject({
        statusCode: 409,
        code: 'BLOCKED_PERIOD_OVERLAP',
        message: 'This overlaps an existing blocked period. Adjust the times.',
      });
      expect(repo.createBlockedPeriod).not.toHaveBeenCalled();
    });

    it('rejects end-before-start (400 INVALID_TIME_RANGE)', async () => {
      await expect(
        service.createBlockedPeriod({ ...validParams, startMinutes: 800, endMinutes: 800 } as any),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_TIME_RANGE',
        message: 'End time must be after start time.',
      });
      expect(repo.findOverlappingBlockedPeriod).not.toHaveBeenCalled();
    });

    it('rejects OTHER reason with no reasonText (400 REASON_TEXT_REQUIRED)', async () => {
      await expect(
        service.createBlockedPeriod({
          ...validParams,
          reason: BlockedPeriodReason.OTHER,
          reasonText: undefined,
        } as any),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'REASON_TEXT_REQUIRED',
        message: 'Add a short reason.',
      });
      expect(repo.findOverlappingBlockedPeriod).not.toHaveBeenCalled();
    });

    it('succeeds, audit-logs BLOCKED_PERIOD_ADDED and broadcasts AVAILABILITY_UPDATED', async () => {
      vi.mocked(repo.findOverlappingBlockedPeriod).mockResolvedValue(null);
      vi.mocked(repo.createBlockedPeriod).mockResolvedValue({ id: BLOCKED_PERIOD_ID, ...validParams } as any);

      const result = await service.createBlockedPeriod(validParams as any);

      expect(result.blockedPeriod).toMatchObject({ id: BLOCKED_PERIOD_ID });
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: 'BLOCKED_PERIOD_ADDED' }),
        }),
      );
      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    });

    it('D-30: reports appointments already inside the blocked window without rejecting', async () => {
      vi.mocked(repo.findOverlappingBlockedPeriod).mockResolvedValue(null);
      vi.mocked(repo.createBlockedPeriod).mockResolvedValue({ id: BLOCKED_PERIOD_ID, ...validParams } as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([
        {
          scheduledFor: minutesToIstDate(REFERENCE_DAY_MIDNIGHT, 13 * 60 + 15),
          durationMinutes: 15,
        },
      ] as any);

      const result = await service.createBlockedPeriod(validParams as any);

      expect(result.affectedAppointmentCount).toBe(1);
    });

    it('D-30: reports zero when no appointment falls inside the blocked window', async () => {
      vi.mocked(repo.findOverlappingBlockedPeriod).mockResolvedValue(null);
      vi.mocked(repo.createBlockedPeriod).mockResolvedValue({ id: BLOCKED_PERIOD_ID, ...validParams } as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([]);

      const result = await service.createBlockedPeriod(validParams as any);

      expect(result.affectedAppointmentCount).toBe(0);
    });
  });

  describe('replaceWeeklyTemplate', () => {
    it('audit-logs AVAILABILITY_UPDATED with vetId in metadata and broadcasts', async () => {
      const days = buildTemplateDays();
      vi.mocked(repo.replaceTemplate).mockResolvedValue(days as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([]);

      await service.replaceWeeklyTemplate({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        vetId: VET_ID,
        days,
      } as any);

      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'AVAILABILITY_UPDATED',
            metadata: expect.objectContaining({ vetId: VET_ID }),
          }),
        }),
      );
      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    });

    it('D-30: reports an appointment that falls outside the newly-saved hours', async () => {
      const days = buildTemplateDays({
        [REFERENCE_WEEKDAY]: { isClosed: false, openMinutes: 540, closeMinutes: 17 * 60 },
      });
      vi.mocked(repo.replaceTemplate).mockResolvedValue(days as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([
        {
          scheduledFor: minutesToIstDate(REFERENCE_DAY_MIDNIGHT, 17 * 60 + 30),
          durationMinutes: 15,
        },
      ] as any);

      const result = await service.replaceWeeklyTemplate({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        vetId: VET_ID,
        days,
      } as any);

      expect(result.affectedAppointmentCount).toBe(1);
    });

    it('D-30: reports zero when the new template still covers the appointment', async () => {
      const days = buildTemplateDays({
        [REFERENCE_WEEKDAY]: { isClosed: false, openMinutes: 540, closeMinutes: 18 * 60 },
      });
      vi.mocked(repo.replaceTemplate).mockResolvedValue(days as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([
        {
          scheduledFor: minutesToIstDate(REFERENCE_DAY_MIDNIGHT, 17 * 60 + 30),
          durationMinutes: 15,
        },
      ] as any);

      const result = await service.replaceWeeklyTemplate({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        vetId: VET_ID,
        days,
      } as any);

      expect(result.affectedAppointmentCount).toBe(0);
    });
  });

  describe('removeBlockedPeriod', () => {
    it('throws 404 BLOCKED_PERIOD_NOT_FOUND when the repository deletes zero rows', async () => {
      vi.mocked(repo.deleteBlockedPeriod).mockResolvedValue(0);

      await expect(
        service.removeBlockedPeriod({
          clinicId: CLINIC_ID,
          userId: USER_ID,
          blockedPeriodId: BLOCKED_PERIOD_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'BLOCKED_PERIOD_NOT_FOUND' });
    });

    it('is rejected with the same 404 (never 403) for a vet in another clinic', async () => {
      vi.mocked(repo.deleteBlockedPeriod).mockResolvedValue(0);

      await expect(
        service.removeBlockedPeriod({
          clinicId: OTHER_CLINIC_ID,
          userId: USER_ID,
          blockedPeriodId: BLOCKED_PERIOD_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'BLOCKED_PERIOD_NOT_FOUND' });

      expect(repo.deleteBlockedPeriod).toHaveBeenCalledWith(OTHER_CLINIC_ID, BLOCKED_PERIOD_ID);
    });
  });
});
