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
import {
  paymentLinkPaidWebhookFixture,
  refundProcessedWebhookFixture,
  signWebhookPayload,
} from '../helpers/razorpay-mock.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { applyWebhookEvent } from '../../src/modules/billing/webhook.worker.js';

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
let frontDeskId: string;
let otherClinicId: string;

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
  frontDeskId = frontDesk.id;

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

  // A second tenant, so "another clinic's invoice reference" is a real id.
  const otherOwner = await createTestUser({ fullName: 'Other Owner' });
  const otherClinic = await createTestClinic(otherOwner.id, { name: 'Other Clinic' });
  otherClinicId = otherClinic.id;
  await createTestClinicMember(otherOwner.id, otherClinic.id, 'FrontDesk');
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

/** A minimal, structurally valid event body that the worker never applies. */
function anyEvent(overrides: Record<string, unknown> = {}) {
  return { entity: 'event', event: 'payment_link.paid', payload: {}, ...overrides };
}

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createFinalizedInvoice(unitPricePaise = 50000) {
  const draft = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth())
    .send({
      source: 'manual',
      lineItems: [
        {
          lineType: 'service',
          description: 'Consultation',
          quantity: 1,
          unitPricePaise,
          taxTreatment: 'exempt',
          gstRatePercent: 0,
        },
      ],
    });
  expect(draft.status).toBe(201);

  const finalized = await request(app.server)
    .post(`/api/v1/billing/invoices/${draft.body.data.id}/finalize`)
    .set(auth())
    .send({});
  expect(finalized.status).toBe(200);

  return draft.body.data.id as string;
}

/**
 * The pending row a Razorpay link leaves behind, written directly.
 *
 * `PaymentService.createPaymentLink` would produce exactly this shape, but
 * going through it would drag the Razorpay SDK double into a suite whose
 * subject is the INBOUND path. What the worker needs is the row, not the call
 * that made it.
 */
async function seedPendingLink(
  invoiceId: string,
  options: {
    amountPaise?: number;
    paymentLinkId?: string;
    paymentGroupId?: string;
    method?: string;
  } = {},
) {
  return prisma.payment.create({
    data: {
      clinicId,
      invoiceId,
      method: options.method ?? 'upi',
      channel: 'razorpay',
      amountPaise: options.amountPaise ?? 50000,
      status: 'pending',
      razorpayPaymentLinkId: options.paymentLinkId ?? `plink_test_${randomUUID().slice(0, 8)}`,
      paymentGroupId: options.paymentGroupId ?? randomUUID(),
      expiresAt: new Date(Date.now() + 15 * 60_000),
      recordedById: frontDeskId,
    },
  });
}

/**
 * Records what the worker pushed and to which room.
 *
 * Deliberately has no `emit` of its own: a global broadcast would then be a
 * TypeError in the suite rather than a silent cross-tenant leak in production
 * (T-06-63).
 */
function recordingIo() {
  const emitted: Array<{ room: string; event: string; data: Record<string, unknown> }> = [];

  const io = {
    to(room: string) {
      return {
        emit(event: string, data: Record<string, unknown>) {
          emitted.push({ room, event, data });
        },
      };
    },
  };

  return { io: io as unknown as Parameters<typeof applyWebhookEvent>[1], emitted };
}

/** Posts an event, then runs the worker against the row it created. */
async function deliverAndApply(
  body: unknown,
  io: ReturnType<typeof recordingIo>['io'] | null = null,
  options: PostOptions = {},
) {
  const response = await postWebhook(body, options);
  expect(response.status).toBe(200);

  const row = await prisma.webhookEvent.findFirstOrThrow({
    where: { clinicId },
    orderBy: { receivedAt: 'desc' },
  });

  await applyWebhookEvent(prisma, io, row.id);

  return prisma.webhookEvent.findUniqueOrThrow({ where: { id: row.id } });
}

function paidEvent(
  invoiceId: string,
  paymentLinkId: string,
  amountPaid = 50000,
  overrides: { notesClinicId?: string; paymentId?: string } = {},
) {
  return paymentLinkPaidWebhookFixture({
    referenceId: invoiceId,
    paymentLinkId,
    amountPaid,
    paymentId: overrides.paymentId,
    notes: { clinicId: overrides.notesClinicId ?? clinicId, invoiceId },
  });
}

function linkLifecycleEvent(
  event: 'payment_link.expired' | 'payment_link.cancelled' | 'payment_link.partially_paid',
  invoiceId: string,
  paymentLinkId: string,
  amountPaid = 0,
) {
  const base = paidEvent(invoiceId, paymentLinkId, amountPaid);
  return {
    ...base,
    event,
    payload: {
      ...base.payload,
      payment_link: {
        entity: { ...base.payload.payment_link.entity, amount_paid: amountPaid },
      },
    },
  };
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

// ─── Worker: captures ───────────────────────────────────────────────────────

describe('billing-webhook worker — payment capture', () => {
  it('settles the invoice, issues a receipt and pushes to the clinic room only', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const pending = await seedPendingLink(invoiceId, { paymentLinkId: 'plink_capture01' });
    const { io, emitted } = recordingIo();

    const row = await deliverAndApply(
      paidEvent(invoiceId, 'plink_capture01', 50000, { paymentId: 'pay_capture01' }),
      io,
    );

    expect(row.processedAt).not.toBeNull();
    expect(row.processingError).toBeNull();

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(payment.status).toBe('captured');
    expect(payment.razorpayPaymentId).toBe('pay_capture01');
    expect(payment.paidAt).not.toBeNull();

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PAID');
    expect(invoice.balancePaise).toBe(0);
    expect(invoice.amountPaidPaise).toBe(50000);
    expect(invoice.exceptionFlag).toBeNull();

    // D-13: a receipt exists for the digital capture, carrying the gateway ref.
    const receipts = await prisma.paymentReceipt.findMany({ where: { clinicId, invoiceId } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].receiptNumber).toMatch(/^RCT-\d{6}-\d{4}$/);
    expect(receipts[0].transactionRef).toBe('pay_capture01');

    const audit = await prisma.billingAuditLog.findMany({
      where: { clinicId, invoiceId, event: 'PAYMENT_RECORDED' },
    });
    expect(audit).toHaveLength(1);

    // Every push is room-scoped, and the room is this clinic's.
    expect(emitted.length).toBeGreaterThanOrEqual(2);
    for (const push of emitted) {
      expect(push.room).toBe(`clinic:${clinicId}`);
    }
    expect(emitted.map((e) => e.event)).toContain('invoice:updated');
    expect(emitted.map((e) => e.event)).toContain('payment:received');
  });

  it('leaves a partly settled link PARTIALLY_PAID', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    await seedPendingLink(invoiceId, { paymentLinkId: 'plink_partial01' });

    await deliverAndApply(
      linkLifecycleEvent('payment_link.partially_paid', invoiceId, 'plink_partial01', 20000),
    );

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.balancePaise).toBe(30000);
  });

  it('treats a duplicate paid event for an already-PAID invoice as a no-op', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    await seedPendingLink(invoiceId, { paymentLinkId: 'plink_dupe01' });

    await deliverAndApply(paidEvent(invoiceId, 'plink_dupe01'));
    // A second delivery of the same event with a fresh event id — Razorpay
    // documents both duplicate and out-of-order delivery.
    const second = await deliverAndApply(paidEvent(invoiceId, 'plink_dupe01'));

    expect(second.processedAt).not.toBeNull();

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('captured');

    const receipts = await prisma.paymentReceipt.findMany({ where: { clinicId, invoiceId } });
    expect(receipts).toHaveLength(1);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PAID');
  });

  it('is a no-op when the same webhook_events row is reprocessed', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    await seedPendingLink(invoiceId, { paymentLinkId: 'plink_replay01' });

    const row = await deliverAndApply(paidEvent(invoiceId, 'plink_replay01'));
    const firstProcessedAt = row.processedAt;

    // BullMQ's second attempt on an already-applied event.
    await applyWebhookEvent(prisma, null, row.id);

    const reread = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(reread.processedAt).toEqual(firstProcessedAt);
    expect(await prisma.paymentReceipt.count({ where: { clinicId, invoiceId } })).toBe(1);
  });

  it('settles every invoice in a combined multi-invoice link (D-39)', async () => {
    const first = await createFinalizedInvoice(50000);
    const second = await createFinalizedInvoice(30000);
    const groupId = randomUUID();

    await seedPendingLink(first, {
      paymentLinkId: 'plink_group01',
      paymentGroupId: groupId,
      amountPaise: 50000,
    });
    await seedPendingLink(second, {
      paymentLinkId: 'plink_group01',
      paymentGroupId: groupId,
      amountPaise: 30000,
    });

    const { io, emitted } = recordingIo();
    await deliverAndApply(paidEvent(first, 'plink_group01', 80000), io);

    const firstInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: first } });
    const secondInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: second } });
    expect(firstInvoice.status).toBe('PAID');
    expect(secondInvoice.status).toBe('PAID');
    expect(firstInvoice.balancePaise).toBe(0);
    expect(secondInvoice.balancePaise).toBe(0);

    expect(await prisma.paymentReceipt.count({ where: { clinicId } })).toBe(2);
    for (const push of emitted) {
      expect(push.room).toBe(`clinic:${clinicId}`);
    }
  });
});

// ─── Worker: expiry, cancellation and refunds ───────────────────────────────

describe('billing-webhook worker — link lifecycle', () => {
  it('reverts an expired link to UNPAID', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const pending = await seedPendingLink(invoiceId, { paymentLinkId: 'plink_expire01' });

    await deliverAndApply(
      linkLifecycleEvent('payment_link.expired', invoiceId, 'plink_expire01'),
    );

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(payment.status).toBe('expired');

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('UNPAID');
    expect(invoice.balancePaise).toBe(50000);
  });

  it('keeps a collected cash leg and stays PARTIALLY_PAID when the digital leg expires (D-37)', async () => {
    const invoiceId = await createFinalizedInvoice(150000);

    const split = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 100000 });
    expect(split.status).toBe(200);

    await seedPendingLink(invoiceId, { paymentLinkId: 'plink_split01', amountPaise: 50000 });

    await deliverAndApply(linkLifecycleEvent('payment_link.expired', invoiceId, 'plink_split01'));

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    // The cash is in the drawer. Falling back to UNPAID would erase it.
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.balancePaise).toBe(50000);

    const cash = await prisma.payment.findFirstOrThrow({ where: { clinicId, invoiceId, method: 'cash' } });
    expect(cash.status).toBe('captured');
  });

  it('marks a cancelled link cancelled and recomputes', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const pending = await seedPendingLink(invoiceId, { paymentLinkId: 'plink_cancel01' });

    await deliverAndApply(
      linkLifecycleEvent('payment_link.cancelled', invoiceId, 'plink_cancel01'),
    );

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(payment.status).toBe('cancelled');

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('UNPAID');
  });

  it('applies refund.processed and recomputes the balance', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const pending = await seedPendingLink(invoiceId, { paymentLinkId: 'plink_refund01' });
    await deliverAndApply(paidEvent(invoiceId, 'plink_refund01'));

    const refund = await prisma.refund.create({
      data: {
        clinicId,
        invoiceId,
        paymentId: pending.id,
        method: 'razorpay',
        amountPaise: 50000,
        status: 'pending',
        razorpayRefundId: 'rfnd_test_worker01',
        createdById: frontDeskId,
      },
    });

    await deliverAndApply(refundProcessedWebhookFixture({ refundId: 'rfnd_test_worker01' }));

    const applied = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(applied.status).toBe('processed');
    expect(applied.processedAt).not.toBeNull();

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.amountPaidPaise).toBe(0);

    const audit = await prisma.billingAuditLog.findMany({
      where: { clinicId, invoiceId, event: 'REFUND_PROCESSED' },
    });
    expect(audit).toHaveLength(1);
  });

  it('applies refund.failed with the gateway reason', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const refund = await prisma.refund.create({
      data: {
        clinicId,
        invoiceId,
        method: 'razorpay',
        amountPaise: 50000,
        status: 'pending',
        razorpayRefundId: 'rfnd_test_fail01',
        createdById: frontDeskId,
      },
    });

    const failed = refundProcessedWebhookFixture({ refundId: 'rfnd_test_fail01' });
    await deliverAndApply({
      ...failed,
      event: 'refund.failed',
      payload: {
        refund: {
          entity: {
            ...failed.payload.refund.entity,
            status: 'failed',
            error_description: 'Refund could not be processed by the bank',
          },
        },
      },
    });

    const applied = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(applied.status).toBe('failed');
    expect(applied.failureReason).toContain('bank');

    expect(
      await prisma.billingAuditLog.count({ where: { clinicId, event: 'REFUND_FAILED' } }),
    ).toBe(1);
  });
});

// ─── Worker: refusal paths ──────────────────────────────────────────────────

describe('billing-webhook worker — refusals and exceptions', () => {
  it('records an unhandled event type without throwing, so BullMQ stops retrying', async () => {
    const row = await deliverAndApply({
      entity: 'event',
      event: 'payment.authorized',
      payload: {},
    });

    expect(row.processedAt).not.toBeNull();
    expect(row.processingError).toContain('payment.authorized');
  });

  it('refuses a verified event whose invoice belongs to another clinic (T-06-64)', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    await seedPendingLink(invoiceId, { paymentLinkId: 'plink_cross01' });

    const row = await deliverAndApply(
      paidEvent(invoiceId, 'plink_cross01', 50000, { notesClinicId: otherClinicId }),
    );

    expect(row.processingError).toBeTruthy();

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('UNPAID');
    expect(await prisma.paymentReceipt.count({ where: { clinicId } })).toBe(0);
  });

  it('records money that lands on a voided invoice without reopening it (D-35)', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    await seedPendingLink(invoiceId, { paymentLinkId: 'plink_void01' });

    const voided = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set(auth())
      .send({ reason: 'Owner cancelled the visit' });
    expect(voided.status).toBe(200);

    await deliverAndApply(paidEvent(invoiceId, 'plink_void01'));

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    // Terminal: the payment is recorded, the invoice is NOT reopened.
    expect(invoice.status).toBe('VOIDED');
    expect(invoice.exceptionFlag).toBe('payment_after_void');
    expect(invoice.amountPaidPaise).toBe(50000);
  });

  it('flags an overpayment rather than silently absorbing it (D-36)', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    // A link was opened, then the owner paid cash at the counter anyway.
    await seedPendingLink(invoiceId, { paymentLinkId: 'plink_over01' });

    const cash = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });
    expect(cash.status).toBe(200);

    // Razorpay believes the link was paid. That cannot be un-succeeded.
    await deliverAndApply(paidEvent(invoiceId, 'plink_over01'));

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.amountPaidPaise).toBe(100000);
    expect(invoice.balancePaise).toBe(-50000);
    expect(invoice.exceptionFlag).toBe('overpayment');
  });
});
