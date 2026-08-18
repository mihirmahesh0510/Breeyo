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
import { NotificationType, NotificationModule, STARTING_SOON_LEAD_MINUTES, QUEUE_BACKLOG_THRESHOLD } from '@breeyo/types';
import { createNotificationBus, NotificationBus } from '../../src/modules/notifications/notification-bus.js';
import { PushTriggerService } from '../../src/modules/scheduling/push-trigger.service.js';
import { AppointmentRepository } from '../../src/modules/scheduling/appointment.repository.js';
import { QueueRepository } from '../../src/modules/queue/queue.repository.js';
import { QueueService } from '../../src/modules/queue/queue.service.js';

let app: FastifyInstance;

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

describe('PushTriggerService (D-26, D-27, SCH-05)', () => {
  let bus: NotificationBus;
  let emitSpy: ReturnType<typeof vi.spyOn>;
  let service: PushTriggerService;

  beforeEach(() => {
    bus = createNotificationBus(app.redis);
    emitSpy = vi.spyOn(bus, 'emit').mockResolvedValue(undefined);
    service = new PushTriggerService(bus, prisma, app.redis);
  });

  afterAll(async () => {
    await bus.close();
  });

  describe('notifyUpcomingAppointments', () => {
    it('fires exactly once per appointment and stamps the marker', async () => {
      const { clinic, owner, pet, user } = await setupClinicContext();
      const appointmentRepository = new AppointmentRepository(prisma);
      const scheduledFor = new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000 - 60000);
      const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });

      const from = new Date();
      const to = new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000);
      const due = await appointmentRepository.findStartingSoon(from, to, 200);
      expect(due.map((a) => a.id)).toContain(appointment.id);

      const markNotified = vi.fn((id: string) => appointmentRepository.markStartingSoonNotified(clinic.id, id, new Date()));
      await service.notifyUpcomingAppointments(from, to, due, markNotified);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0][0];
      expect(event.type).toBe(NotificationType.APPOINTMENT_REMINDER);
      expect(event.module).toBe(NotificationModule.SCHEDULING);
      expect(event.sendPush).toBe(true);
      expect(markNotified).toHaveBeenCalledWith(appointment.id);

      const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(updated!.startingSoonNotifiedAt).not.toBeNull();
    });

    it('does not re-fire once the marker is already set', async () => {
      const { clinic, owner, pet, user } = await setupClinicContext();
      const appointmentRepository = new AppointmentRepository(prisma);
      const scheduledFor = new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000 - 60000);
      await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
        scheduledFor,
      });
      // Simulate an already-notified appointment directly via the marker column.
      await prisma.appointment.updateMany({
        where: { clinicId: clinic.id },
        data: { startingSoonNotifiedAt: new Date() },
      });

      const from = new Date();
      const to = new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000);
      const due = await appointmentRepository.findStartingSoon(from, to, 200);
      expect(due).toHaveLength(0);

      const markNotified = vi.fn();
      await service.notifyUpcomingAppointments(from, to, due, markNotified);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('recipients are the clinic staff, never the pet owner', async () => {
      const { clinic, owner, pet, user } = await setupClinicContext();
      const secondStaff = await createTestUser();
      await createTestClinicMember(secondStaff.id, clinic.id);

      const scheduledFor = new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000 - 60000);
      const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });
      const appointmentRepository = new AppointmentRepository(prisma);
      const due = await appointmentRepository.findStartingSoon(new Date(), new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000), 200);

      await service.notifyUpcomingAppointments(new Date(), new Date(), due, vi.fn());

      const event = emitSpy.mock.calls[0][0];
      expect(event.recipientUserIds.sort()).toEqual([user.id, secondStaff.id].sort());
      expect(event.recipientUserIds).not.toContain(owner.id);
      void appointment;
    });

    it('copy matches the D-27 contract: exact title, interpolated body, length limits, and deep link', async () => {
      const { clinic, owner, pet, user } = await setupClinicContext();
      const scheduledFor = new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000 - 60000);
      const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, { scheduledFor });
      const appointmentRepository = new AppointmentRepository(prisma);
      const due = await appointmentRepository.findStartingSoon(new Date(), new Date(Date.now() + STARTING_SOON_LEAD_MINUTES * 60000), 200);

      await service.notifyUpcomingAppointments(new Date(), new Date(), due, vi.fn());

      const event = emitSpy.mock.calls[0][0];
      expect(event.title).toBe(`Appointment in ${STARTING_SOON_LEAD_MINUTES} min`);
      expect(event.title.length).toBeLessThanOrEqual(40);
      expect(event.body.length).toBeLessThanOrEqual(120);
      expect(event.body).toContain(due[0].pets[0].pet.name);
      expect(event.body).toContain(owner.name);
      expect(event.body).toContain(due[0].vet.name);
      expect(event.data?.deepLink).toMatch(/^\/schedule\?date=.+&appointmentId=/);
      expect(event.data?.appointmentId ?? event.data?.deepLink).toBeTruthy();
      void appointment;
    });
  });

  describe('notifyQueueBacklog', () => {
    it('fires when the threshold is crossed', async () => {
      const { clinic } = await setupClinicContext();
      await service.notifyQueueBacklog(clinic.id, QUEUE_BACKLOG_THRESHOLD, 12);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0][0];
      expect(event.type).toBe(NotificationType.QUEUE_CHANGE);
      expect(event.data?.deepLink).toBe('/queue');
    });

    it('does not fire below the threshold', async () => {
      const { clinic } = await setupClinicContext();
      await service.notifyQueueBacklog(clinic.id, QUEUE_BACKLOG_THRESHOLD - 1, 12);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('does not re-fire inside the debounce window', async () => {
      const { clinic } = await setupClinicContext();
      await service.notifyQueueBacklog(clinic.id, QUEUE_BACKLOG_THRESHOLD, 12);
      await service.notifyQueueBacklog(clinic.id, QUEUE_BACKLOG_THRESHOLD + 2, 20);

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('fires again once the debounce key is gone (simulating TTL expiry)', async () => {
      const { clinic } = await setupClinicContext();
      await service.notifyQueueBacklog(clinic.id, QUEUE_BACKLOG_THRESHOLD, 12);
      expect(emitSpy).toHaveBeenCalledTimes(1);

      const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      await app.redis.del(`scheduling:backlog-alert:${clinic.id}:${todayIST}`);

      await service.notifyQueueBacklog(clinic.id, QUEUE_BACKLOG_THRESHOLD, 12);
      expect(emitSpy).toHaveBeenCalledTimes(2);
    });

    it('debounce key is scoped per clinic AND per IST day -- two clinics each get their own alert', async () => {
      const ctx1 = await setupClinicContext();
      const ctx2 = await setupClinicContext();

      await service.notifyQueueBacklog(ctx1.clinic.id, QUEUE_BACKLOG_THRESHOLD, 10);
      await service.notifyQueueBacklog(ctx2.clinic.id, QUEUE_BACKLOG_THRESHOLD, 10);

      expect(emitSpy).toHaveBeenCalledTimes(2);

      const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const key1 = `scheduling:backlog-alert:${ctx1.clinic.id}:${todayIST}`;
      const key2 = `scheduling:backlog-alert:${ctx2.clinic.id}:${todayIST}`;
      expect(await app.redis.get(key1)).toBe('1');
      expect(await app.redis.get(key2)).toBe('1');
    });
  });

  describe('notifyOwnerAction', () => {
    it('emits MOVE_REQUEST for a MOVE reply with data.appointmentId', async () => {
      const { clinic, owner, pet, user } = await setupClinicContext();
      const appointmentRepository = new AppointmentRepository(prisma);
      const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id);
      const detail = await appointmentRepository.findById(clinic.id, appointment.id);

      await service.notifyOwnerAction(clinic.id, detail!, 'MOVE');

      const event = emitSpy.mock.calls[0][0];
      expect(event.type).toBe(NotificationType.MOVE_REQUEST);
      expect(event.data?.appointmentId).toBe(appointment.id);
      expect(event.data?.deepLink).toBe('/schedule/move-requests');
    });

    it('emits a cancellation notice for a CANCEL reply with data.appointmentId', async () => {
      const { clinic, owner, pet, user } = await setupClinicContext();
      const appointmentRepository = new AppointmentRepository(prisma);
      const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id);
      const detail = await appointmentRepository.findById(clinic.id, appointment.id);

      await service.notifyOwnerAction(clinic.id, detail!, 'CANCEL');

      const event = emitSpy.mock.calls[0][0];
      expect(event.data?.appointmentId).toBe(appointment.id);
      expect(event.data?.deepLink).toMatch(/^\/schedule\?date=/);
      expect(event.title.toLowerCase()).toContain('cancel');
    });
  });
});

describe('QueueService backlog trigger wiring (checkIn never fails on a notification error)', () => {
  it('a rejected notification does not fail check-in', async () => {
    const { clinic, pet, user } = await setupClinicContext();
    const bus = createNotificationBus(app.redis);
    vi.spyOn(bus, 'emit').mockRejectedValue(new Error('redis is down'));
    const pushTriggers = new PushTriggerService(bus, prisma, app.redis);
    const queueRepository = new QueueRepository(prisma);
    const service = new QueueService(queueRepository, null, pushTriggers);

    // Push waiting count above the backlog threshold first so the check-in
    // below is the one that crosses it and triggers the (failing) push.
    for (let i = 0; i < QUEUE_BACKLOG_THRESHOLD; i += 1) {
      const otherPet = await createTestPet(clinic.id, (await createTestPetOwner(clinic.id)).id);
      await service.checkIn({ clinicId: clinic.id, userId: user.id, petId: otherPet.id, isEmergency: false });
    }

    await expect(
      service.checkIn({ clinicId: clinic.id, userId: user.id, petId: pet.id, isEmergency: false }),
    ).resolves.toBeDefined();

    await bus.close();
  });
});
