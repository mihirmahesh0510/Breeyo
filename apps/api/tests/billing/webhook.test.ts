import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  prisma,
} from '../helpers/factories.js';
import { signWebhookPayload } from '../helpers/razorpay-mock.js';
import { encryptSecret } from '../../src/lib/crypto.js';

/**
 * BIL-06 — the Razorpay webhook endpoint.
 *
 * ## What is real here
 *
 * Everything except Razorpay itself. The clinic row holds a genuine
 * AES-256-GCM envelope, the route genuinely decrypts it and recomputes the
 * HMAC over the exact bytes supertest put on the wire, and the dedupe is the
 * real UNIQUE index on `webhook_events.event_id`.
 *
 * The signatures are produced by `signWebhookPayload`, which reproduces
 * Razorpay's header construction (hex HMAC-SHA256 over the RAW body). A test
 * that could only produce an INVALID signature would exercise the rejection
 * path alone — the half that never moves money.
 *
 * ## Why every body is sent as a pre-serialised string
 *
 * `JSON.stringify(JSON.parse(body))` is not guaranteed to reproduce the input
 * byte for byte. Signing a string and then letting supertest re-serialise an
 * object would produce a signature over bytes that never reached the server,
 * and the suite would fail for a reason that has nothing to do with the code
 * under test. So each test builds the raw string once, signs THAT, and sends
 * THAT.
 */

const WEBHOOK_SECRET = 'test_webhook_secret';

let app: FastifyInstance;
let clinicId: string;
let webhookToken: string;
let token: string;

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
  if (keys.length > 0) await app.redis.del(...keys);

  const frontDesk = await createTestUser({ fullName: 'Front Desk' });

  webhookToken = randomUUID().replace(/-/g, '');
  const clinic = await createTestClinic(frontDesk.id, {
    name: 'Webhook Clinic',
    razorpayKeyId: 'rzp_test_webhook0001',
    razorpayKeySecretEnc: encryptSecret('key_secret_value'),
    razorpayWebhookSecretEnc: encryptSecret(WEBHOOK_SECRET),
    razorpayWebhookToken: webhookToken,
  });
  clinicId = clinic.id;

  await createTestClinicMember(frontDesk.id, clinic.id, 'FrontDesk');
  token = (await createTestTokens(app, frontDesk.id, clinic.id)).accessToken;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

interface PostOptions {
  secret?: string;
  eventId?: string;
  pathToken?: string;
  omitSignature?: boolean;
  omitEventId?: boolean;
}

function postWebhook(body: unknown, options: PostOptions = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const req = request(app.server)
    .post(`/api/v1/webhooks/razorpay/${options.pathToken ?? webhookToken}`)
    .set('content-type', 'application/json');

  if (!options.omitSignature) {
    req.set('x-razorpay-signature', signWebhookPayload(raw, options.secret ?? WEBHOOK_SECRET));
  }
  if (!options.omitEventId) {
    req.set('x-razorpay-event-id', options.eventId ?? `evt_${randomUUID()}`);
  }

  return req.send(raw);
}

/** A minimal, structurally valid event body. Task-1 tests never apply it. */
function anyEvent(overrides: Record<string, unknown> = {}) {
  return { entity: 'event', event: 'payment_link.paid', payload: {}, ...overrides };
}

// ─── Signature and routing (T-06-56, T-06-60, T-06-61) ──────────────────────

describe('POST /api/v1/webhooks/razorpay/:webhookToken — verification', () => {
  it('accepts a validly signed event, records it once and answers 200', async () => {
    const response = await postWebhook(anyEvent());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });

    const events = await prisma.webhookEvent.findMany({ where: { clinicId } });
    expect(events).toHaveLength(1);
    expect(events[0].signatureVerified).toBe(true);
    expect(events[0].eventType).toBe('payment_link.paid');
    expect(events[0].processedAt).toBeNull();
  });

  it('rejects an invalid signature with 400, records nothing and reveals no reason', async () => {
    const response = await postWebhook(anyEvent(), { secret: 'the_wrong_secret' });

    expect(response.status).toBe(400);
    // No body detail: an unknown token, a missing secret and a bad signature
    // must be indistinguishable to the caller (T-06-61).
    expect(response.text === '' || response.text === '{}').toBe(true);

    const events = await prisma.webhookEvent.findMany({ where: { clinicId } });
    expect(events).toHaveLength(0);

    const audit = await prisma.billingAuditLog.findMany({
      where: { clinicId, event: 'WEBHOOK_SIGNATURE_REJECTED' },
    });
    expect(audit).toHaveLength(1);
  });

  it('rejects a signature computed over a different body', async () => {
    const signedBody = JSON.stringify(anyEvent());
    const sentBody = JSON.stringify(anyEvent({ tampered: true }));

    const response = await request(app.server)
      .post(`/api/v1/webhooks/razorpay/${webhookToken}`)
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', signWebhookPayload(signedBody, WEBHOOK_SECRET))
      .set('x-razorpay-event-id', `evt_${randomUUID()}`)
      .send(sentBody);

    expect(response.status).toBe(400);
    expect(await prisma.webhookEvent.count({ where: { clinicId } })).toBe(0);
  });

  it('returns 400 without touching the database when a required header is missing', async () => {
    const noSignature = await postWebhook(anyEvent(), { omitSignature: true });
    expect(noSignature.status).toBe(400);

    const noEventId = await postWebhook(anyEvent(), { omitEventId: true });
    expect(noEventId.status).toBe(400);

    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(
      await prisma.billingAuditLog.count({ where: { event: 'WEBHOOK_SIGNATURE_REJECTED' } }),
    ).toBe(0);
  });

  it('returns 404 for an unknown webhook token', async () => {
    const response = await postWebhook(anyEvent(), {
      pathToken: randomUUID().replace(/-/g, ''),
    });

    expect(response.status).toBe(404);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it('returns 404, not 500, when the clinic has no webhook secret configured', async () => {
    await prisma.clinic.update({
      where: { id: clinicId },
      data: { razorpayWebhookSecretEnc: null },
    });

    const response = await postWebhook(anyEvent());

    expect(response.status).toBe(404);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });
});

// ─── Idempotency (T-06-57) ──────────────────────────────────────────────────

describe('POST /api/v1/webhooks/razorpay/:webhookToken — delivery guarantees', () => {
  it('is idempotent: the same x-razorpay-event-id delivered twice inserts one row', async () => {
    const eventId = `evt_${randomUUID()}`;
    const body = anyEvent();

    const first = await postWebhook(body, { eventId });
    const second = await postWebhook(body, { eventId });

    // Both 200: a duplicate is a documented, expected delivery, not an error.
    // Answering non-2xx would make Razorpay retry it forever.
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const events = await prisma.webhookEvent.findMany({ where: { clinicId } });
    expect(events).toHaveLength(1);
  });

  it('keeps the raw payload verbatim so the HMAC stays re-verifiable', async () => {
    const raw = JSON.stringify(anyEvent({ note: 'exact bytes' }));

    await postWebhook(raw);

    const stored = await prisma.webhookEvent.findFirstOrThrow({ where: { clinicId } });
    expect(stored.rawPayload).toBe(raw);
    expect(signWebhookPayload(stored.rawPayload, WEBHOOK_SECRET)).toHaveLength(64);
  });
});

// ─── Encapsulation and latency (T-06-58, T-06-59, T-06-60) ──────────────────

describe('POST /api/v1/webhooks/razorpay/:webhookToken — isolation and budget', () => {
  it('does not affect JSON parsing on any other route', async () => {
    await postWebhook(anyEvent());

    const response = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'manual',
        lineItems: [
          {
            lineType: 'service',
            description: 'Consultation',
            quantity: 1,
            unitPricePaise: 50000,
            taxTreatment: 'exempt',
            gstRatePercent: 0,
          },
        ],
      });

    // A globally registered buffer parser would make this 400 or 500.
    expect(response.status).toBe(201);
    expect(response.body.data.id).toBeTruthy();
  });

  it('answers a 50-event burst within the Razorpay latency budget', async () => {
    const durations = await Promise.all(
      Array.from({ length: 50 }, async (_, index) => {
        const startedAt = performance.now();
        const response = await postWebhook(anyEvent({ seq: index }));
        return { status: response.status, ms: performance.now() - startedAt };
      }),
    );

    for (const result of durations) {
      // Razorpay counts any non-2xx as a failure and disables the webhook
      // after 24 hours of them. A 429 from the global limiter would qualify.
      expect(result.status).toBeGreaterThanOrEqual(200);
      expect(result.status).toBeLessThan(300);
    }

    const slowest = Math.max(...durations.map((d) => d.ms));
    // eslint-disable-next-line no-console
    console.log(`webhook latency: slowest of 50 concurrent events = ${slowest.toFixed(0)}ms`);
    expect(slowest).toBeLessThan(5000);

    expect(await prisma.webhookEvent.count({ where: { clinicId } })).toBe(50);
  });
});
