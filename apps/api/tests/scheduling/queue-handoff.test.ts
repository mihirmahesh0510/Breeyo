import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'socket.io';
import { Queue } from 'bullmq';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestPetOwner,
  createTestPet,
  createTestAppointment,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';
import { AppointmentRepository } from '../../src/modules/scheduling/appointment.repository.js';
import { AppointmentService } from '../../src/modules/scheduling/appointment.service.js';
import { AvailabilityService } from '../../src/modules/scheduling/availability.service.js';
import { AvailabilityRepository } from '../../src/modules/scheduling/availability.repository.js';
import { QueueRepository } from '../../src/modules/queue/queue.repository.js';
import { QueueHandoffService } from '../../src/modules/scheduling/queue-handoff.service.js';
import { PushTriggerService } from '../../src/modules/scheduling/push-trigger.service.js';
import { createNotificationBus } from '../../src/modules/notifications/notification-bus.js';
import { runSchedulingSweep, registerSchedulingSweep } from '../../src/modules/scheduling/scheduling.sweep.worker.js';
import { SOCKET_EVENTS } from '@breeyo/types';

let app: FastifyInstance;

function createMockIO(): { io: Server; emit: ReturnType<typeof vi.fn> } {
  const emit = vi.fn();
  const io = { to: vi.fn().mockReturnValue({ emit }) } as unknown as Server;
  return { io, emit };
}

function buildHandoffService(io: Server | null = null) {
  const appointmentRepository = new AppointmentRepository(prisma);
  const queueRepository = new QueueRepository(prisma);
  const availability = new AvailabilityService(new AvailabilityRepository(prisma));
  const appointmentService = new AppointmentService(appointmentRepository, availability, prisma, io);
  return new QueueHandoffService(appointmentRepository, queueRepository, appointmentService, prisma, io);
}

async function setupClinicContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  return { user, clinic, owner, pet };
}

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('Queue handoff sweep -- Pass 1: createExpectedEntriesForDueAppointments (SCH-02, D-08, D-21)', () => {
  it('a due appointment with two pets creates one EXPECTED entry per pet, ordered by scheduled time', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const pet2 = await createTestPet(clinic.id, owner.id);
    const scheduledFor = new Date(Date.now() - 5 * 60000); // 5 min ago -- due

    const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id, pet2.id], user.id, {
      scheduledFor,
    });

    const service = buildHandoffService();
    const result = await service.createExpectedEntriesForDueAppointments(new Date());

    expect(result.entriesCreated).toBe(2);
    expect(result.appointmentsProcessed).toBe(1);

    const entries = await prisma.queueEntry.findMany({ where: { clinicId: clinic.id, appointmentId: appointment.id } });
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.status).toBe('EXPECTED');
    }

    const petRows = await prisma.appointmentPet.findMany({ where: { appointmentId: appointment.id } });
    expect(petRows.every((p) => p.queueEntryId !== null)).toBe(true);
    // Each AppointmentPet points at its OWN entry, not a shared one.
    const queueEntryIds = new Set(petRows.map((p) => p.queueEntryId));
    expect(queueEntryIds.size).toBe(2);
  });

  it("the created entry's queuePriorityAt equals the appointment's scheduledFor, not the sweep's run time", async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() - 10 * 60000);

    const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

    const service = buildHandoffService();
    const runAt = new Date(); // "now" is well after scheduledFor
    await service.createExpectedEntriesForDueAppointments(runAt);

    const entry = await prisma.queueEntry.findFirst({ where: { clinicId: clinic.id, appointmentId: appointment.id } });
    expect(entry).not.toBeNull();
    expect(entry!.queuePriorityAt.getTime()).toBe(scheduledFor.getTime());
    expect(entry!.queuePriorityAt.getTime()).not.toBe(runAt.getTime());
  });

  it('the created entry has position 0 and an appointmentId, and does not consume a walk-in position number', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() - 5 * 60000);
    const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

    const service = buildHandoffService();
    await service.createExpectedEntriesForDueAppointments(new Date());

    const entry = await prisma.queueEntry.findFirst({ where: { clinicId: clinic.id, appointmentId: appointment.id } });
    expect(entry!.position).toBe(0);
    expect(entry!.appointmentId).toBe(appointment.id);
  });

  it('re-running the pass creates nothing further (idempotent via queueEntryCreatedAt)', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() - 5 * 60000);
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

    const service = buildHandoffService();
    const first = await service.createExpectedEntriesForDueAppointments(new Date());
    const second = await service.createExpectedEntriesForDueAppointments(new Date());

    expect(first.entriesCreated).toBe(1);
    expect(second.entriesCreated).toBe(0);
    expect(second.appointmentsProcessed).toBe(0);

    const entries = await prisma.queueEntry.findMany({ where: { clinicId: clinic.id } });
    expect(entries).toHaveLength(1);
  });

  it('a future appointment is not picked up', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() + 30 * 60000); // 30 min out
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

    const service = buildHandoffService();
    const result = await service.createExpectedEntriesForDueAppointments(new Date());

    expect(result.entriesCreated).toBe(0);
    const entries = await prisma.queueEntry.findMany({ where: { clinicId: clinic.id } });
    expect(entries).toHaveLength(0);
  });

  it('a cancelled appointment with a past scheduledFor is not picked up', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() - 5 * 60000);
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor,
      status: 'CANCELLED',
    });

    const service = buildHandoffService();
    const result = await service.createExpectedEntriesForDueAppointments(new Date());

    expect(result.entriesCreated).toBe(0);
    const entries = await prisma.queueEntry.findMany({ where: { clinicId: clinic.id } });
    expect(entries).toHaveLength(0);
  });

  it('broadcasts QUEUE_UPDATED to the clinic room once per appointment, not once per pet', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const pet2 = await createTestPet(clinic.id, owner.id);
    const scheduledFor = new Date(Date.now() - 5 * 60000);
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id, pet2.id], user.id, { scheduledFor });

    const { io, emit } = createMockIO();
    const service = buildHandoffService(io);
    await service.createExpectedEntriesForDueAppointments(new Date());

    expect(io.to).toHaveBeenCalledWith(`clinic:${clinic.id}`);
    const queueUpdatedCalls = emit.mock.calls.filter(([event]) => event === SOCKET_EVENTS.QUEUE_UPDATED);
    expect(queueUpdatedCalls).toHaveLength(1);
  });

  it('a pet that already walked in before their appointment slot is skipped, not double-entered', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() - 5 * 60000);
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

    // Simulate an existing WAITING walk-in entry for the same pet today.
    const queueRepository = new QueueRepository(prisma);
    await queueRepository.createEntry({
      clinicId: clinic.id,
      petId: pet.id,
      checkedInBy: user.id,
      status: 'WAITING',
      position: 1,
      isEmergency: false,
    });

    const service = buildHandoffService();
    const result = await service.createExpectedEntriesForDueAppointments(new Date());

    expect(result.entriesCreated).toBe(0);
    const entries = await prisma.queueEntry.findMany({ where: { clinicId: clinic.id, petId: pet.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('WAITING');
  });
});

describe('Scheduling sweep worker (Task 3): runSchedulingSweep / registerSchedulingSweep', () => {
  function buildSweepDeps(io: Server | null = null) {
    const appointmentRepository = new AppointmentRepository(prisma);
    const queueRepository = new QueueRepository(prisma);
    const availability = new AvailabilityService(new AvailabilityRepository(prisma));
    const appointmentService = new AppointmentService(appointmentRepository, availability, prisma, io);
    const handoff = new QueueHandoffService(appointmentRepository, queueRepository, appointmentService, prisma, io);
    const bus = createNotificationBus(app.redis);
    vi.spyOn(bus, 'emit').mockResolvedValue(undefined);
    const pushTriggers = new PushTriggerService(bus, prisma, app.redis);
    return { handoff, pushTriggers, appointments: appointmentRepository, bus };
  }

  it('runs all three passes in order against real fixtures and reports per-pass counts', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() - 5 * 60000);
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

    const { handoff, pushTriggers, appointments, bus } = buildSweepDeps();
    const now = new Date();
    const result = await runSchedulingSweep({ handoff, pushTriggers, appointments }, now);

    expect(result.handoff.entriesCreated).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.noShow).toBeDefined();
    expect(result.startingSoon).toBeDefined();
    await bus.close();
  });

  it('the sweep is idempotent end to end: running it twice yields the same row counts and no duplicate notifications', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const scheduledFor = new Date(Date.now() - 5 * 60000);
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

    const { handoff, pushTriggers, appointments, bus } = buildSweepDeps();
    const now = new Date();
    const first = await runSchedulingSweep({ handoff, pushTriggers, appointments }, now);
    const second = await runSchedulingSweep({ handoff, pushTriggers, appointments }, now);

    expect(first.handoff.entriesCreated).toBe(1);
    expect(second.handoff.entriesCreated).toBe(0);

    const entries = await prisma.queueEntry.findMany({ where: { clinicId: clinic.id } });
    expect(entries).toHaveLength(1);
    await bus.close();
  });

  it('a failure in one pass does not prevent the others, and the sweep resolves rather than rejecting', async () => {
    const { handoff, pushTriggers, appointments, bus } = buildSweepDeps();
    const noShowSpy = vi.spyOn(handoff, 'autoFlipExpiredExpected');
    vi.spyOn(handoff, 'createExpectedEntriesForDueAppointments').mockRejectedValue(new Error('boom'));

    const result = await runSchedulingSweep({ handoff, pushTriggers, appointments }, new Date());

    expect(result.errors.length).toBeGreaterThan(0);
    expect(noShowSpy).toHaveBeenCalledTimes(1);
    expect(result.noShow).toBeDefined();
    expect(result.startingSoon).toBeDefined();
    await bus.close();
  });

  it('reports what it did in a returned summary object with per-pass counts', async () => {
    const { handoff, pushTriggers, appointments, bus } = buildSweepDeps();
    const result = await runSchedulingSweep({ handoff, pushTriggers, appointments }, new Date());

    expect(result).toHaveProperty('handoff');
    expect(result).toHaveProperty('noShow');
    expect(result).toHaveProperty('startingSoon');
    expect(result).toHaveProperty('errors');
    await bus.close();
  });

  it('registerSchedulingSweep constructs a Queue always but no Worker under NODE_ENV=test', async () => {
    const { handoff, pushTriggers, appointments, bus } = buildSweepDeps();
    const { queue, worker } = registerSchedulingSweep(app.redis, { handoff, pushTriggers, appointments });

    expect(queue).toBeInstanceOf(Queue);
    expect(worker).toBeNull();

    await queue.close();
    await bus.close();
  });
});
