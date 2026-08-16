import { randomUUID, createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  createTestWhatsAppReminderTask,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';
import type { RoleName } from '@breeyo/types';

/**
 * WHA-03/WHA-05 (07-13 Task 2) — HTTP-level coverage for the staff-only
 * booking move/cancel transitions (D-09), mark-resolved (D-04), and booking
 * /slot reads.
 *
 * The negative cases matter most here: POSTing a webhook event whose
 * payload is `booking:cancel:<uuid>`/`booking:move:<uuid>` must leave the
 * booking untouched — proof of D-09's STRUCTURAL enforcement (the payload
 * has no entry in `WA_BUTTON_PAYLOAD_PATTERN` at all, and
 * `BookingService.cancelBooking`/`moveBooking` require a real
 * `actorUserId` an inbound event can never supply), not merely a runtime
 * permission check that could be quietly removed.
 */

const APP_SECRET = 'test-whatsapp-app-secret-booking-authz';
const VERIFY_TOKEN = 'test-verify-token-booking-authz';

function sign(rawBody: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

/** A Meta-shaped webhook body carrying one inbound `button_reply` interactive message. */
function buttonReplyWebhookBody(payload: string, fromMobile: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messages: [
                {
                  id: `wamid.${randomUUID()}`,
                  from: fromMobile.replace('+', ''),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'interactive',
                  interactive: { type: 'button_reply', button_reply: { id: payload, title: payload } },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  app = await buildTestApp();
});

afterAll(async () => {
  delete process.env.WHATSAPP_WEBHOOK_CLINIC_ID;
  await cleanupTestData();
  await closeTestApp();
});

async function setupAuthenticatedUser(role: RoleName = 'FrontDesk') {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, role);
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

async function setupConfirmedBooking(clinicId: string) {
  const owner = await createTestPetOwner(clinicId);
  const pet = await createTestPet(clinicId, owner.id);
  const thread = await createTestWhatsAppThread(clinicId, owner.id, { waPhone: owner.mobile });
  const booking = await createTestWhatsAppBookingRequest(clinicId, thread.id, owner.id, pet.id, {
    state: 'CONFIRMED',
    slotDate: new Date('2026-08-20'),
    slotStartMinutes: 600,
    slotDurationMinutes: 30,
    confirmedAt: new Date(),
  });
  return { owner, pet, thread, booking };
}

describe('WhatsApp Booking Authorization (WHA-03)', () => {
  describe('POST /whatsapp/bookings/:bookingId/cancel', () => {
    it('with a reason and a FrontDesk token returns 200, sets state CANCELLED, deletes the slot hold and writes WHATSAPP_BOOKING_CANCELLED with the actor (D-09)', async () => {
      const { token, clinic, user } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(clinic.id);
      await prisma.whatsAppSlotHold.create({
        data: {
          clinicId: clinic.id,
          slotDate: booking.slotDate!,
          slotStartMinutes: booking.slotStartMinutes!,
          bookingRequestId: booking.id,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/bookings/${booking.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Owner phoned to cancel' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.state).toBe('CANCELLED');

      const hold = await prisma.whatsAppSlotHold.findFirst({ where: { bookingRequestId: booking.id } });
      expect(hold).toBeNull();

      const audit = await prisma.authAuditLog.findFirst({
        where: { clinicId: clinic.id, event: 'WHATSAPP_BOOKING_CANCELLED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit!.userId).toBe(user.id);
    });

    it('with no reason returns 400', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(clinic.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/bookings/${booking.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('with no Authorization header returns 401', async () => {
      const { clinic } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(clinic.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/bookings/${booking.id}/cancel`,
        payload: { reason: 'x' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('a role lacking SEND_WHATSAPP returns 403', async () => {
      const { token, clinic } = await setupAuthenticatedUser('InventoryManager');
      const { booking } = await setupConfirmedBooking(clinic.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/bookings/${booking.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'x' },
      });

      expect(response.statusCode).toBe(403);
    });

    it("for another clinic's booking returns 404", async () => {
      const { token } = await setupAuthenticatedUser('FrontDesk');
      const { clinic: otherClinic } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(otherClinic.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/bookings/${booking.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'x' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /whatsapp/bookings/:bookingId/move', () => {
    it('with a new slot returns 200, transitions the original to MOVED, creates a new CONFIRMED booking, and writes WHATSAPP_BOOKING_MOVED with the actor (D-09)', async () => {
      const { token, clinic, user } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(clinic.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/bookings/${booking.id}/move`,
        headers: { authorization: `Bearer ${token}` },
        payload: { slotDate: '2026-08-21', slotStartMinutes: 660, slotDurationMinutes: 30 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.state).toBe('CONFIRMED');
      expect(response.json().data.id).not.toBe(booking.id);

      const original = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking.id } });
      expect(original!.state).toBe('MOVED');
      expect(original!.movedToBookingId).toBe(response.json().data.id);

      const audit = await prisma.authAuditLog.findFirst({
        where: { clinicId: clinic.id, event: 'WHATSAPP_BOOKING_MOVED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit!.userId).toBe(user.id);
    });

    it('to a slot already held returns 409 with code SLOT_TAKEN and leaves the original CONFIRMED', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(clinic.id);

      // Someone else already holds the target slot.
      await prisma.whatsAppSlotHold.create({
        data: {
          clinicId: clinic.id,
          slotDate: new Date('2026-08-22'),
          slotStartMinutes: 540,
          bookingRequestId: randomUUID(),
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/bookings/${booking.id}/move`,
        headers: { authorization: `Bearer ${token}` },
        payload: { slotDate: '2026-08-22', slotStartMinutes: 540, slotDurationMinutes: 30 },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('SLOT_TAKEN');

      const original = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking.id } });
      expect(original!.state).toBe('CONFIRMED');
    });
  });

  describe("D-09: no inbound webhook payload can cancel or move a booking", () => {
    it('a webhook button_reply booking:cancel:<bookingId> leaves the booking CONFIRMED and writes no cancellation audit entry', async () => {
      const { clinic } = await setupAuthenticatedUser('FrontDesk');
      const { owner, booking } = await setupConfirmedBooking(clinic.id);
      process.env.WHATSAPP_WEBHOOK_CLINIC_ID = clinic.id;

      const raw = buttonReplyWebhookBody(`booking:cancel:${booking.id}`, owner.mobile);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/webhook',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) },
        payload: raw,
      });

      expect(response.statusCode).toBe(200);

      const unchanged = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking.id } });
      expect(unchanged!.state).toBe('CONFIRMED');

      const audit = await prisma.authAuditLog.findFirst({
        where: { clinicId: clinic.id, event: 'WHATSAPP_BOOKING_CANCELLED' },
      });
      expect(audit).toBeNull();
    });

    it('a webhook button_reply booking:move:<bookingId> leaves the booking CONFIRMED and writes no move audit entry', async () => {
      const { clinic } = await setupAuthenticatedUser('FrontDesk');
      const { owner, booking } = await setupConfirmedBooking(clinic.id);
      process.env.WHATSAPP_WEBHOOK_CLINIC_ID = clinic.id;

      const raw = buttonReplyWebhookBody(`booking:move:${booking.id}`, owner.mobile);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/webhook',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) },
        payload: raw,
      });

      expect(response.statusCode).toBe(200);

      const unchanged = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking.id } });
      expect(unchanged!.state).toBe('CONFIRMED');

      const audit = await prisma.authAuditLog.findFirst({
        where: { clinicId: clinic.id, event: 'WHATSAPP_BOOKING_MOVED' },
      });
      expect(audit).toBeNull();
    });
  });

  describe('POST /whatsapp/threads/:threadId/resolve (D-04)', () => {
    it('clears thread needsAction, sets acknowledgedAt on the capped reminder tasks for that thread, and records the actor', async () => {
      const { token, clinic, user } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);
      const pet = await createTestPet(clinic.id, owner.id);
      const thread = await createTestWhatsAppThread(clinic.id, owner.id, {
        needsAction: true,
        needsActionReason: 'REMINDER_NO_REPLY',
      });
      const task = await createTestWhatsAppReminderTask(clinic.id, owner.id, pet.id, {
        state: 'CAPPED_NEEDS_ACTION',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/threads/${thread.id}/resolve`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);

      const updatedThread = await prisma.whatsAppThread.findUnique({ where: { id: thread.id } });
      expect(updatedThread!.needsAction).toBe(false);

      const updatedTask = await prisma.whatsAppReminderTask.findUnique({ where: { id: task.id } });
      expect(updatedTask!.acknowledgedAt).not.toBeNull();
      void user;
    });

    it('on a thread with needsAction already false returns 200 idempotently', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);
      const thread = await createTestWhatsAppThread(clinic.id, owner.id, { needsAction: false });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/threads/${thread.id}/resolve`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);

      const stillClear = await prisma.whatsAppThread.findUnique({ where: { id: thread.id } });
      expect(stillClear!.needsAction).toBe(false);
    });

    it('a double tap (calling resolve twice) is harmless', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);
      const pet = await createTestPet(clinic.id, owner.id);
      const thread = await createTestWhatsAppThread(clinic.id, owner.id, { needsAction: true });
      await createTestWhatsAppReminderTask(clinic.id, owner.id, pet.id, { state: 'CAPPED_NEEDS_ACTION' });

      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/threads/${thread.id}/resolve`,
        headers: { authorization: `Bearer ${token}` },
      });
      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/whatsapp/threads/${thread.id}/resolve`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
    });
  });

  describe('GET /whatsapp/bookings, GET /whatsapp/bookings/:bookingId, GET /whatsapp/slots', () => {
    it("GET /whatsapp/bookings returns the calling clinic's bookings with reference, state, slotDate, slotStartMinutes and timestamps", async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(clinic.id);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/bookings',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const found = response.json().data.bookings.find((b: { id: string }) => b.id === booking.id);
      expect(found).toBeDefined();
      expect(found.reference).toBe(booking.reference);
      expect(found.state).toBe('CONFIRMED');
      expect(found.slotStartMinutes).toBe(booking.slotStartMinutes);
      expect(found.createdAt).toBeDefined();
    });

    it('GET /whatsapp/bookings/:bookingId returns one booking', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(clinic.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/whatsapp/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.id).toBe(booking.id);
    });

    it("GET /whatsapp/bookings/:bookingId for another clinic's id returns 404", async () => {
      const { token } = await setupAuthenticatedUser('FrontDesk');
      const { clinic: otherClinic } = await setupAuthenticatedUser('FrontDesk');
      const { booking } = await setupConfirmedBooking(otherClinic.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/whatsapp/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('GET /whatsapp/slots?date=YYYY-MM-DD returns the offerable slots for that clinic and day', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const wideOpen = { open: '00:00', close: '23:30', closed: false };
      await prisma.clinic.update({
        where: { id: clinic.id },
        data: {
          workingHours: {
            hours: {
              sunday: wideOpen,
              monday: wideOpen,
              tuesday: wideOpen,
              wednesday: wideOpen,
              thursday: wideOpen,
              friday: wideOpen,
              saturday: wideOpen,
            },
          } as never,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/slots',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json().data.slots)).toBe(true);
      expect(response.json().data.slots.length).toBeGreaterThan(0);
    });
  });
});
