import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
import { OwnerActionService } from '../../src/modules/scheduling/owner-action.service.js';
import { AppointmentRepository } from '../../src/modules/scheduling/appointment.repository.js';
import { AvailabilityRepository } from '../../src/modules/scheduling/availability.repository.js';
import { AvailabilityService } from '../../src/modules/scheduling/availability.service.js';
import { AppointmentService } from '../../src/modules/scheduling/appointment.service.js';
import { AppointmentReminderService } from '../../src/modules/scheduling/reminder.service.js';
import { PushTriggerService } from '../../src/modules/scheduling/push-trigger.service.js';
import { ReminderTaskRepository } from '../../src/modules/whatsapp/reminders/reminder-task.repository.js';
import { WhatsAppRepository } from '../../src/modules/whatsapp/whatsapp.repository.js';
import { createNotificationBus, NotificationBus } from '../../src/modules/notifications/notification-bus.js';

/**
 * Phase 8 plan 08-10 Task 3 (T-08-46, T-08-47) — the real-database proof of
 * `OwnerActionService`'s ownership refusals: these assertions must run
 * against real rows, not mocks, per the plan's explicit instruction. Every
 * other behavior (KEEP/MOVE/CANCEL dispatch, D-33 copy) is already covered
 * by the fast mocked suite in
 * `apps/api/src/modules/scheduling/__tests__/owner-action.service.test.ts`.
 */

let app: FastifyInstance;

async function setupClinicContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  return { user, clinic, owner, pet };
}

function buildService(bus: NotificationBus, sender: { send: ReturnType<typeof vi.fn> }) {
  const appointments = new AppointmentRepository(prisma);
  const availabilityRepo = new AvailabilityRepository(prisma);
  const availability = new AvailabilityService(availabilityRepo, prisma, null);
  const appointmentService = new AppointmentService(appointments, availability, prisma, null);
  const reminderTaskRepo = new ReminderTaskRepository(prisma);
  const whatsappRepo = new WhatsAppRepository(prisma);
  const reminders = new AppointmentReminderService(reminderTaskRepo, whatsappRepo, appointments);
  const pushTriggers = new PushTriggerService(bus, prisma, app.redis);

  return new OwnerActionService(appointments, appointmentService, reminders, pushTriggers, prisma, sender);
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

describe('OwnerActionService ownership refusals — real database (T-08-46, T-08-47)', () => {
  let bus: NotificationBus;
  let sender: { send: ReturnType<typeof vi.fn> };
  let service: OwnerActionService;

  beforeEach(() => {
    bus = createNotificationBus(app.redis);
    vi.spyOn(bus, 'emit').mockResolvedValue(undefined);
    sender = { send: vi.fn().mockResolvedValue(undefined) };
    service = buildService(bus, sender);
  });

  it('refuses a CANCEL for an appointment belonging to a different owner, and leaves it unchanged', async () => {
    const { clinic, user, owner, pet } = await setupClinicContext();
    const otherOwner = await createTestPetOwner(clinic.id, { name: 'Someone Else' });

    const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id);

    const result = await service.handleOwnerAction({
      clinicId: clinic.id,
      threadOwnerId: otherOwner.id, // the WRONG owner, resolved from a different thread
      action: 'CANCEL',
      appointmentId: appointment.id,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(unchanged.status).toBe('SCHEDULED');
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('refuses a CANCEL for an appointment in a different clinic, resolved through the thread clinic rather than any id in the payload', async () => {
    const { clinic, user, owner, pet } = await setupClinicContext();
    const otherClinicCtx = await setupClinicContext();

    const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id);

    // The thread resolves to a DIFFERENT clinic than the appointment's own.
    const result = await service.handleOwnerAction({
      clinicId: otherClinicCtx.clinic.id,
      threadOwnerId: owner.id,
      action: 'CANCEL',
      appointmentId: appointment.id,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(unchanged.status).toBe('SCHEDULED');
  });

  it('refuses a CANCEL for a nonexistent appointment id with the same NOT_ACTIONABLE outcome as a wrong-owner refusal (no disclosure)', async () => {
    const { clinic, owner } = await setupClinicContext();

    const result = await service.handleOwnerAction({
      clinicId: clinic.id,
      threadOwnerId: owner.id,
      action: 'CANCEL',
      appointmentId: '00000000-0000-0000-0000-00000000dead',
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });
  });

  it('a matching owner and clinic CAN cancel their own appointment (positive control for the refusal tests above)', async () => {
    const { clinic, user, owner, pet } = await setupClinicContext();
    const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id);

    const result = await service.handleOwnerAction({
      clinicId: clinic.id,
      threadOwnerId: owner.id,
      action: 'CANCEL',
      appointmentId: appointment.id,
    });

    expect(result).toEqual({ ok: true, applied: 'CANCEL' });
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.status).toBe('CANCELLED');
    expect(updated.cancelReason).toContain('WhatsApp');
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});
