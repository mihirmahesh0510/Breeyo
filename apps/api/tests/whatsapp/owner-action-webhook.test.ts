import { createHmac, randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
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

/**
 * Fix (08-11 wiring gap closure) — proves the owner KEEP/MOVE/CANCEL bridge
 * and the appointment-reminder discovery pass are actually reachable through
 * the REAL production composition (`whatsapp.routes.ts` -> `whatsapp.webhook.routes.ts`
 * -> `InboundRouterService` -> `OwnerActionService`), not just through a
 * hand-wired `InboundRouterService`/`OwnerActionService` test double.
 *
 * `apps/api/tests/scheduling/owner-action-bridge.test.ts` (plan 08-10) already
 * proves `OwnerActionService`'s own ownership-refusal logic against a real
 * database; it constructs `OwnerActionService` directly, bypassing
 * `whatsapp.routes.ts`/`whatsapp.webhook.routes.ts` entirely. This suite is
 * the missing other half: a real, signed POST to
 * `/api/v1/whatsapp/webhook` — the exact route Meta's Cloud API would call —
 * carrying an `appointment:cancel:<uuid>` button-reply payload, asserting the
 * REAL appointment row changes as a result.
 */

const APP_SECRET = 'test-whatsapp-owner-action-secret';

function sign(rawBody: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(rawBody, 'utf8').digest('hex')}`;
}

/**
 * A Meta Cloud API webhook body carrying one interactive button-reply
 * message, matching `cloud-api.webhook.ts#parseInboundMessage`'s
 * `interactive.button_reply` branch exactly.
 */
function buttonReplyWebhookBody(params: {
  from: string;
  providerMessageId: string;
  payloadId: string;
  title: string;
}): string {
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
                  id: params.providerMessageId,
                  from: params.from,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: { id: params.payloadId, title: params.title },
                  },
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

async function setupClinicOwnerAppointment() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  // A 10-digit Indian mobile, matching `toE164`'s bare-10-digit acceptance
  // form and Meta's plus-less `from` field simultaneously (via `.slice(1)`
  // below), so the owner's registered number and the webhook's `from` value
  // resolve to the exact same E.164 identity `InboundRouterService.resolveThread`
  // normalizes both through.
  const digits = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const owner = await createTestPetOwner(clinic.id, { mobile: `+91${digits}` });
  const pet = await createTestPet(clinic.id, owner.id);
  const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id);
  return { user, clinic, owner, pet, appointment, waFrom: `91${digits}` };
}

beforeAll(async () => {
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'owner-action-webhook-verify-token';
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
  delete process.env.WHATSAPP_WEBHOOK_CLINIC_ID;
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('Real inbound WhatsApp webhook -> OwnerActionService (08-11 wiring fix)', () => {
  it('a real appointment:cancel:<uuid> button-reply webhook cancels the real appointment through the actual production composition', async () => {
    const { clinic, owner, appointment, waFrom } = await setupClinicOwnerAppointment();
    process.env.WHATSAPP_WEBHOOK_CLINIC_ID = clinic.id;

    const raw = buttonReplyWebhookBody({
      from: waFrom,
      providerMessageId: `wamid.${randomUUID()}`,
      payloadId: `appointment:cancel:${appointment.id}`,
      title: 'Cancel',
    });

    const response = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw);

    expect(response.status).toBe(200);

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.status).toBe('CANCELLED');
    expect(updated.cancelReason).toContain('WhatsApp');
    expect(updated.cancelReason).toContain(owner.id);

    // The D-33 confirmation reply was actually sent through the real send
    // path (`repository.createOutboundMessage` + `touchThread` +
    // `queues.outbound`), proving `OwnerReplySender` is wired end to end too,
    // not only `OwnerActionService.handleOwnerAction`'s appointment mutation.
    const thread = await prisma.whatsAppThread.findFirst({ where: { clinicId: clinic.id, ownerId: owner.id } });
    expect(thread).not.toBeNull();
    const outbound = await prisma.whatsAppMessage.findFirst({
      where: { threadId: thread!.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbound?.body).toContain('cancelled');
  });

  it('a real appointment:keep:<uuid> button-reply webhook leaves the appointment unchanged and still closes the loop with the owner', async () => {
    const { clinic, owner, appointment, waFrom } = await setupClinicOwnerAppointment();
    process.env.WHATSAPP_WEBHOOK_CLINIC_ID = clinic.id;

    const raw = buttonReplyWebhookBody({
      from: waFrom,
      providerMessageId: `wamid.${randomUUID()}`,
      payloadId: `appointment:keep:${appointment.id}`,
      title: 'Keep',
    });

    const response = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw);

    expect(response.status).toBe(200);

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(unchanged.status).toBe('SCHEDULED');

    const thread = await prisma.whatsAppThread.findFirst({ where: { clinicId: clinic.id, ownerId: owner.id } });
    expect(thread).not.toBeNull();
    const outbound = await prisma.whatsAppMessage.findFirst({
      where: { threadId: thread!.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbound?.body).toContain("Thanks for confirming");
  });

  it(
    'a real appointment:cancel:<uuid> button-reply webhook also deletes the already-created EXPECTED queue ' +
      'entry for that appointment (D-28 fix: this file\'s AppointmentService previously had no ' +
      'onRescheduled/onCancelled hooks, so an owner CANCEL via WhatsApp never ran the queue module\'s ' +
      'removeExpectedEntryForAppointment, leaving a stale card on the board until the grace-window sweep ' +
      'eventually flipped it to NO_SHOW)',
    async () => {
      const { clinic, owner, pet, appointment, waFrom } = await setupClinicOwnerAppointment();
      process.env.WHATSAPP_WEBHOOK_CLINIC_ID = clinic.id;

      // Simulates the 08-09 sweep having already created this appointment's
      // EXPECTED queue card ahead of the owner's WhatsApp reply, exactly the
      // scenario the disclosed gap describes.
      const expectedEntry = await prisma.queueEntry.create({
        data: {
          clinicId: clinic.id,
          petId: pet.id,
          checkedInBy: owner.id,
          status: 'EXPECTED',
          position: 0,
          queuePriorityAt: appointment.scheduledFor,
          appointmentId: appointment.id,
        },
      });

      const raw = buttonReplyWebhookBody({
        from: waFrom,
        providerMessageId: `wamid.${randomUUID()}`,
        payloadId: `appointment:cancel:${appointment.id}`,
        title: 'Cancel',
      });

      const response = await request(app.server)
        .post('/api/v1/whatsapp/webhook')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', sign(raw))
        .send(raw);

      expect(response.status).toBe(200);

      const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(updated.status).toBe('CANCELLED');

      // The D-28 assertion: the EXPECTED queue card must be gone immediately,
      // not left stranded until the grace-window sweep flips it to NO_SHOW.
      const remaining = await prisma.queueEntry.findUnique({ where: { id: expectedEntry.id } });
      expect(remaining).toBeNull();
    },
  );
});
