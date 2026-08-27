import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import { SOCKET_EVENTS, NO_SHOW_GRACE_MINUTES } from '@breeyo/types';
import { QueueHandoffService } from '../queue-handoff.service.js';
import type { AppointmentRepository } from '../appointment.repository.js';
import type { QueueRepository } from '../../queue/queue.repository.js';
import type { AppointmentService } from '../appointment.service.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const VET_ID = '00000000-0000-0000-0000-000000000020';
const OWNER_ID = '00000000-0000-0000-0000-000000000002';
const CREATED_BY_ID = '00000000-0000-0000-0000-000000000010';
const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000200';
const APPOINTMENT_ID_2 = '00000000-0000-0000-0000-000000000201';
const PET_ID_1 = '00000000-0000-0000-0000-000000000003';
const PET_ID_2 = '00000000-0000-0000-0000-000000000004';
const AP_ID_1 = '00000000-0000-0000-0000-000000000300';
const AP_ID_2 = '00000000-0000-0000-0000-000000000301';
const AP_ID_3 = '00000000-0000-0000-0000-000000000302';
const ENTRY_ID_1 = '00000000-0000-0000-0000-000000000100';
const ENTRY_ID_2 = '00000000-0000-0000-0000-000000000101';

const NOW = new Date('2026-08-17T10:00:00.000Z');
const SCHEDULED_FOR = new Date('2026-08-17T09:30:00.000Z');

function rawAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    clinicId: CLINIC_ID,
    vetId: VET_ID,
    ownerId: OWNER_ID,
    serviceCatalogId: null,
    status: 'SCHEDULED',
    scheduledFor: SCHEDULED_FOR,
    durationMinutes: 15,
    createdById: CREATED_BY_ID,
    queueEntryCreatedAt: null,
    noShowFlippedAt: null,
    startingSoonNotifiedAt: null,
    pets: [
      { id: AP_ID_1, appointmentId: APPOINTMENT_ID, petId: PET_ID_1, queueEntryId: null },
    ],
    ...overrides,
  };
}

function createMockAppointmentRepository(): AppointmentRepository {
  return {
    findDueForQueueHandoff: vi.fn().mockResolvedValue([]),
    findExpiredExpected: vi.fn().mockResolvedValue([]),
    findStartingSoon: vi.fn().mockResolvedValue([]),
    markQueueEntryCreated: vi.fn().mockResolvedValue(undefined),
    markNoShowFlipped: vi.fn(),
    markStartingSoonNotified: vi.fn(),
    setPetQueueEntry: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(null),
    findById: vi.fn(),
  } as unknown as AppointmentRepository;
}

function createMockQueueRepository(): QueueRepository {
  const repo = {
    findTodayActiveEntryForPet: vi.fn().mockResolvedValue(null),
    createEntry: vi.fn().mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve({ id: ENTRY_ID_1, ...data }),
    ),
    findEntryById: vi.fn(),
    updateEntry: vi.fn().mockImplementation((id: string, data: Record<string, unknown>) =>
      Promise.resolve({ id, ...data }),
    ),
  };
  // queue-checkin-handoff-race fix: `createExpectedEntriesForDueAppointments`
  // now calls this single method instead of composing
  // `findTodayActiveEntryForPet` then `createEntry` itself -- the mock
  // re-composes them the same way the real (lock-protected) implementation
  // does, so every test above that stubs those two mocks directly keeps
  // working unchanged. The `tx` (4th) arg is accepted and ignored -- the
  // fake has no real lock to acquire.
  const createEntryIfNoneActive = vi.fn(
    async (clinicId: string, petId: string, today: Date, data: Record<string, unknown>) => {
      const existingActive = await repo.findTodayActiveEntryForPet(clinicId, petId, today);
      if (existingActive) {
        return { entry: null, existingActive };
      }
      const entry = await repo.createEntry(data);
      return { entry, existingActive: null };
    },
  );
  return { ...repo, createEntryIfNoneActive } as unknown as QueueRepository;
}

function createMockAppointmentService(): AppointmentService {
  return {
    markNoShow: vi.fn().mockResolvedValue(undefined),
  } as unknown as AppointmentService;
}

function createMockIO(): { io: Server; emit: ReturnType<typeof vi.fn> } {
  const emit = vi.fn();
  const io = { to: vi.fn().mockReturnValue({ emit }) } as unknown as Server;
  return { io, emit };
}

function createMockPrisma(): PrismaClient {
  return {
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    serviceCatalog: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
}

describe('QueueHandoffService (mocked, pure branching logic)', () => {
  let appointments: ReturnType<typeof createMockAppointmentRepository>;
  let queue: ReturnType<typeof createMockQueueRepository>;
  let appointmentService: ReturnType<typeof createMockAppointmentService>;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    appointments = createMockAppointmentRepository();
    queue = createMockQueueRepository();
    appointmentService = createMockAppointmentService();
    prisma = createMockPrisma();
  });

  describe('createExpectedEntriesForDueAppointments', () => {
    it('creates one EXPECTED entry per pet on a due appointment', async () => {
      vi.mocked(appointments.findDueForQueueHandoff).mockResolvedValue([
        rawAppointment({
          pets: [
            { id: AP_ID_1, appointmentId: APPOINTMENT_ID, petId: PET_ID_1, queueEntryId: null },
            { id: AP_ID_2, appointmentId: APPOINTMENT_ID, petId: PET_ID_2, queueEntryId: null },
          ],
        }),
      ] as any);

      const { io } = createMockIO();
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, io);

      const result = await service.createExpectedEntriesForDueAppointments(NOW);

      expect(queue.createEntry).toHaveBeenCalledTimes(2);
      expect(result.entriesCreated).toBe(2);
      expect(result.appointmentsProcessed).toBe(1);
    });

    it('sets queuePriorityAt to the appointment scheduledFor, never now', async () => {
      vi.mocked(appointments.findDueForQueueHandoff).mockResolvedValue([rawAppointment()] as any);
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      await service.createExpectedEntriesForDueAppointments(NOW);

      expect(queue.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ queuePriorityAt: SCHEDULED_FOR }),
      );
    });

    it('creates the entry with position 0 and links appointmentId', async () => {
      vi.mocked(appointments.findDueForQueueHandoff).mockResolvedValue([rawAppointment()] as any);
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      await service.createExpectedEntriesForDueAppointments(NOW);

      expect(queue.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ position: 0, appointmentId: APPOINTMENT_ID, status: 'EXPECTED' }),
      );
      expect(appointments.setPetQueueEntry).toHaveBeenCalledWith(CLINIC_ID, AP_ID_1, ENTRY_ID_1, expect.anything());
      expect(appointments.markQueueEntryCreated).toHaveBeenCalledWith(CLINIC_ID, APPOINTMENT_ID, NOW, expect.anything());
    });

    it('skips a pet that already has an active queue entry today', async () => {
      vi.mocked(appointments.findDueForQueueHandoff).mockResolvedValue([rawAppointment()] as any);
      vi.mocked(queue.findTodayActiveEntryForPet).mockResolvedValue({ id: 'already-active' } as any);
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      const result = await service.createExpectedEntriesForDueAppointments(NOW);

      expect(queue.createEntry).not.toHaveBeenCalled();
      expect(result.entriesCreated).toBe(0);
      // The appointment is still processed/marked so the sweep does not retry forever.
      expect(appointments.markQueueEntryCreated).toHaveBeenCalledWith(CLINIC_ID, APPOINTMENT_ID, NOW, expect.anything());
    });

    it('broadcasts QUEUE_UPDATED once per appointment, not once per pet', async () => {
      vi.mocked(appointments.findDueForQueueHandoff).mockResolvedValue([
        rawAppointment({
          pets: [
            { id: AP_ID_1, appointmentId: APPOINTMENT_ID, petId: PET_ID_1, queueEntryId: null },
            { id: AP_ID_2, appointmentId: APPOINTMENT_ID, petId: PET_ID_2, queueEntryId: null },
          ],
        }),
      ] as any);
      const { io, emit } = createMockIO();
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, io);

      await service.createExpectedEntriesForDueAppointments(NOW);

      const queueUpdatedCalls = emit.mock.calls.filter(([event]) => event === SOCKET_EVENTS.QUEUE_UPDATED);
      expect(queueUpdatedCalls).toHaveLength(1);
    });
  });

  describe('autoFlipExpiredExpected', () => {
    it('flips an expired EXPECTED entry to NO_SHOW on both sides when nobody attended', async () => {
      vi.mocked(appointments.findExpiredExpected).mockResolvedValue([rawAppointment({
        pets: [{ id: AP_ID_1, appointmentId: APPOINTMENT_ID, petId: PET_ID_1, queueEntryId: ENTRY_ID_1 }],
      })] as any);
      vi.mocked(queue.findEntryById).mockResolvedValue({ id: ENTRY_ID_1, status: 'EXPECTED' } as any);
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      const result = await service.autoFlipExpiredExpected(NOW);

      expect(queue.updateEntry).toHaveBeenCalledWith(ENTRY_ID_1, expect.objectContaining({ status: 'NO_SHOW' }));
      expect(appointmentService.markNoShow).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: CLINIC_ID, appointmentId: APPOINTMENT_ID }),
      );
      expect(result.entriesFlipped).toBe(1);
      expect(result.appointmentsFlipped).toBe(1);
    });

    it('does not flip or mark no-show for a pet already WAITING/IN_CONSULT', async () => {
      vi.mocked(appointments.findExpiredExpected).mockResolvedValue([rawAppointment({
        pets: [{ id: AP_ID_1, appointmentId: APPOINTMENT_ID, petId: PET_ID_1, queueEntryId: ENTRY_ID_1 }],
      })] as any);
      vi.mocked(queue.findEntryById).mockResolvedValue({ id: ENTRY_ID_1, status: 'WAITING' } as any);
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      const result = await service.autoFlipExpiredExpected(NOW);

      expect(queue.updateEntry).not.toHaveBeenCalled();
      expect(appointmentService.markNoShow).not.toHaveBeenCalled();
      expect(result.entriesFlipped).toBe(0);
      expect(result.appointmentsFlipped).toBe(0);
    });

    it('a multi-pet appointment flips only the non-attending pet and does not mark the appointment NO_SHOW', async () => {
      vi.mocked(appointments.findExpiredExpected).mockResolvedValue([rawAppointment({
        pets: [
          { id: AP_ID_1, appointmentId: APPOINTMENT_ID, petId: PET_ID_1, queueEntryId: ENTRY_ID_1 },
          { id: AP_ID_2, appointmentId: APPOINTMENT_ID, petId: PET_ID_2, queueEntryId: ENTRY_ID_2 },
        ],
      })] as any);
      vi.mocked(queue.findEntryById).mockImplementation((id: string) => {
        if (id === ENTRY_ID_1) return Promise.resolve({ id: ENTRY_ID_1, status: 'WAITING' } as any);
        return Promise.resolve({ id: ENTRY_ID_2, status: 'EXPECTED' } as any);
      });
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      const result = await service.autoFlipExpiredExpected(NOW);

      // Only the still-EXPECTED pet's entry flips.
      expect(queue.updateEntry).toHaveBeenCalledTimes(1);
      expect(queue.updateEntry).toHaveBeenCalledWith(ENTRY_ID_2, expect.objectContaining({ status: 'NO_SHOW' }));
      // The appointment itself is NOT marked NO_SHOW -- at least one pet (ENTRY_ID_1) attended.
      expect(appointmentService.markNoShow).not.toHaveBeenCalled();
      // The marker-only stamp still happens so this pass does not reconsider the appointment forever.
      expect(appointments.update).toHaveBeenCalledWith(CLINIC_ID, APPOINTMENT_ID, expect.objectContaining({ noShowFlippedAt: NOW }));
      expect(result.entriesFlipped).toBe(1);
      expect(result.appointmentsFlipped).toBe(0);
    });

    it('respects a custom grace window', async () => {
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);
      await service.autoFlipExpiredExpected(NOW, NO_SHOW_GRACE_MINUTES);

      const [cutoff] = vi.mocked(appointments.findExpiredExpected).mock.calls[0];
      expect((cutoff as Date).getTime()).toBe(NOW.getTime() - NO_SHOW_GRACE_MINUTES * 60000);
    });
  });

  describe('per-appointment error isolation (WR-4)', () => {
    it('createExpectedEntriesForDueAppointments: a throwing appointment does not block later appointments in the batch', async () => {
      const failingAppointment = rawAppointment();
      const laterAppointment = rawAppointment({
        id: APPOINTMENT_ID_2,
        pets: [{ id: AP_ID_3, appointmentId: APPOINTMENT_ID_2, petId: PET_ID_2, queueEntryId: null }],
      });
      vi.mocked(appointments.findDueForQueueHandoff).mockResolvedValue([
        failingAppointment,
        laterAppointment,
      ] as any);

      // The first appointment's transaction blows up (e.g. a constraint
      // violation); the second appointment's transaction is unaffected.
      vi.mocked(prisma.$transaction)
        .mockRejectedValueOnce(new Error('simulated per-appointment failure'))
        .mockImplementationOnce((fn: any) => fn({}));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      const result = await service.createExpectedEntriesForDueAppointments(NOW);

      // The later appointment must still be processed and marked, even
      // though it was ordered after the one that threw.
      expect(appointments.markQueueEntryCreated).toHaveBeenCalledWith(
        CLINIC_ID,
        APPOINTMENT_ID_2,
        NOW,
        expect.anything(),
      );
      expect(appointments.markQueueEntryCreated).not.toHaveBeenCalledWith(
        CLINIC_ID,
        APPOINTMENT_ID,
        NOW,
        expect.anything(),
      );
      expect(result.appointmentsProcessed).toBe(1);
      expect(result.entriesCreated).toBe(1);

      // The failure must be logged with enough context to debug (which
      // appointment/clinic), not silently swallowed.
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedText = JSON.stringify(consoleErrorSpy.mock.calls);
      expect(loggedText).toContain(APPOINTMENT_ID);
      expect(loggedText).toContain(CLINIC_ID);

      consoleErrorSpy.mockRestore();
    });

    it('autoFlipExpiredExpected: a throwing appointment does not block later appointments in the batch', async () => {
      const failingAppointment = rawAppointment({
        pets: [{ id: AP_ID_1, appointmentId: APPOINTMENT_ID, petId: PET_ID_1, queueEntryId: ENTRY_ID_1 }],
      });
      const laterAppointment = rawAppointment({
        id: APPOINTMENT_ID_2,
        pets: [{ id: AP_ID_3, appointmentId: APPOINTMENT_ID_2, petId: PET_ID_2, queueEntryId: ENTRY_ID_2 }],
      });
      vi.mocked(appointments.findExpiredExpected).mockResolvedValue([
        failingAppointment,
        laterAppointment,
      ] as any);
      vi.mocked(queue.findEntryById).mockImplementation((id: string) =>
        Promise.resolve({ id, status: 'EXPECTED' } as any),
      );
      // The first appointment's entry update blows up; the second
      // appointment's entry update is unaffected.
      vi.mocked(queue.updateEntry)
        .mockRejectedValueOnce(new Error('simulated per-appointment failure'))
        .mockImplementationOnce((id: string, data: Record<string, unknown>) =>
          Promise.resolve({ id, ...data }),
        );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const service = new QueueHandoffService(appointments, queue, appointmentService, prisma, null);

      const result = await service.autoFlipExpiredExpected(NOW);

      // The later appointment must still be flipped to NO_SHOW, even though
      // it was ordered after the one that threw.
      expect(appointmentService.markNoShow).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: CLINIC_ID, appointmentId: APPOINTMENT_ID_2 }),
      );
      expect(appointmentService.markNoShow).not.toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
      );
      expect(result.entriesFlipped).toBe(1);
      expect(result.appointmentsFlipped).toBe(1);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedText = JSON.stringify(consoleErrorSpy.mock.calls);
      expect(loggedText).toContain(APPOINTMENT_ID);
      expect(loggedText).toContain(CLINIC_ID);

      consoleErrorSpy.mockRestore();
    });
  });
});
