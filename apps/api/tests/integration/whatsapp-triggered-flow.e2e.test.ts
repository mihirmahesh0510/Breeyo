import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { ReplayPriority } from '@breeyo/types';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestWhatsAppThread,
  createTestWhatsAppBookingRequest,
  createTestAppointment,
  prisma,
} from '../helpers/factories.js';
import { AppointmentRepository } from '../../src/modules/scheduling/appointment.repository.js';
import { AppointmentService } from '../../src/modules/scheduling/appointment.service.js';
import { AvailabilityService } from '../../src/modules/scheduling/availability.service.js';
import { AvailabilityRepository } from '../../src/modules/scheduling/availability.repository.js';
import { QueueRepository } from '../../src/modules/queue/queue.repository.js';
import { QueueHandoffService } from '../../src/modules/scheduling/queue-handoff.service.js';

/**
 * Plan 10-06 Task 1 (D-29): the mandatory second proof path, alongside
 * offline recovery -- a WhatsApp-triggered clinic flow surviving a real
 * connectivity drop and return.
 *
 * ## The concrete flow chosen, and why
 *
 * Per 07-CONTEXT.md D-06/D-08 and `booking.service.ts`'s own header comment
 * ("Deliberately no walk-in queue row is ever created here ... a Phase 7
 * booking is provisional, not a walk-in check-in"), a confirmed WhatsApp
 * booking does NOT itself put a patient on the walk-in queue. The real
 * WhatsApp-triggered mechanism that DOES reach the queue is Phase 8's queue
 * handoff sweep (`QueueHandoffService.createExpectedEntriesForDueAppointments`,
 * proven directly in `apps/api/tests/scheduling/queue-handoff.test.ts`):
 * a CONFIRMED `WhatsAppBookingRequest` becomes a real `Appointment` with
 * `source: 'WHATSAPP'`; once that appointment is due, the sweep creates an
 * `EXPECTED` queue entry; front desk then checks the patient in -- referencing
 * that booking -- when they physically arrive (07-CONTEXT.md: "Check in
 * manually when the owner arrives").
 *
 * This is exactly the flow chosen here: a CONFIRMED WhatsApp booking ->
 * WHATSAPP-sourced `Appointment` -> swept into an `EXPECTED` queue entry ->
 * the front-desk device goes offline right as the pet physically arrives ->
 * the EXPECTED -> WAITING check-in (and the subsequent WAITING -> IN_CONSULT
 * -> DONE progression) is captured offline and reconciled through the real
 * `/api/v1/queue/sync/replay` endpoint across more than one drop/recover
 * moment, exactly the way Plan 10-02's queue-first replay works for any
 * other queue entry -- proving the WhatsApp origin of a queue entry does not
 * exempt it from, or break, ordinary offline queue recovery, and that the
 * originating booking/thread state is undisturbed by the mobile replay.
 */

let app: FastifyInstance;

let clinicId: string;
let vetUserId: string;
let token: string;

const DEVICE_ID = 'front-desk-tablet-whatsapp-flow';

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const vet = await createTestUser({ fullName: 'Dr WhatsApp Flow' });
  vetUserId = vet.id;

  const clinic = await createTestClinic(vet.id, { name: 'WhatsApp Flow Clinic' });
  clinicId = clinic.id;
  await createTestClinicMember(vet.id, clinic.id, 'Admin');
  token = (await createTestTokens(app, vet.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

function buildHandoffService() {
  const appointmentRepository = new AppointmentRepository(prisma);
  const queueRepository = new QueueRepository(prisma);
  const availability = new AvailabilityService(new AvailabilityRepository(prisma));
  const appointmentService = new AppointmentService(appointmentRepository, availability, prisma, null);
  return new QueueHandoffService(appointmentRepository, queueRepository, appointmentService, prisma, null);
}

function queueStatusEnvelope(entryId: string, status: string, operationId?: string) {
  return {
    deviceId: DEVICE_ID,
    operationId: operationId ?? randomUUID(),
    clinicId: 'ignored-by-server',
    userId: 'ignored-by-server',
    domain: 'queue',
    entityType: 'QUEUE_STATUS_TRANSITION',
    entityId: entryId,
    priority: ReplayPriority.QUEUE_HIGH,
    createdAt: new Date().toISOString(),
    payload: { entryId, status },
  };
}

function replayQueue(operations: unknown[]) {
  return request(app.server)
    .post('/api/v1/queue/sync/replay')
    .set(auth())
    .send({ deviceId: DEVICE_ID, operations });
}

describe('WhatsApp-triggered clinic flow reconciles across a connectivity drop and return (D-29)', () => {
  it('a CONFIRMED WhatsApp booking becomes a swept EXPECTED queue entry, then the offline arrival check-in and consult survive TWO drop/recover cycles without disturbing the booking/thread state', async () => {
    const owner = await createTestPetOwner(clinicId);
    const pet = await createTestPet(clinicId, owner.id, { name: 'WhatsApp-Booked Pet' });
    const thread = await createTestWhatsAppThread(clinicId, owner.id);

    const booking = await createTestWhatsAppBookingRequest(clinicId, thread.id, owner.id, pet.id, {
      state: 'CONFIRMED',
      confirmedAt: new Date(),
      slotDate: new Date(),
      slotStartMinutes: 9 * 60,
      slotDurationMinutes: 15,
    });

    // The real `BookingService.confirmSlot` (Phase 7 + Phase 8 wiring)
    // creates a real, due `Appointment` sourced from this booking and links
    // the two records together. Reproduced directly here via the factory +
    // an explicit link, the same simplification
    // `apps/api/tests/scheduling/queue-handoff.test.ts` itself uses for its
    // own appointment fixtures, rather than re-wiring `BookingService`'s
    // full `WhatsAppService`/repository dependency graph for one flow test.
    const appointment = await createTestAppointment(clinicId, vetUserId, owner.id, [pet.id], vetUserId, {
      source: 'WHATSAPP',
      scheduledFor: new Date(Date.now() - 5 * 60_000), // 5 minutes ago -- due
    });
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { whatsappBookingRequestId: booking.id },
    });
    await prisma.whatsAppBookingRequest.update({
      where: { id: booking.id },
      data: { supersededByAppointmentId: appointment.id },
    });

    // ---- The queue handoff sweep runs (as it does on its own schedule in
    // production) and creates the EXPECTED entry. ----
    const handoffService = buildHandoffService();
    const sweepResult = await handoffService.createExpectedEntriesForDueAppointments(new Date());
    expect(sweepResult.entriesCreated).toBe(1);

    const queueEntry = await prisma.queueEntry.findFirstOrThrow({ where: { clinicId, appointmentId: appointment.id } });
    expect(queueEntry.status).toBe('EXPECTED');
    expect(queueEntry.petId).toBe(pet.id);

    // ---- Drop/recover cycle 1: the pet physically arrives while the
    // front-desk device is offline. The check-in (EXPECTED -> WAITING,
    // referencing the booking-derived queue entry) is captured locally and
    // only reconciled once the device reconnects. ----
    const checkInOp = queueStatusEnvelope(queueEntry.id, 'WAITING');
    const checkInReplay = await replayQueue([checkInOp]);
    expect(checkInReplay.status).toBe(200);
    expect(checkInReplay.body.data.acknowledgedOperationIds).toEqual([checkInOp.operationId]);

    const afterCheckIn = await prisma.queueEntry.findUniqueOrThrow({ where: { id: queueEntry.id } });
    expect(afterCheckIn.status).toBe('WAITING');
    expect(afterCheckIn.checkedInAt).not.toBeNull();
    // The booking-derived link must survive the replay untouched.
    expect(afterCheckIn.appointmentId).toBe(appointment.id);

    // A flaky signal means the SAME check-in operation is resent before the
    // device ever saw the first 200 -- must be a pure no-op, not a second
    // arrival stamp or a rejected transition (WAITING -> WAITING is invalid,
    // so a non-idempotent replay would incorrectly create a review task
    // here).
    const flappingResend = await replayQueue([checkInOp]);
    expect(flappingResend.body.data.acknowledgedOperationIds).toEqual([checkInOp.operationId]);
    expect(flappingResend.body.data.reviewTaskIds).toEqual([]);

    // ---- Drop/recover cycle 2: connectivity drops AGAIN mid-visit (a
    // second, independent drop, not a continuation of the first) while the
    // vet calls the patient in for consult; reconnect replays that too. ----
    const inConsultOp = queueStatusEnvelope(queueEntry.id, 'IN_CONSULT');
    const inConsultReplay = await replayQueue([inConsultOp]);
    expect(inConsultReplay.status).toBe(200);
    expect(inConsultReplay.body.data.acknowledgedOperationIds).toEqual([inConsultOp.operationId]);

    const afterInConsult = await prisma.queueEntry.findUniqueOrThrow({ where: { id: queueEntry.id } });
    expect(afterInConsult.status).toBe('IN_CONSULT');
    expect(afterInConsult.treatingVetId).toBe(vetUserId);

    // ---- A third drop/recover moment closes out the visit. ----
    const doneOp = queueStatusEnvelope(queueEntry.id, 'DONE');
    const doneReplay = await replayQueue([doneOp]);
    expect(doneReplay.status).toBe(200);
    expect(doneReplay.body.data.acknowledgedOperationIds).toEqual([doneOp.operationId]);

    const finalEntry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: queueEntry.id } });
    expect(finalEntry.status).toBe('DONE');
    expect(finalEntry.appointmentId).toBe(appointment.id);

    // ---- The WhatsApp booking/thread state is never mutated by any of the
    // queue replays above -- the two domains reconcile independently. ----
    const bookingAfter = await prisma.whatsAppBookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.state).toBe('CONFIRMED');
    expect(bookingAfter.supersededByAppointmentId).toBe(appointment.id);
    expect(bookingAfter.threadId).toBe(thread.id);

    const threadAfter = await prisma.whatsAppThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(threadAfter.id).toBe(thread.id);
    expect(threadAfter.ownerId).toBe(owner.id);

    const appointmentAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(appointmentAfter.whatsappBookingRequestId).toBe(booking.id);

    // ---- Visible consistently through the mobile queue endpoint too. ----
    const mobileBoard = await request(app.server).get('/api/v1/queue').set(auth());
    expect(mobileBoard.status).toBe(200);
    const doneOnBoard = [...mobileBoard.body.data.done].some((entry: { id: string }) => entry.id === queueEntry.id);
    expect(doneOnBoard).toBe(true);
  });
});
