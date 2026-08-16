import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestWhatsAppThread,
  createTestWhatsAppMessage,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';
import type { RoleName } from '@breeyo/types';

let app: FastifyInstance;

const VERIFY_TOKEN = 'test-verify-token-authz';

beforeAll(async () => {
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

/**
 * Creates a test user, clinic, and clinic member with the given role, then
 * generates auth tokens. Every test creates its own clinic (see
 * `inbox.test.ts`'s identical rationale) so no `beforeEach` cleanup is
 * needed for isolation.
 */
async function setupAuthenticatedUser(role: RoleName = 'Admin') {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, role);
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

function sendBody(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: '99999999-9999-9999-9999-999999999999',
    waPhone: '+919876543210',
    templateKey: 'follow_up_reminder',
    variables: { owner_name: 'Asha Rao', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
    contextType: 'REMINDER',
    ...overrides,
  };
}

describe('WhatsApp Authorization (WHA-05)', () => {
  it("requirePermission('SEND_WHATSAPP') returns 403 for a role lacking it (WHA-05, D-20)", async () => {
    // apps/api/prisma/seed.ts: InventoryManager's DEFAULT_ROLE_PERMISSIONS
    // list has no SEND_WHATSAPP entry (unlike Admin, Clinician, FrontDesk) —
    // seeded permissions are not modified to make this pass (D-20).
    const { clinic, token } = await setupAuthenticatedUser('InventoryManager');
    const owner = await createTestPetOwner(clinic.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: sendBody({ ownerId: owner.id, waPhone: owner.mobile }),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('a FrontDesk token succeeds (SEND_WHATSAPP is seeded for FrontDesk) — D-20', async () => {
    const { clinic, token } = await setupAuthenticatedUser('FrontDesk');
    const owner = await createTestPetOwner(clinic.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: sendBody({ ownerId: owner.id, waPhone: owner.mobile }),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data.messageId).toBeDefined();
  });

  it('a Clinician token succeeds (D-20 keeps the send action broad)', async () => {
    const { clinic, token } = await setupAuthenticatedUser('Clinician');
    const owner = await createTestPetOwner(clinic.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: sendBody({ ownerId: owner.id, waPhone: owner.mobile }),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data.messageId).toBeDefined();
  });

  it('no Authorization header returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      payload: sendBody(),
    });

    expect(response.statusCode).toBe(401);
  });

  it('ignores a clinicId supplied in the request body and uses request.user.activeClinicId (T-07-12-01)', async () => {
    const { clinic, token } = await setupAuthenticatedUser('Admin');
    const { clinic: otherClinic } = await setupAuthenticatedUser('Admin');
    const owner = await createTestPetOwner(clinic.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: sendBody({ ownerId: owner.id, waPhone: owner.mobile, clinicId: otherClinic.id }),
    });

    expect(response.statusCode).toBe(202);
    const { messageId } = response.json().data;

    // The row landed under the CALLER's clinic (from the JWT), never the
    // clinicId the request body tried to smuggle in.
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/whatsapp/threads',
      headers: { authorization: `Bearer ${token}` },
    });
    const threadId = listResponse.json().data.threads[0].id;

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/whatsapp/threads/${threadId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getResponse.statusCode).toBe(200);
    const messageIds = getResponse.json().data.messages.map((m: { id: string }) => m.id);
    expect(messageIds).toContain(messageId);
  });

  it("POST /whatsapp/messages/:messageId/retry for another clinic's message returns 404", async () => {
    const { token: tokenA } = await setupAuthenticatedUser('Admin');
    const { clinic: clinicB } = await setupAuthenticatedUser('Admin');
    const ownerB = await createTestPetOwner(clinicB.id);
    const threadB = await createTestWhatsAppThread(clinicB.id, ownerB.id, { lastMessageAt: new Date() });
    const messageB = await createTestWhatsAppMessage(clinicB.id, threadB.id, { status: 'FAILED' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/whatsapp/messages/${messageB.id}/retry`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('WHATSAPP_MESSAGE_NOT_FOUND');
  });

  it('GET /whatsapp/webhook with the correct verify token returns 200 without any Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/whatsapp/webhook',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'abc123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('abc123');
  });
});
