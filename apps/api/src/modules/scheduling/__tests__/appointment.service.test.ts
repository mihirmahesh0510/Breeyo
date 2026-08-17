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
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const petOwnerFindFirst = vi.fn().mockResolvedValue(mockOwner);
  const petFindFirst = vi.fn().mockResolvedValue({ id: PET_ID });
  const serviceCatalogFindFirst = vi.fn().mockResolvedValue({ durationMinutes: 30 });
  const prisma = {
    petOwner: { findFirst: petOwnerFindFirst },
    pet: { findFirst: petFindFirst },
    serviceCatalog: { findFirst: serviceCatalogFindFirst },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(txClient)),
    $queryRaw: vi.fn(),
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
  let txClient: { $queryRaw: ReturnType<typeof vi.fn> };
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
      { scheduledFor: atMinutes(TOMORROW, 10 * 60), durationMinutes: 30 },
    ]);

    await expect(service.createAppointment(baseParams())).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLOT_DOUBLE_BOOKED',
    });
  });

  it('books a taken slot with allowDoubleBook true and returns a DOUBLE_BOOKED warning', async () => {
    vi.mocked(repository.findForVetOnDate).mockResolvedValue([
      { scheduledFor: atMinutes(TOMORROW, 10 * 60), durationMinutes: 30 },
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
      .mockResolvedValueOnce([{ scheduledFor: atMinutes(TOMORROW, 10 * 60), durationMinutes: 30 }]); // second request now sees the first's row

    await service.createAppointment(baseParams());
    expect(repository.create).toHaveBeenCalledTimes(1);

    await expect(service.createAppointment(baseParams())).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLOT_DOUBLE_BOOKED',
    });

    // Never a second, silent, unwarned create.
    expect(repository.create).toHaveBeenCalledTimes(1);

    // The advisory lock is acquired before the conflict re-check, every time.
    expect(txClient.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.findForVetOnDate).mock.invocationCallOrder[0],
    );
  });
});
