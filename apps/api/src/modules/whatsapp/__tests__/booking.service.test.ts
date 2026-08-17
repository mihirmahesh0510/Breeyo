import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertBookingTransition } from '../booking/booking.state.js';
import { BookingRepository } from '../booking/booking.repository.js';
import { BookingService, generateReference } from '../booking/booking.service.js';
import type { AuditEvent as AuditEventType } from '../../../lib/audit-log.js';

/**
 * WHA-03 / D-06, D-07, D-08, D-09 — BookingService unit tests against a
 * mocked repository/prisma/whatsAppService. The REAL-concurrency proof (two
 * genuine confirmSlot calls racing on the actual Postgres unique index)
 * lives in `apps/api/tests/whatsapp/booking-concurrency.test.ts` (Task 3) —
 * these tests only prove the P2002-as-business-outcome CODE PATH, per
 * 07-RESEARCH § Code Example 5.
 */

vi.mock('../../../lib/audit-log.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/audit-log.js')>(
    '../../../lib/audit-log.js',
  );
  return {
    ...actual,
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

const { writeAuditLog, AuditEvent } = (await import('../../../lib/audit-log.js')) as unknown as {
  writeAuditLog: ReturnType<typeof vi.fn>;
  AuditEvent: typeof AuditEventType;
};

const CLINIC_ID = 'clinic-1';
const THREAD_ID = 'thread-1';
const OWNER_ID = 'owner-1';
const PET_ID = 'pet-1';
const BOOKING_ID = 'booking-1';

function p2002Error() {
  const err = new Error('Unique constraint failed') as Error & { code: string };
  err.code = 'P2002';
  return err;
}

function createMockRepository() {
  return {
    createBookingRequest: vi.fn(),
    findBookingRequestById: vi.fn(),
    createSlotHold: vi.fn(),
    deleteSlotHoldByBookingId: vi.fn(),
    confirmBooking: vi.fn(),
    cancelBooking: vi.fn(),
    markMoved: vi.fn(),
    expireStale: vi.fn(),
    getBookedSlotMinutes: vi.fn(),
  };
}

function createMockPrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    whatsAppThread: { findFirst: vi.fn().mockResolvedValue({ id: THREAD_ID, waPhone: '+919876543210' }) },
    petOwner: { findFirst: vi.fn().mockResolvedValue({ id: OWNER_ID, name: 'Asha Rao' }) },
    pet: { findFirst: vi.fn().mockResolvedValue({ id: PET_ID, name: 'Bruno' }) },
    queueEntry: { create: vi.fn() },
  };
}

function createMockWhatsAppService() {
  return { sendTemplate: vi.fn().mockResolvedValue({ messageId: 'wa-msg-1' }) };
}

function awaitingBooking(overrides: Partial<{ state: string; clinicId: string }> = {}) {
  return {
    id: BOOKING_ID,
    clinicId: overrides.clinicId ?? CLINIC_ID,
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    petId: PET_ID,
    reference: 'BK-202608-AB12',
    state: overrides.state ?? 'AWAITING_SLOT_CHOICE',
  };
}

const SLOT = { date: new Date('2026-08-14T00:00:00.000Z'), startMinutes: 630, durationMinutes: 30 };

describe('BookingService.startBooking (D-06)', () => {
  it('creates a WhatsAppBookingRequest in AWAITING_SLOT_CHOICE with a BK-YYYYMM-XXXX reference', async () => {
    const repository = createMockRepository();
    const prisma = createMockPrisma();
    const whatsAppService = createMockWhatsAppService();
    repository.createBookingRequest.mockResolvedValue(awaitingBooking());

    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
    });

    const booking = await service.startBooking(CLINIC_ID, {
      threadId: THREAD_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
    });

    expect(booking.state).toBe('AWAITING_SLOT_CHOICE');
    expect(repository.createBookingRequest).toHaveBeenCalledTimes(1);
    const [clinicIdArg, input] = repository.createBookingRequest.mock.calls[0];
    expect(clinicIdArg).toBe(CLINIC_ID);
    expect(input.reference).toMatch(/^BK-\d{6}-[A-Z0-9]{4}$/);
  });
});

describe('BookingService.confirmSlot (D-06, D-07)', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let whatsAppService: ReturnType<typeof createMockWhatsAppService>;
  let service: BookingService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockRepository();
    prisma = createMockPrisma();
    whatsAppService = createMockWhatsAppService();
    repository.findBookingRequestById.mockResolvedValue(awaitingBooking());
    service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
    });
  });

  it('inserts a WhatsAppSlotHold and transitions the booking to CONFIRMED with confirmedAt set, inside one transaction', async () => {
    repository.confirmBooking.mockResolvedValue({
      ...awaitingBooking({ state: 'CONFIRMED' }),
      confirmedAt: new Date(),
      slotDate: SLOT.date,
      slotStartMinutes: SLOT.startMinutes,
      slotDurationMinutes: SLOT.durationMinutes,
    });

    const result = await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(result.outcome).toBe('CONFIRMED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(repository.createSlotHold).toHaveBeenCalledWith(
      CLINIC_ID,
      BOOKING_ID,
      { date: SLOT.date, startMinutes: SLOT.startMinutes },
      expect.anything(),
    );
    expect(repository.confirmBooking).toHaveBeenCalledWith(
      CLINIC_ID,
      BOOKING_ID,
      SLOT,
      expect.anything(),
    );
    if (result.outcome === 'CONFIRMED') {
      expect(result.booking.confirmedAt).toBeInstanceOf(Date);
    }
  });

  it('never requires a staff approval step — outcome is CONFIRMED directly from the inbound path', async () => {
    repository.confirmBooking.mockResolvedValue({
      ...awaitingBooking({ state: 'CONFIRMED' }),
      confirmedAt: new Date(),
      slotDate: SLOT.date,
      slotStartMinutes: SLOT.startMinutes,
      slotDurationMinutes: SLOT.durationMinutes,
    });

    const result = await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(result).toMatchObject({ outcome: 'CONFIRMED' });
  });

  it('catches Prisma P2002 on the slot hold and returns SLOT_TAKEN, and the booking stays AWAITING_SLOT_CHOICE', async () => {
    repository.createSlotHold.mockRejectedValue(p2002Error());

    const result = await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(result).toEqual({ outcome: 'SLOT_TAKEN' });
  });

  it('on P2002 leaves no partial state: confirmBooking (the state transition) is never called', async () => {
    repository.createSlotHold.mockRejectedValue(p2002Error());

    await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(repository.confirmBooking).not.toHaveBeenCalled();
  });

  it('queues a booking_confirmation template send after a successful confirmation', async () => {
    repository.confirmBooking.mockResolvedValue({
      ...awaitingBooking({ state: 'CONFIRMED' }),
      confirmedAt: new Date(),
      slotDate: SLOT.date,
      slotStartMinutes: SLOT.startMinutes,
      slotDurationMinutes: SLOT.durationMinutes,
    });

    await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(whatsAppService.sendTemplate).toHaveBeenCalledTimes(1);
    const [input, actor] = whatsAppService.sendTemplate.mock.calls[0];
    expect(input.templateKey).toBe('booking_confirmation');
    expect(input.variables.booking_reference).toBe('BK-202608-AB12');
    expect(input.contextType).toBe('BOOKING');
    expect(actor.clinicId).toBe(CLINIC_ID);
  });

  it('never creates a QueueEntry on confirmation', async () => {
    repository.confirmBooking.mockResolvedValue({
      ...awaitingBooking({ state: 'CONFIRMED' }),
      confirmedAt: new Date(),
      slotDate: SLOT.date,
      slotStartMinutes: SLOT.startMinutes,
      slotDurationMinutes: SLOT.durationMinutes,
    });

    await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(prisma.queueEntry.create).not.toHaveBeenCalled();
  });

  it('throws 404 (not 403) for a booking belonging to another clinic', async () => {
    repository.findBookingRequestById.mockResolvedValue(null);

    await expect(service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('BookingService.confirmSlot — D-12 real-appointment redirect (plan 08-10)', () => {
  const VET_ID = 'vet-1';

  function createMockAppointmentService() {
    return {
      createAppointment: vi.fn(),
      cancelAppointment: vi.fn().mockResolvedValue({ appointment: {} }),
    };
  }

  function createMockAvailability() {
    return { listVets: vi.fn().mockResolvedValue([{ id: VET_ID, name: 'Dr. Vet' }]) };
  }

  it('a confirmed WhatsApp booking calls appointmentService.createAppointment with source WHATSAPP and the booking id, before any Phase 7 state change', async () => {
    const repository = createMockRepository();
    const prisma = createMockPrisma();
    const whatsAppService = createMockWhatsAppService();
    repository.findBookingRequestById.mockResolvedValue(awaitingBooking());
    repository.confirmBooking.mockResolvedValue({
      ...awaitingBooking({ state: 'CONFIRMED' }),
      confirmedAt: new Date(),
      slotDate: SLOT.date,
      slotStartMinutes: SLOT.startMinutes,
      slotDurationMinutes: SLOT.durationMinutes,
    });
    const appointmentService = createMockAppointmentService();
    appointmentService.createAppointment.mockResolvedValue({
      appointments: [{ id: 'real-appointment-1' }],
      warnings: [],
    });
    const availability = createMockAvailability();
    (prisma as any).whatsAppBookingRequest = { update: vi.fn().mockResolvedValue({}) };

    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
      appointmentService: appointmentService as any,
      availability: availability as any,
    });

    const result = await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(result.outcome).toBe('CONFIRMED');
    expect(appointmentService.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        source: 'WHATSAPP',
        whatsappBookingRequestId: BOOKING_ID,
        vetId: VET_ID,
      }),
    );
    // Created before any hold/confirm — the appointment call must precede
    // the transaction that mutates Phase 7's own state.
    const appointmentCallOrder = appointmentService.createAppointment.mock.invocationCallOrder[0];
    const transactionCallOrder = prisma.$transaction.mock.invocationCallOrder[0];
    expect(appointmentCallOrder).toBeLessThan(transactionCallOrder);
    expect((prisma as any).whatsAppBookingRequest.update).toHaveBeenCalledWith({
      where: { id: BOOKING_ID },
      data: { supersededByAppointmentId: 'real-appointment-1' },
    });
  });

  it('a WhatsApp booking into an unavailable slot is refused (UNAVAILABLE) and never reaches confirmBooking', async () => {
    const repository = createMockRepository();
    const prisma = createMockPrisma();
    const whatsAppService = createMockWhatsAppService();
    repository.findBookingRequestById.mockResolvedValue(awaitingBooking());
    const appointmentService = createMockAppointmentService();
    const vetNotAvailable = Object.assign(new Error('This vet is not working then.'), {
      statusCode: 400,
      code: 'VET_NOT_AVAILABLE',
    });
    appointmentService.createAppointment.mockRejectedValue(vetNotAvailable);
    const availability = createMockAvailability();

    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
      appointmentService: appointmentService as any,
      availability: availability as any,
    });

    const result = await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(result).toEqual({ outcome: 'UNAVAILABLE', reason: 'VET_NOT_AVAILABLE' });
    expect(repository.confirmBooking).not.toHaveBeenCalled();
    expect(repository.createSlotHold).not.toHaveBeenCalled();
    expect(whatsAppService.sendTemplate).not.toHaveBeenCalled();
  });

  it('without appointmentService/availability configured, confirmSlot behaves exactly as Phase 7 shipped it (backward compatible)', async () => {
    const repository = createMockRepository();
    const prisma = createMockPrisma();
    const whatsAppService = createMockWhatsAppService();
    repository.findBookingRequestById.mockResolvedValue(awaitingBooking());
    repository.confirmBooking.mockResolvedValue({
      ...awaitingBooking({ state: 'CONFIRMED' }),
      confirmedAt: new Date(),
      slotDate: SLOT.date,
      slotStartMinutes: SLOT.startMinutes,
      slotDurationMinutes: SLOT.durationMinutes,
    });

    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
    });

    const result = await service.confirmSlot(CLINIC_ID, BOOKING_ID, SLOT);

    expect(result.outcome).toBe('CONFIRMED');
    expect(repository.createSlotHold).toHaveBeenCalledTimes(1);
  });
});

describe('BookingService.cancelBooking (D-09, D-25)', () => {
  it('transitions CONFIRMED to CANCELLED, deletes the slot hold, stores cancelReason, and writes an audit entry', async () => {
    const repository = createMockRepository();
    const prisma = createMockPrisma();
    const whatsAppService = createMockWhatsAppService();
    repository.findBookingRequestById.mockResolvedValue(awaitingBooking({ state: 'CONFIRMED' }));
    repository.cancelBooking.mockResolvedValue({
      ...awaitingBooking({ state: 'CANCELLED' }),
      cancelledAt: new Date(),
      cancelReason: 'Owner called to cancel',
    });

    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
    });

    const result = await service.cancelBooking(CLINIC_ID, BOOKING_ID, 'staff-1', 'Owner called to cancel');

    expect(result.state).toBe('CANCELLED');
    expect(result.cancelReason).toBe('Owner called to cancel');
    expect(repository.deleteSlotHoldByBookingId).toHaveBeenCalledWith(
      CLINIC_ID,
      BOOKING_ID,
      expect.anything(),
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      AuditEvent.WHATSAPP_BOOKING_CANCELLED,
      expect.objectContaining({ userId: 'staff-1', clinicId: CLINIC_ID }),
    );
  });

  it('throws 404 (not 403) for a booking from another clinic', async () => {
    const repository = createMockRepository();
    repository.findBookingRequestById.mockResolvedValue(null);
    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: createMockPrisma() as any,
      whatsAppService: createMockWhatsAppService() as any,
    });

    await expect(service.cancelBooking(CLINIC_ID, BOOKING_ID, 'staff-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('requires a real actorUserId argument (structural D-09 enforcement) — calling with only 2 args omits it', () => {
    const repository = createMockRepository();
    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: createMockPrisma() as any,
      whatsAppService: createMockWhatsAppService() as any,
    });

    expect(service.cancelBooking.length).toBeGreaterThanOrEqual(3);
  });
});

describe('BookingService.moveBooking (D-09, D-25)', () => {
  it('transitions the old booking to MOVED, creates a new CONFIRMED booking linked by movedToBookingId, deletes the old hold and inserts the new one, and writes an audit entry', async () => {
    const repository = createMockRepository();
    const prisma = createMockPrisma();
    const whatsAppService = createMockWhatsAppService();
    const oldBooking = awaitingBooking({ state: 'CONFIRMED' });
    repository.findBookingRequestById.mockResolvedValue(oldBooking);
    const newBookingRow = { ...oldBooking, id: 'booking-2', reference: 'BK-202608-ZZ99' };
    repository.createBookingRequest.mockResolvedValue(newBookingRow);
    repository.confirmBooking.mockResolvedValue({
      ...newBookingRow,
      state: 'CONFIRMED',
      confirmedAt: new Date(),
      slotDate: SLOT.date,
      slotStartMinutes: SLOT.startMinutes,
      slotDurationMinutes: SLOT.durationMinutes,
    });
    repository.markMoved.mockResolvedValue({ ...oldBooking, state: 'MOVED', movedToBookingId: 'booking-2' });

    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
    });

    const result = await service.moveBooking(CLINIC_ID, BOOKING_ID, 'staff-1', SLOT);

    expect(result.outcome).toBe('CONFIRMED');
    expect(repository.deleteSlotHoldByBookingId).toHaveBeenCalledWith(CLINIC_ID, BOOKING_ID, expect.anything());
    expect(repository.createSlotHold).toHaveBeenCalledWith(
      CLINIC_ID,
      'booking-2',
      { date: SLOT.date, startMinutes: SLOT.startMinutes },
      expect.anything(),
    );
    expect(repository.markMoved).toHaveBeenCalledWith(
      CLINIC_ID,
      BOOKING_ID,
      'staff-1',
      'booking-2',
      expect.anything(),
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      AuditEvent.WHATSAPP_BOOKING_MOVED,
      expect.objectContaining({ userId: 'staff-1', clinicId: CLINIC_ID }),
    );
  });

  it('returns SLOT_TAKEN and leaves the original booking CONFIRMED with its original hold intact when the new slot is already held', async () => {
    const repository = createMockRepository();
    const prisma = createMockPrisma();
    const whatsAppService = createMockWhatsAppService();
    const oldBooking = awaitingBooking({ state: 'CONFIRMED' });
    repository.findBookingRequestById.mockResolvedValue(oldBooking);
    repository.createBookingRequest.mockResolvedValue({ ...oldBooking, id: 'booking-2' });
    repository.createSlotHold.mockRejectedValue(p2002Error());

    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: prisma as any,
      whatsAppService: whatsAppService as any,
    });

    const result = await service.moveBooking(CLINIC_ID, BOOKING_ID, 'staff-1', SLOT);

    expect(result).toEqual({ outcome: 'SLOT_TAKEN' });
    // The whole transaction (including the old hold's delete) rolled back —
    // markMoved (which would finalize the old booking as MOVED) must never
    // have been reached.
    expect(repository.markMoved).not.toHaveBeenCalled();
  });

  it('requires a real actorUserId argument (structural D-09 enforcement)', () => {
    const repository = createMockRepository();
    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: createMockPrisma() as any,
      whatsAppService: createMockWhatsAppService() as any,
    });

    expect(service.moveBooking.length).toBeGreaterThanOrEqual(3);
  });
});

describe('BookingService.expireStaleRequests', () => {
  it('transitions AWAITING_SLOT_CHOICE bookings older than the configured window to EXPIRED and releases no hold', async () => {
    const repository = createMockRepository();
    repository.expireStale.mockResolvedValue({ count: 3 });
    const service = new BookingService({
      repository: repository as unknown as BookingRepository,
      prisma: createMockPrisma() as any,
      whatsAppService: createMockWhatsAppService() as any,
    });

    await service.expireStaleRequests(CLINIC_ID);

    expect(repository.expireStale).toHaveBeenCalledTimes(1);
    expect(repository.deleteSlotHoldByBookingId).not.toHaveBeenCalled();
  });
});

describe('assertBookingTransition (D-06, D-09)', () => {
  it("throws a 409 with code 'INVALID_BOOKING_TRANSITION' for CANCELLED -> CONFIRMED", () => {
    expect(() => assertBookingTransition('CANCELLED', 'CONFIRMED')).toThrowError(
      expect.objectContaining({ statusCode: 409, code: 'INVALID_BOOKING_TRANSITION' }),
    );
  });

  it('does not throw for AWAITING_SLOT_CHOICE -> CONFIRMED', () => {
    expect(() => assertBookingTransition('AWAITING_SLOT_CHOICE', 'CONFIRMED')).not.toThrow();
  });
});

describe('generateReference', () => {
  it('produces a value matching /^BK-\\d{6}-[A-Z0-9]{4}$/', () => {
    expect(generateReference()).toMatch(/^BK-\d{6}-[A-Z0-9]{4}$/);
  });

  it('produces different values across two calls', () => {
    expect(generateReference()).not.toBe(generateReference());
  });
});

describe('BookingRepository.getBookedSlotMinutes (D-08)', () => {
  it('returns the slot minutes currently held for that clinic and day', async () => {
    const prisma = {
      whatsAppSlotHold: {
        findMany: vi.fn().mockResolvedValue([
          { slotDate: new Date('2026-08-14T00:00:00.000Z'), slotStartMinutes: 630 },
        ]),
      },
    };
    const repository = new BookingRepository(prisma as any);

    const result = await repository.getBookedSlotMinutes(
      CLINIC_ID,
      new Date('2026-08-14T00:00:00.000Z'),
      new Date('2026-08-14T00:00:00.000Z'),
    );

    expect(result).toEqual([{ slotDate: new Date('2026-08-14T00:00:00.000Z'), slotStartMinutes: 630 }]);
    expect(prisma.whatsAppSlotHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clinicId: CLINIC_ID }) }),
    );
  });
});
