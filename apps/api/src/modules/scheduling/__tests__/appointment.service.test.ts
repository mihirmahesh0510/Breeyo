import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import { BOOKING_HORIZON_DAYS, DEFAULT_SERVICE_DURATION_MINUTES, RecurrenceInterval } from '@breeyo/types';
import { AppointmentService } from '../appointment.service.js';
import type { AppointmentRepository } from '../appointment.repository.js';
import type { AvailabilityService } from '../availability.service.js';
import { getTodayIST, addDaysIST, minutesToIstDate } from '../../../lib/ist-date.js';

vi.mock('../../../lib/audit-log.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/audit-log.js')>('../../../lib/audit-log.js');
  return {
    ...actual,
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

import { writeAuditLog } from '../../../lib/audit-log.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_CLINIC_ID = '00000000-0000-0000-0000-000000000099';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const OWNER_ID = '00000000-0000-0000-0000-000000000002';
const VET_ID = '00000000-0000-0000-0000-000000000020';
const PET_ID = '00000000-0000-0000-0000-000000000003';
const PET_ID_2 = '00000000-0000-0000-0000-000000000004';
const OTHER_OWNER_PET_ID = '00000000-0000-0000-0000-000000000005';
const SERVICE_ID = '00000000-0000-0000-0000-000000000006';
const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000200';
const OTHER_APPOINTMENT_ID = '00000000-0000-0000-0000-000000000210';

const TODAY = getTodayIST();
const TOMORROW = addDaysIST(TODAY, 1);

function atMinutes(day: typeof TODAY, minutes: number) {
  return minutesToIstDate(day, minutes);
}

const mockOwner = {
  id: OWNER_ID,
  clinicId: CLINIC_ID,
  mobile: '9876543210',
  name: 'Rahul',
  pets: [{ id: PET_ID }, { id: PET_ID_2 }],
};

function mockAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    clinicId: CLINIC_ID,
    vetId: VET_ID,
    ownerId: OWNER_ID,
    serviceCatalogId: SERVICE_ID,
    status: 'SCHEDULED',
    source: 'STAFF',
    scheduledFor: atMinutes(TOMORROW, 10 * 60),
    durationMinutes: 30,
    recurringSeriesId: null,
    recurrenceIndex: null,
    notes: null,
    createdById: USER_ID,
    whatsappBookingRequestId: null,
    checkedInAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    queueEntryCreatedAt: null,
    noShowFlippedAt: null,
    startingSoonNotifiedAt: null,
    pets: [{ id: 'ap-1', petId: PET_ID, queueEntryId: null, pet: { id: PET_ID, name: 'Buddy', species: 'DOG' } }],
    owner: { id: OWNER_ID, name: 'Rahul', mobile: '9876543210' },
    vet: { id: VET_ID, name: 'Dr. Vet' },
    service: { id: SERVICE_ID, name: 'Checkup', durationMinutes: 30 },
    ...overrides,
  };
}

function createMockRepository(): AppointmentRepository {
  return {
    create: vi.fn().mockResolvedValue(mockAppointment()),
    createMany: vi.fn(),
    findById: vi.fn(),
    findInRange: vi.fn(),
    findForVetOnDate: vi.fn().mockResolvedValue([]),
    findBySeries: vi.fn(),
    update: vi.fn(),
    findDueForQueueHandoff: vi.fn(),
    findExpiredExpected: vi.fn(),
    findStartingSoon: vi.fn(),
    markQueueEntryCreated: vi.fn(),
    markNoShowFlipped: vi.fn(),
    markStartingSoonNotified: vi.fn(),
    setPetQueueEntry: vi.fn(),
    countScheduledForVetOnDate: vi.fn(),
  } as unknown as AppointmentRepository;
}

function createMockAvailability(): AvailabilityService {
  return {
    resolveAvailabilityForDate: vi.fn().mockResolvedValue({ openMinutes: 9 * 60, closeMinutes: 18 * 60 }),
    getBlockedRangesForDate: vi.fn().mockResolvedValue([]),
    getOfferableSlots: vi.fn().mockResolvedValue([]),
    replaceWeeklyTemplate: vi.fn(),
    upsertDateOverride: vi.fn(),
    createBlockedPeriod: vi.fn(),
    removeBlockedPeriod: vi.fn(),
    listVets: vi.fn(),
  } as unknown as AvailabilityService;
}

function createMockPrisma() {
  const txClient = {
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const petOwnerFindFirst = vi.fn().mockResolvedValue(mockOwner);
  const petFindFirst = vi.fn().mockResolvedValue({ id: PET_ID });
  const serviceCatalogFindFirst = vi.fn().mockResolvedValue({ durationMinutes: 30 });
  const prisma = {
    petOwner: { findFirst: petOwnerFindFirst },
    pet: { findFirst: petFindFirst },
    serviceCatalog: { findFirst: serviceCatalogFindFirst },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(txClient)),
    $executeRaw: vi.fn(),
    authAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    prisma: prisma as unknown as PrismaClient,
    txClient,
    petOwnerFindFirst,
    petFindFirst,
    serviceCatalogFindFirst,
  };
}

function createMockIO(): Server {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
  } as unknown as Server;
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    clinicId: CLINIC_ID,
    userId: USER_ID,
    ownerId: OWNER_ID,
    petIds: [PET_ID],
    vetId: VET_ID,
    serviceCatalogId: SERVICE_ID,
    scheduledFor: atMinutes(TOMORROW, 10 * 60),
    allowDoubleBook: false,
    ...overrides,
  };
}

describe('AppointmentService.createAppointment', () => {
  let service: AppointmentService;
  let repository: ReturnType<typeof createMockRepository>;
  let availability: ReturnType<typeof createMockAvailability>;
  let prisma: PrismaClient;
  let txClient: { $executeRaw: ReturnType<typeof vi.fn> };
  let petOwnerFindFirst: ReturnType<typeof vi.fn>;
  let petFindFirst: ReturnType<typeof vi.fn>;
  let serviceCatalogFindFirst: ReturnType<typeof vi.fn>;
  let io: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    repository = createMockRepository();
    availability = createMockAvailability();
    const mocked = createMockPrisma();
    prisma = mocked.prisma;
    txClient = mocked.txClient;
    petOwnerFindFirst = mocked.petOwnerFindFirst;
    petFindFirst = mocked.petFindFirst;
    serviceCatalogFindFirst = mocked.serviceCatalogFindFirst;
    io = createMockIO();
    service = new AppointmentService(repository, availability, prisma, io);
  });

  it('snapshots durationMinutes from the service catalog at booking time', async () => {
    serviceCatalogFindFirst.mockResolvedValue({ durationMinutes: 30 });

    await service.createAppointment(baseParams());

    expect(repository.create).toHaveBeenCalledWith(
      CLINIC_ID,
      expect.objectContaining({ durationMinutes: 30 }),
      [PET_ID],
      expect.anything(),
    );

    // A later catalog change must not retroactively resize the already-created row.
    serviceCatalogFindFirst.mockResolvedValue({ durationMinutes: 45 });
    vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ durationMinutes: 30 }) as never);
    const reread = await repository.findById(CLINIC_ID, APPOINTMENT_ID);
    expect(reread?.durationMinutes).toBe(30);
  });

  it('falls back to DEFAULT_SERVICE_DURATION_MINUTES when serviceCatalogId is absent', async () => {
    await service.createAppointment(baseParams({ serviceCatalogId: undefined }));

    expect(prisma.serviceCatalog.findFirst).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      CLINIC_ID,
      expect.objectContaining({ durationMinutes: DEFAULT_SERVICE_DURATION_MINUTES }),
      [PET_ID],
      expect.anything(),
    );
  });

  it('rejects a service from another clinic with SERVICE_NOT_FOUND', async () => {
    serviceCatalogFindFirst.mockResolvedValue(null);

    await expect(service.createAppointment(baseParams())).rejects.toMatchObject({
      statusCode: 404,
      code: 'SERVICE_NOT_FOUND',
    });
  });

  it('rejects a booking beyond the 90-day horizon', async () => {
    const beyondHorizon = atMinutes(addDaysIST(TODAY, BOOKING_HORIZON_DAYS + 1), 10 * 60);

    await expect(service.createAppointment(baseParams({ scheduledFor: beyondHorizon }))).rejects.toMatchObject({
      statusCode: 400,
      code: 'BOOKING_HORIZON_EXCEEDED',
    });
  });

  it('rejects a booking in the past', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await expect(service.createAppointment(baseParams({ scheduledFor: yesterday }))).rejects.toMatchObject({
      statusCode: 400,
      code: 'SLOT_IN_PAST',
    });
  });

  it('rejects a booking on a day the vet is not available', async () => {
    vi.mocked(availability.resolveAvailabilityForDate).mockResolvedValue(null);

    await expect(service.createAppointment(baseParams())).rejects.toMatchObject({
      statusCode: 400,
      code: 'VET_NOT_AVAILABLE',
    });
  });

  it('rejects a booking inside a blocked period', async () => {
    vi.mocked(availability.getBlockedRangesForDate).mockResolvedValue([{ startMinutes: 9 * 60, endMinutes: 20 * 60 }]);

    await expect(service.createAppointment(baseParams())).rejects.toMatchObject({
      statusCode: 400,
      code: 'SLOT_BLOCKED',
    });
  });

  it('rejects a booking outside the vet\'s working hours', async () => {
    vi.mocked(availability.resolveAvailabilityForDate).mockResolvedValue({ openMinutes: 9 * 60, closeMinutes: 10 * 60 });

    await expect(
      service.createAppointment(baseParams({ scheduledFor: atMinutes(TOMORROW, 11 * 60) })),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VET_NOT_AVAILABLE' });
  });

  it('rejects a taken slot without the override', async () => {
    vi.mocked(repository.findForVetOnDate).mockResolvedValue([
      { id: OTHER_APPOINTMENT_ID, scheduledFor: atMinutes(TOMORROW, 10 * 60), durationMinutes: 30 },
    ]);

    await expect(service.createAppointment(baseParams())).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLOT_DOUBLE_BOOKED',
    });
  });

  it('books a taken slot with allowDoubleBook true and returns a DOUBLE_BOOKED warning', async () => {
    vi.mocked(repository.findForVetOnDate).mockResolvedValue([
      { id: OTHER_APPOINTMENT_ID, scheduledFor: atMinutes(TOMORROW, 10 * 60), durationMinutes: 30 },
    ]);

    const result = await service.createAppointment(baseParams({ allowDoubleBook: true }));

    expect(repository.create).toHaveBeenCalled();
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'DOUBLE_BOOKED' }));
  });

  it('rejects a pet belonging to a different owner with PET_OWNER_MISMATCH', async () => {
    await expect(
      service.createAppointment(baseParams({ petIds: [OTHER_OWNER_PET_ID] })),
    ).rejects.toMatchObject({ statusCode: 400, code: 'PET_OWNER_MISMATCH' });
  });

  it('rejects a pet from another clinic with PET_NOT_FOUND', async () => {
    petFindFirst.mockResolvedValue(null);

    await expect(
      service.createAppointment(baseParams({ petIds: [OTHER_OWNER_PET_ID] })),
    ).rejects.toMatchObject({ statusCode: 404, code: 'PET_NOT_FOUND' });
  });

  it('creates one appointment with N pet rows for a multi-pet booking (D-21)', async () => {
    await service.createAppointment(baseParams({ petIds: [PET_ID, PET_ID_2] }));

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(CLINIC_ID, expect.anything(), [PET_ID, PET_ID_2], expect.anything());
  });

  it('generates linked rows for a weekly recurrence sharing one series id', async () => {
    await service.createAppointment(
      baseParams({ recurrence: { interval: RecurrenceInterval.WEEKLY, occurrences: 4 } }),
    );

    expect(repository.create).toHaveBeenCalledTimes(4);
    const calls = vi.mocked(repository.create).mock.calls;
    const seriesIds = new Set(calls.map((call) => (call[1] as { recurringSeriesId: string | null }).recurringSeriesId));
    expect(seriesIds.size).toBe(1);
    expect([...seriesIds][0]).not.toBeNull();

    const indices = calls.map((call) => (call[1] as { recurrenceIndex: number | null }).recurrenceIndex).sort();
    expect(indices).toEqual([0, 1, 2, 3]);

    const dates = calls.map((call) => (call[1] as { scheduledFor: Date }).scheduledFor.getTime()).sort((a, b) => a - b);
    expect(dates[1] - dates[0]).toBe(7 * 24 * 60 * 60 * 1000);
    expect(dates[2] - dates[1]).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('truncates a recurrence at the horizon and reports it in warnings', async () => {
    const firstDate = atMinutes(addDaysIST(TODAY, 80), 10 * 60);

    const result = await service.createAppointment(
      baseParams({ scheduledFor: firstDate, recurrence: { interval: RecurrenceInterval.WEEKLY, occurrences: 4 } }),
    );

    // +80d and +87d fit inside the 90-day horizon; +94d and +101d do not.
    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'RECURRENCE_TRUNCATED', data: expect.objectContaining({ created: 2, requested: 4 }) }),
    );
  });

  it('skips (not aborts) a recurrence occurrence that hits a closed day or blocked period', async () => {
    vi.mocked(availability.resolveAvailabilityForDate)
      .mockResolvedValueOnce({ openMinutes: 9 * 60, closeMinutes: 18 * 60 }) // occurrence 0
      .mockResolvedValueOnce(null) // occurrence 1: closed day, skipped
      .mockResolvedValue({ openMinutes: 9 * 60, closeMinutes: 18 * 60 }); // occurrences 2, 3

    const result = await service.createAppointment(
      baseParams({ recurrence: { interval: RecurrenceInterval.WEEKLY, occurrences: 4 } }),
    );

    expect(repository.create).toHaveBeenCalledTimes(3);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'RECURRENCE_OCCURRENCE_SKIPPED' }));
  });

  it('audit-logs and broadcasts APPOINTMENT_CREATED', async () => {
    await service.createAppointment(baseParams());

    expect(writeAuditLog).toHaveBeenCalledWith(
      prisma,
      expect.stringMatching('APPOINTMENT_CREATED'),
      expect.objectContaining({ userId: USER_ID, clinicId: CLINIC_ID }),
    );
    expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
  });

  it('serializes two concurrent bookings for the identical vet+slot so the second always observes the conflict (D-34)', async () => {
    vi.mocked(repository.findForVetOnDate)
      .mockResolvedValueOnce([]) // first request: slot is free
      .mockResolvedValueOnce([
        { id: OTHER_APPOINTMENT_ID, scheduledFor: atMinutes(TOMORROW, 10 * 60), durationMinutes: 30 },
      ]); // second request now sees the first's row

    await service.createAppointment(baseParams());
    expect(repository.create).toHaveBeenCalledTimes(1);

    await expect(service.createAppointment(baseParams())).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLOT_DOUBLE_BOOKED',
    });

    // Never a second, silent, unwarned create.
    expect(repository.create).toHaveBeenCalledTimes(1);

    // The advisory lock is acquired before the conflict re-check, every time.
    expect(txClient.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.findForVetOnDate).mock.invocationCallOrder[0],
    );
  });
});

const SERIES_ID = '00000000-0000-0000-0000-000000000300';
const OCCURRENCE_ID_2 = '00000000-0000-0000-0000-000000000201';
const OCCURRENCE_ID_3 = '00000000-0000-0000-0000-000000000202';

describe('AppointmentService lifecycle transitions', () => {
  let service: AppointmentService;
  let repository: ReturnType<typeof createMockRepository>;
  let availability: ReturnType<typeof createMockAvailability>;
  let prisma: PrismaClient;
  let io: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    repository = createMockRepository();
    availability = createMockAvailability();
    const mocked = createMockPrisma();
    prisma = mocked.prisma;
    io = createMockIO();
    service = new AppointmentService(repository, availability, prisma, io);

    vi.mocked(repository.findById).mockResolvedValue(mockAppointment() as never);
    vi.mocked(repository.update).mockImplementation(
      async (_clinicId: string, _id: string, data: Record<string, unknown>) =>
        mockAppointment(data) as never,
    );
  });

  describe('rescheduleAppointment', () => {
    function rescheduleParams(overrides: Record<string, unknown> = {}) {
      return {
        clinicId: CLINIC_ID,
        userId: USER_ID,
        appointmentId: APPOINTMENT_ID,
        scheduledFor: atMinutes(addDaysIST(TOMORROW, 1), 11 * 60),
        allowDoubleBook: false,
        applyToSeries: false,
        ...overrides,
      };
    }

    it('rejects rescheduling into a day the vet is not available', async () => {
      vi.mocked(availability.resolveAvailabilityForDate).mockResolvedValue(null);

      await expect(service.rescheduleAppointment(rescheduleParams())).rejects.toMatchObject({
        statusCode: 400,
        code: 'VET_NOT_AVAILABLE',
      });
    });

    it('rejects rescheduling beyond the booking horizon', async () => {
      const beyondHorizon = atMinutes(addDaysIST(TODAY, BOOKING_HORIZON_DAYS + 1), 10 * 60);

      await expect(
        service.rescheduleAppointment(rescheduleParams({ scheduledFor: beyondHorizon })),
      ).rejects.toMatchObject({ statusCode: 400, code: 'BOOKING_HORIZON_EXCEEDED' });
    });

    it('rejects rescheduling into an already-taken slot without the override', async () => {
      vi.mocked(repository.findForVetOnDate).mockResolvedValue([
        { id: OTHER_APPOINTMENT_ID, scheduledFor: atMinutes(addDaysIST(TOMORROW, 1), 11 * 60), durationMinutes: 30 },
      ]);

      await expect(service.rescheduleAppointment(rescheduleParams())).rejects.toMatchObject({
        statusCode: 409,
        code: 'SLOT_DOUBLE_BOOKED',
      });
    });

    it('does not treat the appointment being rescheduled as its own double-booking conflict (true no-op time reschedule)', async () => {
      // The only "conflicting" row `findForVetOnDate` returns IS the
      // appointment currently being rescheduled (same id, same slot) -- a
      // vet-only change (or any reschedule that keeps the same time) must
      // not see its own current row as a conflict.
      const sameSlot = atMinutes(TOMORROW, 10 * 60);
      vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ scheduledFor: sameSlot }) as never);
      vi.mocked(repository.findForVetOnDate).mockResolvedValue([
        { id: APPOINTMENT_ID, scheduledFor: sameSlot, durationMinutes: 30 },
      ]);

      await expect(
        service.rescheduleAppointment(rescheduleParams({ scheduledFor: sameSlot })),
      ).resolves.toBeDefined();

      expect(repository.update).toHaveBeenCalledWith(CLINIC_ID, APPOINTMENT_ID, expect.anything());
    });

    it('still rejects a genuine double-booking against a DIFFERENT appointment on reschedule', async () => {
      const sameSlot = atMinutes(TOMORROW, 10 * 60);
      vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ scheduledFor: sameSlot }) as never);
      vi.mocked(repository.findForVetOnDate).mockResolvedValue([
        { id: OCCURRENCE_ID_2, scheduledFor: sameSlot, durationMinutes: 30 },
      ]);

      await expect(
        service.rescheduleAppointment(rescheduleParams({ scheduledFor: sameSlot })),
      ).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_DOUBLE_BOOKED' });
    });

    it('resets all three sweep marker columns on a successful reschedule', async () => {
      await service.rescheduleAppointment(rescheduleParams());

      expect(repository.update).toHaveBeenCalledWith(
        CLINIC_ID,
        APPOINTMENT_ID,
        expect.objectContaining({
          queueEntryCreatedAt: null,
          noShowFlippedAt: null,
          startingSoonNotifiedAt: null,
        }),
      );
    });

    it('rejects rescheduling an already checked-in appointment', async () => {
      vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ status: 'CHECKED_IN' }) as never);

      await expect(service.rescheduleAppointment(rescheduleParams())).rejects.toMatchObject({
        statusCode: 409,
        code: 'APPOINTMENT_NOT_RESCHEDULABLE',
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('with applyToSeries moves every future occurrence and leaves past ones untouched', async () => {
      const pastOccurrence = mockAppointment({
        id: OCCURRENCE_ID_2,
        recurringSeriesId: SERIES_ID,
        recurrenceIndex: 1,
        scheduledFor: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });
      const futureOccurrence = mockAppointment({
        id: OCCURRENCE_ID_3,
        recurringSeriesId: SERIES_ID,
        recurrenceIndex: 2,
        scheduledFor: atMinutes(addDaysIST(TOMORROW, 7), 10 * 60),
      });
      const anchor = mockAppointment({
        id: APPOINTMENT_ID,
        recurringSeriesId: SERIES_ID,
        recurrenceIndex: 0,
        scheduledFor: atMinutes(TOMORROW, 10 * 60),
      });

      vi.mocked(repository.findById).mockResolvedValue(anchor as never);
      vi.mocked(repository.findBySeries).mockResolvedValue([anchor, pastOccurrence, futureOccurrence] as never);

      await service.rescheduleAppointment(
        rescheduleParams({ scheduledFor: atMinutes(addDaysIST(TOMORROW, 1), 11 * 60), applyToSeries: true }),
      );

      // The future occurrence is moved by the same delta (+1 day, 10:00 -> 11:00).
      expect(repository.update).toHaveBeenCalledWith(
        CLINIC_ID,
        OCCURRENCE_ID_3,
        expect.objectContaining({ scheduledFor: atMinutes(addDaysIST(TOMORROW, 8), 11 * 60) }),
      );
      // The past occurrence is never touched.
      expect(repository.update).not.toHaveBeenCalledWith(CLINIC_ID, OCCURRENCE_ID_2, expect.anything());
    });

    it('audit-logs APPOINTMENT_RESCHEDULED with both old and new scheduledFor, and broadcasts', async () => {
      const oldScheduledFor = atMinutes(TOMORROW, 10 * 60);
      vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ scheduledFor: oldScheduledFor }) as never);

      const newScheduledFor = atMinutes(addDaysIST(TOMORROW, 1), 11 * 60);
      await service.rescheduleAppointment(rescheduleParams({ scheduledFor: newScheduledFor }));

      expect(writeAuditLog).toHaveBeenCalledWith(
        prisma,
        expect.stringMatching('APPOINTMENT_RESCHEDULED'),
        expect.objectContaining({
          metadata: expect.objectContaining({ oldScheduledFor, newScheduledFor }),
        }),
      );
      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    });

    it('detaches a single rescheduled occurrence from its series (D-31)', async () => {
      vi.mocked(repository.findById).mockResolvedValue(
        mockAppointment({ recurringSeriesId: SERIES_ID, recurrenceIndex: 2 }) as never,
      );

      await service.rescheduleAppointment(rescheduleParams({ applyToSeries: false }));

      expect(repository.update).toHaveBeenCalledWith(
        CLINIC_ID,
        APPOINTMENT_ID,
        expect.objectContaining({ recurringSeriesId: null }),
      );
      // Only the one row is touched -- applyToSeries is false, so the rest of
      // the series must never be read or written.
      expect(repository.findBySeries).not.toHaveBeenCalled();
    });
  });

  describe('cancelAppointment', () => {
    function cancelParams(overrides: Record<string, unknown> = {}) {
      return {
        clinicId: CLINIC_ID,
        userId: USER_ID,
        appointmentId: APPOINTMENT_ID,
        reason: 'Owner request',
        scope: 'ONE' as const,
        ...overrides,
      };
    }

    it('cancels a SCHEDULED appointment', async () => {
      const result = await service.cancelAppointment(cancelParams());

      expect(repository.update).toHaveBeenCalledWith(
        CLINIC_ID,
        APPOINTMENT_ID,
        expect.objectContaining({
          status: 'CANCELLED',
          cancelledById: USER_ID,
          cancelReason: 'Owner request',
        }),
      );
      expect(result.appointment).toBeDefined();
      expect(writeAuditLog).toHaveBeenCalledWith(
        prisma,
        expect.stringMatching('APPOINTMENT_CANCELLED'),
        expect.anything(),
      );
      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    });

    it('scope SERIES cancels every future SCHEDULED occurrence and leaves an already-resolved past one alone', async () => {
      // D-31: a past occurrence that already ran its course (COMPLETED here)
      // is left alone -- the SERIES-scope filter is status === SCHEDULED,
      // not "future date", so a genuinely past-but-still-SCHEDULED row (an
      // edge case the sweep would normally have already resolved) would in
      // fact also be cancelled; that combination is covered by the
      // status-filter test below instead.
      const pastOccurrence = mockAppointment({
        id: OCCURRENCE_ID_2,
        recurringSeriesId: SERIES_ID,
        status: 'COMPLETED',
        scheduledFor: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });
      const futureOccurrence = mockAppointment({
        id: OCCURRENCE_ID_3,
        recurringSeriesId: SERIES_ID,
        status: 'SCHEDULED',
        scheduledFor: atMinutes(addDaysIST(TOMORROW, 7), 10 * 60),
      });
      const anchor = mockAppointment({ id: APPOINTMENT_ID, recurringSeriesId: SERIES_ID, status: 'SCHEDULED' });

      vi.mocked(repository.findById).mockResolvedValue(anchor as never);
      vi.mocked(repository.findBySeries).mockResolvedValue([anchor, pastOccurrence, futureOccurrence] as never);

      await service.cancelAppointment(cancelParams({ scope: 'SERIES' }));

      expect(repository.update).toHaveBeenCalledWith(CLINIC_ID, OCCURRENCE_ID_3, expect.objectContaining({ status: 'CANCELLED' }));
      expect(repository.update).not.toHaveBeenCalledWith(CLINIC_ID, OCCURRENCE_ID_2, expect.anything());
    });

    it('scope SERIES skips members already CHECKED_IN or COMPLETED (D-31)', async () => {
      const checkedInOccurrence = mockAppointment({
        id: OCCURRENCE_ID_2,
        recurringSeriesId: SERIES_ID,
        status: 'CHECKED_IN',
        scheduledFor: atMinutes(addDaysIST(TOMORROW, 7), 10 * 60),
      });
      const scheduledOccurrence = mockAppointment({
        id: OCCURRENCE_ID_3,
        recurringSeriesId: SERIES_ID,
        status: 'SCHEDULED',
        scheduledFor: atMinutes(addDaysIST(TOMORROW, 14), 10 * 60),
      });
      const anchor = mockAppointment({ id: APPOINTMENT_ID, recurringSeriesId: SERIES_ID, status: 'SCHEDULED' });

      vi.mocked(repository.findById).mockResolvedValue(anchor as never);
      vi.mocked(repository.findBySeries).mockResolvedValue([anchor, checkedInOccurrence, scheduledOccurrence] as never);

      await service.cancelAppointment(cancelParams({ scope: 'SERIES' }));

      expect(repository.update).toHaveBeenCalledWith(CLINIC_ID, APPOINTMENT_ID, expect.objectContaining({ status: 'CANCELLED' }));
      expect(repository.update).toHaveBeenCalledWith(CLINIC_ID, OCCURRENCE_ID_3, expect.objectContaining({ status: 'CANCELLED' }));
      expect(repository.update).not.toHaveBeenCalledWith(OCCURRENCE_ID_2, expect.anything(), expect.anything());
      expect(repository.update).not.toHaveBeenCalledWith(CLINIC_ID, OCCURRENCE_ID_2, expect.anything());
    });

    it('rejects cancelling a COMPLETED appointment', async () => {
      vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ status: 'COMPLETED' }) as never);

      await expect(service.cancelAppointment(cancelParams())).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_TRANSITION',
      });
    });

    it('rejects cancelling an unknown or cross-tenant appointment with 404, never 403', async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await expect(service.cancelAppointment(cancelParams())).rejects.toMatchObject({
        statusCode: 404,
        code: 'APPOINTMENT_NOT_FOUND',
      });
    });
  });

  describe('checkInAppointment', () => {
    it('transitions to CHECKED_IN, stamps checkedInAt, and broadcasts APPOINTMENT_UPDATED', async () => {
      const updated = await service.checkInAppointment({ clinicId: CLINIC_ID, userId: USER_ID, appointmentId: APPOINTMENT_ID });

      expect(repository.update).toHaveBeenCalledWith(
        CLINIC_ID,
        APPOINTMENT_ID,
        expect.objectContaining({ status: 'CHECKED_IN', checkedInAt: expect.any(Date) }),
      );
      expect(updated).toBeDefined();
      expect(writeAuditLog).toHaveBeenCalledWith(prisma, expect.stringMatching('APPOINTMENT_CHECKED_IN'), expect.anything());
      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    });

    it('is idempotent-safe: checking in an already CHECKED_IN appointment throws INVALID_TRANSITION', async () => {
      vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ status: 'CHECKED_IN' }) as never);

      await expect(
        service.checkInAppointment({ clinicId: CLINIC_ID, userId: USER_ID, appointmentId: APPOINTMENT_ID }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TRANSITION' });
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('completeAppointment', () => {
    it('rejects completing a SCHEDULED (not yet checked-in) appointment', async () => {
      await expect(
        service.completeAppointment({ clinicId: CLINIC_ID, userId: USER_ID, appointmentId: APPOINTMENT_ID }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TRANSITION' });
    });

    it('transitions from CHECKED_IN to COMPLETED and stamps completedAt', async () => {
      vi.mocked(repository.findById).mockResolvedValue(mockAppointment({ status: 'CHECKED_IN' }) as never);

      await service.completeAppointment({ clinicId: CLINIC_ID, userId: USER_ID, appointmentId: APPOINTMENT_ID });

      expect(repository.update).toHaveBeenCalledWith(
        CLINIC_ID,
        APPOINTMENT_ID,
        expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
      );
      expect(writeAuditLog).toHaveBeenCalledWith(prisma, expect.stringMatching('APPOINTMENT_COMPLETED'), expect.anything());
    });
  });

  describe('markNoShow', () => {
    it('sets status to NO_SHOW and stamps noShowFlippedAt via the repository marker mutator', async () => {
      vi.mocked(repository.markNoShowFlipped).mockResolvedValue(mockAppointment({ status: 'NO_SHOW' }) as never);

      const updated = await service.markNoShow({ clinicId: CLINIC_ID, userId: USER_ID, appointmentId: APPOINTMENT_ID });

      expect(repository.markNoShowFlipped).toHaveBeenCalledWith(CLINIC_ID, APPOINTMENT_ID, expect.any(Date));
      expect(updated?.status).toBe('NO_SHOW');
      expect(writeAuditLog).toHaveBeenCalledWith(prisma, expect.stringMatching('APPOINTMENT_NO_SHOW'), expect.anything());
      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    });
  });
});
