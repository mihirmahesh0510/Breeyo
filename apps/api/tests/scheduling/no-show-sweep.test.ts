import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'socket.io';
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
import { NO_SHOW_GRACE_MINUTES } from '@breeyo/types';

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

/** Books an appointment whose scheduled slot is `minutesAgo` minutes in the
 * past, then runs the handoff pass so it has a real EXPECTED queue entry to
 * work with -- exactly the state the no-show pass expects to find. */
async function createDueExpectedAppointment(
  clinicId: string,
  vetId: string,
  ownerId: string,
  petIds: string[],
  createdById: string,
  minutesAgo: number,
) {
  const scheduledFor = new Date(Date.now() - minutesAgo * 60000);
  const appointment = await createTestAppointment(clinicId, vetId, ownerId, petIds, createdById, { scheduledFor });
  const handoff = buildHandoffService();
  await handoff.createExpectedEntriesForDueAppointments(new Date());
  return appointment;
}

describe('Queue handoff sweep -- Pass 2: autoFlipExpiredExpected (D-09)', () => {
  it('an expected entry past the grace window flips both the QueueEntry and the Appointment to NO_SHOW', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const appointment = await createDueExpectedAppointment(
      clinic.id,
      user.id,
      owner.id,
      [pet.id],
      user.id,
      NO_SHOW_GRACE_MINUTES + 5,
    );

    const service = buildHandoffService();
    const result = await service.autoFlipExpiredExpected(new Date());

    expect(result.entriesFlipped).toBe(1);
    expect(result.appointmentsFlipped).toBe(1);

    const entry = await prisma.queueEntry.findFirst({ where: { clinicId: clinic.id, appointmentId: appointment.id } });
    expect(entry!.status).toBe('NO_SHOW');
    expect(entry!.completedAt).not.toBeNull();

    const updatedAppointment = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updatedAppointment!.status).toBe('NO_SHOW');
    expect(updatedAppointment!.noShowFlippedAt).not.toBeNull();
  });

  it('an expected entry inside the grace window is left untouched', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const appointment = await createDueExpectedAppointment(
      clinic.id,
      user.id,
      owner.id,
      [pet.id],
      user.id,
      NO_SHOW_GRACE_MINUTES - 1,
    );

    const service = buildHandoffService();
    const result = await service.autoFlipExpiredExpected(new Date());

    expect(result.entriesFlipped).toBe(0);
    expect(result.appointmentsFlipped).toBe(0);

    const entry = await prisma.queueEntry.findFirst({ where: { clinicId: clinic.id, appointmentId: appointment.id } });
    expect(entry!.status).toBe('EXPECTED');

    const updatedAppointment = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updatedAppointment!.status).toBe('SCHEDULED');
    expect(updatedAppointment!.noShowFlippedAt).toBeNull();
  });

  it('an already checked-in patient (WAITING) is not flipped, and its appointment stays out of NO_SHOW', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const appointment = await createDueExpectedAppointment(
      clinic.id,
      user.id,
      owner.id,
      [pet.id],
      user.id,
      NO_SHOW_GRACE_MINUTES + 5,
    );

    // The patient checked in (EXPECTED -> WAITING) before the sweep ran.
    const entry = await prisma.queueEntry.findFirst({ where: { clinicId: clinic.id, appointmentId: appointment.id } });
    await prisma.queueEntry.update({ where: { id: entry!.id }, data: { status: 'WAITING', checkedInAt: new Date() } });

    const service = buildHandoffService();
    const result = await service.autoFlipExpiredExpected(new Date());

    expect(result.entriesFlipped).toBe(0);
    expect(result.appointmentsFlipped).toBe(0);

    const stillWaiting = await prisma.queueEntry.findUnique({ where: { id: entry!.id } });
    expect(stillWaiting!.status).toBe('WAITING');

    const updatedAppointment = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updatedAppointment!.status).toBe('SCHEDULED');
  });

  it('re-running the no-show pass is a no-op: noShowFlippedAt is unchanged and no second broadcast fires', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const appointment = await createDueExpectedAppointment(
      clinic.id,
      user.id,
      owner.id,
      [pet.id],
      user.id,
      NO_SHOW_GRACE_MINUTES + 5,
    );

    const { io, emit } = createMockIO();
    const service = buildHandoffService(io);
    await service.autoFlipExpiredExpected(new Date());

    const afterFirst = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    const firstFlippedAt = afterFirst!.noShowFlippedAt;
    expect(firstFlippedAt).not.toBeNull();

    emit.mockClear();
    const secondResult = await service.autoFlipExpiredExpected(new Date());

    expect(secondResult.entriesFlipped).toBe(0);
    expect(secondResult.appointmentsFlipped).toBe(0);
    expect(emit).not.toHaveBeenCalled();

    const afterSecond = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(afterSecond!.noShowFlippedAt?.getTime()).toBe(firstFlippedAt!.getTime());
  });

  it('a multi-pet appointment flips only the pet(s) who did not arrive; the appointment is NOT marked NO_SHOW because at least one pet attended', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const pet2 = await createTestPet(clinic.id, owner.id);
    const appointment = await createDueExpectedAppointment(
      clinic.id,
      user.id,
      owner.id,
      [pet.id, pet2.id],
      user.id,
      NO_SHOW_GRACE_MINUTES + 5,
    );

    // pet checks in (attends); pet2 never shows up.
    const attendedEntry = await prisma.queueEntry.findFirst({ where: { clinicId: clinic.id, petId: pet.id } });
    await prisma.queueEntry.update({
      where: { id: attendedEntry!.id },
      data: { status: 'WAITING', checkedInAt: new Date() },
    });

    const service = buildHandoffService();
    const result = await service.autoFlipExpiredExpected(new Date());

    expect(result.entriesFlipped).toBe(1);
    // D-09 multi-pet rule (real product judgement): a multi-pet appointment
    // where at least one pet attended must NOT flip the appointment itself
    // to NO_SHOW, even though the no-show pet's own queue entry still flips.
    expect(result.appointmentsFlipped).toBe(0);

    const stillAttended = await prisma.queueEntry.findUnique({ where: { id: attendedEntry!.id } });
    expect(stillAttended!.status).toBe('WAITING');

    const noShowEntry = await prisma.queueEntry.findFirst({ where: { clinicId: clinic.id, petId: pet2.id } });
    expect(noShowEntry!.status).toBe('NO_SHOW');

    const updatedAppointment = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updatedAppointment!.status).toBe('SCHEDULED');
    // The marker is still stamped so this pass does not keep reconsidering
    // the appointment on every future sweep.
    expect(updatedAppointment!.noShowFlippedAt).not.toBeNull();
  });
});
