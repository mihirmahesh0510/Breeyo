import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestWhatsAppThread,
  createTestWhatsAppMessage,
  prisma,
} from '../helpers/factories.js';

/**
 * WHA-04/WHA-05 — the Cloud API webhook endpoint (07-09 Task 3).
 *
 * `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` are set directly
 * on `process.env` for this suite, matching `tests/billing/webhook.test.ts`'s
 * `WEBHOOK_SECRET` convention — the route reads both lazily per-request, so
 * setting them here (rather than requiring them in `.env`) is sufficient.
 */

const APP_SECRET = 'test-whatsapp-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function sign(rawBody: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

function statusWebhookBody(providerMessageId: string, status: string, timestampSeconds: number) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              statuses: [
                {
                  id: providerMessageId,
                  status,
                  recipient_id: '919876543210',
                  timestamp: String(timestampSeconds),
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
  await cleanupTestData();
  await closeTestApp();
});

async function setupQueuedThread() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  const thread = await createTestWhatsAppThread(clinic.id, randomUUID());
  return { clinic, thread };
}

describe('WhatsApp Webhook (WHA-04/05, Pitfall 10/14)', () => {
  it('GET with correct hub.mode and hub.verify_token returns 200 with the challenge as the body', async () => {
    const response = await request(app.server)
      .get('/api/v1/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '12345' });

    expect(response.status).toBe(200);
    expect(response.text).toBe('12345');
  });

  it('GET with a wrong verify token returns 403', async () => {
    const response = await request(app.server)
      .get('/api/v1/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': '12345' });

    expect(response.status).toBe(403);
  });

  it('POST with a valid X-Hub-Signature-256 returns 200', async () => {
    const { thread } = await setupQueuedThread();
    const providerMessageId = `wamid.${randomUUID()}`;
    await createTestWhatsAppMessage(thread.clinicId, thread.id, {
      providerMessageId,
      status: 'SENT',
    });

    const raw = statusWebhookBody(providerMessageId, 'delivered', Math.floor(Date.now() / 1000));

    const response = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw);

    expect(response.status).toBe(200);
  });

  it('POST with a tampered body returns 401 and performs no database write', async () => {
    const { thread } = await setupQueuedThread();
    const providerMessageId = `wamid.${randomUUID()}`;
    await createTestWhatsAppMessage(thread.clinicId, thread.id, {
      providerMessageId,
      status: 'SENT',
    });

    const raw = statusWebhookBody(providerMessageId, 'delivered', Math.floor(Date.now() / 1000));
    const validSignature = sign(raw);
    const tamperedRaw = raw.replace('"delivered"', '"read"');

    const response = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', validSignature)
      .send(tamperedRaw);

    expect(response.status).toBe(401);

    const message = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId } });
    expect(message?.status).toBe('SENT'); // unchanged
  });

  it('POST with no signature header returns 401', async () => {
    const raw = statusWebhookBody(`wamid.${randomUUID()}`, 'delivered', Math.floor(Date.now() / 1000));

    const response = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      .set('content-type', 'application/json')
      .send(raw);

    expect(response.status).toBe(401);
  });

  it('POST requires no JWT (no Authorization header) and is not rejected by the authenticate middleware', async () => {
    const { thread } = await setupQueuedThread();
    const providerMessageId = `wamid.${randomUUID()}`;
    await createTestWhatsAppMessage(thread.clinicId, thread.id, {
      providerMessageId,
      status: 'SENT',
    });

    const raw = statusWebhookBody(providerMessageId, 'delivered', Math.floor(Date.now() / 1000));

    const response = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      // Deliberately no Authorization header.
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw);

    expect(response.status).toBe(200);
  });

  it('POSTing the same valid status webhook twice results in exactly one status ledger row for that transition and no duplicate inbound message (Pitfall 14)', async () => {
    const { thread } = await setupQueuedThread();
    const providerMessageId = `wamid.${randomUUID()}`;
    const message = await createTestWhatsAppMessage(thread.clinicId, thread.id, {
      providerMessageId,
      status: 'SENT',
    });

    const raw = statusWebhookBody(providerMessageId, 'delivered', Math.floor(Date.now() / 1000));
    const signature = sign(raw);

    const first = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(raw);
    expect(first.status).toBe(200);

    const second = await request(app.server)
      .post('/api/v1/whatsapp/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(raw);
    expect(second.status).toBe(200);

    const events = await prisma.whatsAppMessageStatusEvent.findMany({
      where: { messageId: message.id, status: 'DELIVERED' },
    });
    expect(events).toHaveLength(1);

    const finalMessage = await prisma.whatsAppMessage.findUnique({ where: { id: message.id } });
    expect(finalMessage?.status).toBe('DELIVERED');

    // No inbound message was ever created by a STATUS-only webhook.
    const inboundCount = await prisma.whatsAppMessage.count({
      where: { threadId: thread.id, direction: 'INBOUND' },
    });
    expect(inboundCount).toBe(0);
  });
});
