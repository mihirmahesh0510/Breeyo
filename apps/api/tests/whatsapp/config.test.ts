import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';
import type { RoleName } from '@breeyo/types';

/**
 * WHA-02/WHA-05 (07-13 Task 1) — HTTP-level coverage for:
 *   - GET/PATCH /whatsapp/config (Admin-only simulator config, D-14/D-16/D-20)
 *   - PATCH /whatsapp/owners/:ownerId/preference (opt-out + invalid-number
 *     marking, D-10/D-11)
 *
 * D-24 (locked AFTER 07-13-PLAN.md was written): WhatsApp consent capture is
 * out of scope for Phase 7's UI. No `POST .../consent` endpoint exists and
 * none is tested here — `consent.test.ts` already pins the underlying
 * `WhatsAppService.grantConsent`/`withdrawConsent` SERVICE methods (07-08),
 * which are untouched.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

async function setupAuthenticatedUser(role: RoleName = 'Admin') {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, role);
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

describe('WhatsApp Clinic Config (WHA-05, D-14/D-16/D-20)', () => {
  describe('GET /whatsapp/config', () => {
    it('creates a default config on first read: SIMULATOR/NORMAL/autoReply on/10s/allowFreeform off/30min/2 attempts/3 days', async () => {
      const { token } = await setupAuthenticatedUser('Admin');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const config = response.json().data;
      expect(config.provider).toBe('SIMULATOR');
      expect(config.deliveryMode).toBe('NORMAL');
      expect(config.autoReplyEnabled).toBe(true);
      expect(config.autoReplyDelaySeconds).toBe(10);
      expect(config.allowFreeformOutsideWindow).toBe(false);
      expect(config.slotDurationMinutes).toBe(30);
      expect(config.escalationMaxAttempts).toBe(2);
      expect(config.escalationIntervalDays).toBe(3);
    });

    it('a FrontDesk token returns 403 (Admin-only, D-20)', async () => {
      const { token } = await setupAuthenticatedUser('FrontDesk');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /whatsapp/config', () => {
    it('with autoReplyDelaySeconds 45 returns 200 with the updated config', async () => {
      const { token } = await setupAuthenticatedUser('Admin');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${token}` },
        payload: { autoReplyDelaySeconds: 45 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.autoReplyDelaySeconds).toBe(45);
    });

    it('with autoReplyDelaySeconds 600 is rejected with 400 (bounded 3-60, D-14)', async () => {
      const { token } = await setupAuthenticatedUser('Admin');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${token}` },
        payload: { autoReplyDelaySeconds: 600 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('with deliveryMode INVALID_NUMBER succeeds and applies clinic-wide (D-16), never per-thread', async () => {
      const { token } = await setupAuthenticatedUser('Admin');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${token}` },
        payload: { deliveryMode: 'INVALID_NUMBER' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.deliveryMode).toBe('INVALID_NUMBER');
    });

    it('with allowFreeformOutsideWindow true succeeds, but a DIFFERENT clinic that never patched still defaults to false (explicit opt-in only)', async () => {
      const { token } = await setupAuthenticatedUser('Admin');
      const { token: otherToken } = await setupAuthenticatedUser('Admin');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${token}` },
        payload: { allowFreeformOutsideWindow: true },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.allowFreeformOutsideWindow).toBe(true);

      const otherGet = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(otherGet.json().data.allowFreeformOutsideWindow).toBe(false);
    });

    it("never writes another clinic's config — the route takes no clinic id in the path, only the JWT's", async () => {
      const { token: tokenA } = await setupAuthenticatedUser('Admin');
      const { token: tokenB } = await setupAuthenticatedUser('Admin');

      await app.inject({
        method: 'PATCH',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { autoReplyDelaySeconds: 50 },
      });

      const getB = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(getB.json().data.autoReplyDelaySeconds).toBe(10); // clinic B's own default, untouched
    });

    it('a FrontDesk token returns 403 (MANAGE_CLINIC_SETTINGS is Admin-only, D-20)', async () => {
      const { token } = await setupAuthenticatedUser('FrontDesk');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/whatsapp/config',
        headers: { authorization: `Bearer ${token}` },
        payload: { autoReplyDelaySeconds: 20 },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /whatsapp/owners/:ownerId/preference (D-10/D-11)', () => {
    it('opts an owner out, sets optedOutAt, and writes a WHATSAPP_OPT_OUT audit entry', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/whatsapp/owners/${owner.id}/preference`,
        headers: { authorization: `Bearer ${token}` },
        payload: { remindersOptedOut: true, source: 'STAFF' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.optedOutAt).not.toBeNull();
      expect(response.json().data.remindersOptedOut).toBe(true);

      const audit = await prisma.authAuditLog.findFirst({
        where: { clinicId: clinic.id, event: 'WHATSAPP_OPT_OUT' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
    });

    it('after opt-out, POST /whatsapp/send with a reminder-category template returns 403 OWNER_OPTED_OUT for any of that owner\'s pets', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/whatsapp/owners/${owner.id}/preference`,
        headers: { authorization: `Bearer ${token}` },
        payload: { remindersOptedOut: true, source: 'STAFF' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/send',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          ownerId: owner.id,
          waPhone: owner.mobile,
          templateKey: 'follow_up_reminder',
          variables: { owner_name: owner.name, pet_name: 'Rocky', follow_up_date: '20 Aug 2026' },
          contextType: 'REMINDER',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('OWNER_OPTED_OUT');
    });

    it('after opt-out, POST /whatsapp/send with invoice_delivery for the same owner still returns 202 (transactional, D-10)', async () => {
      const { token, clinic } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/whatsapp/owners/${owner.id}/preference`,
        headers: { authorization: `Bearer ${token}` },
        payload: { remindersOptedOut: true, source: 'STAFF' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/send',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          ownerId: owner.id,
          waPhone: owner.mobile,
          templateKey: 'invoice_delivery',
          variables: {
            owner_name: owner.name,
            pet_name: 'Rocky',
            invoice_number: 'INV-9',
            amount: '250.00',
            payment_link: 'https://pay.example.com/y',
          },
          contextType: 'INVOICE',
        },
      });

      expect(response.statusCode).toBe(202);
    });

    it('with numberStatus INVALID writes a WHATSAPP_NUMBER_MARKED_INVALID audit entry and records the actor', async () => {
      const { token, user, clinic } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/whatsapp/owners/${owner.id}/preference`,
        headers: { authorization: `Bearer ${token}` },
        payload: { remindersOptedOut: false, source: 'STAFF', numberStatus: 'INVALID' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.numberStatus).toBe('INVALID');

      const audit = await prisma.authAuditLog.findFirst({
        where: { clinicId: clinic.id, event: 'WHATSAPP_NUMBER_MARKED_INVALID' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit!.userId).toBe(user.id);
    });

    it("for an owner in another clinic returns 404", async () => {
      const { token } = await setupAuthenticatedUser('FrontDesk');
      const { clinic: otherClinic } = await setupAuthenticatedUser('FrontDesk');
      const otherOwner = await createTestPetOwner(otherClinic.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/whatsapp/owners/${otherOwner.id}/preference`,
        headers: { authorization: `Bearer ${token}` },
        payload: { remindersOptedOut: true, source: 'STAFF' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('a role lacking SEND_WHATSAPP returns 403', async () => {
      const { token, clinic } = await setupAuthenticatedUser('InventoryManager');
      const owner = await createTestPetOwner(clinic.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/whatsapp/owners/${owner.id}/preference`,
        headers: { authorization: `Bearer ${token}` },
        payload: { remindersOptedOut: true, source: 'STAFF' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('no Authorization header returns 401', async () => {
      const { clinic } = await setupAuthenticatedUser('FrontDesk');
      const owner = await createTestPetOwner(clinic.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/whatsapp/owners/${owner.id}/preference`,
        payload: { remindersOptedOut: true, source: 'STAFF' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
