import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
import { buildRazorpayMock, type RazorpayMock } from '../helpers/razorpay-mock.js';
import { encryptSecret } from '../../src/lib/crypto.js';

/**
 * Refunds over HTTP (BIL-03, D-12, D-42).
 *
 * Built on plan 06-09's `payment.test.ts` skeleton: the Razorpay SDK is mocked
 * at the module boundary and everything below it is real — the clinic row holds
 * a genuine AES-256-GCM envelope, `getRazorpayForClinic` genuinely decrypts it,
 * the routes genuinely resolve permissions from Redis, and every payment,
 * refund and derived invoice figure is genuinely written to Postgres.
 *
 * ## The pending-to-processed transition
 *
 * Plan 06-10's `webhook.worker.ts` does not exist in this worktree yet, so the
 * async-completion test drives the transition through
 * {@link applyRefundProcessedWebhook}, which performs exactly the two writes
 * that handler owes: set the matched `Refund` to `processed` with a
 * `processedAt`, then re-derive the invoice's money state. What is under test
 * here is not that helper — it is that the REFUND ENDPOINT alone leaves the row
 * `pending` and the balance untouched, and that only a `refund.processed` event
 * completes it. When 06-10 lands, swap the helper for its exported job handler;
 * the assertions around it do not change.
 */

const PLAINTEXT_SECRET = 'test_secret_never_on_the_wire_7Q2x';
const TEST_KEY_ID = 'rzp_test_refund000001';

const holder = vi.hoisted(() => ({ current: null as unknown as RazorpayMock }));

vi.mock('razorpay', () => {
  class MockRazorpay {
    paymentLink = {
      create: (...args: unknown[]) =>
        (holder.current.paymentLink.create as (...a: unknown[]) => unknown)(...args),
      fetch: (...args: unknown[]) =>
        (holder.current.paymentLink.fetch as (...a: unknown[]) => unknown)(...args),
      cancel: (...args: unknown[]) =>
        (holder.current.paymentLink.cancel as (...a: unknown[]) => unknown)(...args),
    };
    payments = {
      refund: (...args: unknown[]) =>
        (holder.current.payments.refund as (...a: unknown[]) => unknown)(...args),
    };
    refunds = {
      fetch: (...args: unknown[]) =>
        (holder.current.refunds.fetch as (...a: unknown[]) => unknown)(...args),
    };
  }

  return { default: MockRazorpay };
});

let app: FastifyInstance;

let clinicId: string;
let token: string;
let clinicianToken: string;
let otherToken: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  holder.current = buildRazorpayMock();

  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) await app.redis.del(...keys);

  const frontDesk = await createTestUser({ fullName: 'Front Desk' });
  const clinician = await createTestUser({ fullName: 'Clinician' });

  const clinic = await createTestClinic(frontDesk.id, {
    name: 'Refunds Clinic',
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecretEnc: encryptSecret(PLAINTEXT_SECRET),
  });
  clinicId = clinic.id;

  await createTestClinicMember(frontDesk.id, clinic.id, 'FrontDesk');
  await createTestClinicMember(clinician.id, clinic.id, 'Clinician');

  token = (await createTestTokens(app, frontDesk.id, clinic.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinician.id, clinic.id)).accessToken;

  const otherOwner = await createTestUser({ fullName: 'Other Owner' });
  const otherClinic = await createTestClinic(otherOwner.id, {
    name: 'Other Clinic',
    razorpayKeyId: 'rzp_test_other0001',
    razorpayKeySecretEnc: encryptSecret('other_secret'),
  });
  await createTestClinicMember(otherOwner.id, otherClinic.id, 'FrontDesk');
  otherToken = (await createTestTokens(app, otherOwner.id, otherClinic.id)).accessToken;
});

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

function serviceLine(unitPricePaise: number) {
  return {
    lineType: 'service',
    description: 'Consultation',
    quantity: 1,
    unitPricePaise,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
  };
}

async function createFinalized(unitPricePaise: number, t = token) {
  const draft = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth(t))
    .send({ source: 'manual', lineItems: [serviceLine(unitPricePaise)] });
  expect(draft.status).toBe(201);

  const finalized = await request(app.server)
    .post(`/api/v1/billing/invoices/${draft.body.data.id}/finalize`)
    .set(auth(t))
    .send({});
  expect(finalized.status).toBe(200);

  return draft.body.data.id as string;
}

/** Finalized and fully settled in cash. */
async function cashPaid(amountPaise: number, t = token) {
  const invoiceId = await createFinalized(amountPaise, t);
  const paid = await request(app.server)
    .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
    .set(auth(t))
    .send({ mode: 'single', method: 'cash', amountPaise });
  expect(paid.status).toBe(200);
  return invoiceId;
}

/**
 * Finalized, cash leg collected, digital leg opened AND captured.
 *
 * The digital capture is written directly rather than through a webhook,
 * because plan 06-10 owns that path. What matters to a refund test is that two
 * captured legs of different channels exist.
 */
async function splitPaidAndCaptured(cashPaise: number, digitalPaise: number) {
  const total = cashPaise + digitalPaise;
  const invoiceId = await createFinalized(total);

  const split = await request(app.server)
    .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
    .set(auth())
    .send({
      mode: 'split',
      totalPaise: total,
      cashAmountPaise: cashPaise,
      digitalAmountPaise: digitalPaise,
      digitalMethod: 'upi',
    });
  expect(split.status).toBe(200);

  const pending = await prisma.payment.findFirstOrThrow({
    where: { clinicId, invoiceId, channel: 'razorpay', status: 'pending' },
  });
  await prisma.payment.update({
    where: { id: pending.id },
    data: { status: 'captured', paidAt: new Date(), razorpayPaymentId: 'pay_test_captured01' },
  });
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'PAID', amountPaidPaise: total, balancePaise: 0 },
  });

  return invoiceId;
}

/**
 * What plan 06-10's `refund.processed` handler owes: complete the matched
 * refund and re-derive the invoice. See the file header.
 */
async function applyRefundProcessedWebhook(razorpayRefundId: string) {
  const refund = await prisma.refund.findFirstOrThrow({ where: { razorpayRefundId } });
  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: 'processed', processedAt: new Date() },
  });

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: refund.invoiceId } });
  const captured = await prisma.payment.findMany({
    where: { invoiceId: refund.invoiceId, status: 'captured' },
  });
  const processed = await prisma.refund.findMany({
    where: { invoiceId: refund.invoiceId, status: 'processed' },
  });
  const amountPaidPaise =
    captured.reduce((sum, p) => sum + p.amountPaise, 0) -
    processed.reduce((sum, r) => sum + r.amountPaise, 0);

  await prisma.invoice.update({
    where: { id: refund.invoiceId },
    data: {
      amountPaidPaise,
      balancePaise: invoice.grandTotalPaise - amountPaidPaise - invoice.creditedPaise,
    },
  });
}

describe('POST /billing/invoices/:invoiceId/refunds — the bound (T-06-66)', () => {
  it('refunds the full captured amount on a cash-paid invoice', async () => {
    const invoiceId = await cashPaid(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'full', amountPaise: 50000 });

    expect(response.status).toBe(201);
    expect(response.body.data.refunds).toHaveLength(1);
    expect(response.body.data.refunds[0]).toMatchObject({
      method: 'cash',
      status: 'processed',
      amountPaise: 50000,
    });
    expect(response.body.data.totalRefundedPaise).toBe(50000);

    const refunds = await prisma.refund.findMany({ where: { clinicId, invoiceId } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].processedAt).toBeTruthy();

    // A processed refund gives the money back, so the invoice is outstanding
    // again — but its status is still derived, never set to a REFUNDED literal.
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.balancePaise).toBe(50000);
    expect(invoice.status).not.toBe('REFUNDED');
  });

  it('rejects an amount larger than what was captured', async () => {
    const invoiceId = await cashPaid(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 60000 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('REFUND_EXCEEDS_PAID');
    expect(await prisma.refund.count({ where: { clinicId, invoiceId } })).toBe(0);
  });

  it('allows the first partial refund and refuses the second that would breach the total', async () => {
    const invoiceId = await cashPaid(50000);

    const first = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 20000 });
    expect(first.status).toBe(201);

    const second = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 40000 });

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('REFUND_EXCEEDS_PAID');
    expect(await prisma.refund.count({ where: { clinicId, invoiceId } })).toBe(1);
  });

  it('refuses a refund on an invoice nobody has paid', async () => {
    const invoiceId = await createFinalized(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'full', amountPaise: 50000 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('REFUND_EXCEEDS_PAID');
    expect(holder.current.payments.refund).not.toHaveBeenCalled();
  });
});

describe('POST /billing/invoices/:invoiceId/refunds — split legs (D-42)', () => {
  it('returns two records whose per-leg amounts sum exactly to the request', async () => {
    const invoiceId = await splitPaidAndCaptured(100000, 50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'full', amountPaise: 150000 });

    expect(response.status).toBe(201);
    const refunds = response.body.data.refunds as Array<{
      method: string;
      amountPaise: number;
      status: string;
    }>;
    expect(refunds).toHaveLength(2);

    const cash = refunds.find((r) => r.method === 'cash');
    const digital = refunds.find((r) => r.method === 'razorpay');
    expect(cash).toMatchObject({ amountPaise: 100000, status: 'processed' });
    expect(digital).toMatchObject({ amountPaise: 50000, status: 'pending' });
    expect(refunds.reduce((sum, r) => sum + r.amountPaise, 0)).toBe(150000);
  });

  it('D-42: refunds only the cash leg when that payment is named', async () => {
    const invoiceId = await splitPaidAndCaptured(100000, 50000);
    const cashPayment = await prisma.payment.findFirstOrThrow({
      where: { clinicId, invoiceId, method: 'cash' },
    });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 100000, paymentId: cashPayment.id });

    expect(response.status).toBe(201);
    expect(response.body.data.refunds).toHaveLength(1);
    expect(response.body.data.refunds[0]).toMatchObject({
      method: 'cash',
      status: 'processed',
      paymentId: cashPayment.id,
    });
    // The digital leg was untouched, so Razorpay was never called.
    expect(holder.current.payments.refund).not.toHaveBeenCalled();
  });

  it('bounds a named leg by that leg alone', async () => {
    const invoiceId = await splitPaidAndCaptured(100000, 50000);
    const digital = await prisma.payment.findFirstOrThrow({
      where: { clinicId, invoiceId, channel: 'razorpay', status: 'captured' },
    });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 120000, paymentId: digital.id });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('REFUND_EXCEEDS_PAID');
  });
});

describe('POST /billing/invoices/:invoiceId/refunds — async completion (T-06-68)', () => {
  it('leaves a digital refund PENDING; only refund.processed completes it', async () => {
    const invoiceId = await splitPaidAndCaptured(50000, 100000);
    const digital = await prisma.payment.findFirstOrThrow({
      where: { clinicId, invoiceId, channel: 'razorpay', status: 'captured' },
    });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 50000, paymentId: digital.id });

    expect(response.status).toBe(201);
    expect(holder.current.payments.refund).toHaveBeenCalledTimes(1);

    // The API call succeeded, so a naive implementation would call this done.
    const pending = await prisma.refund.findFirstOrThrow({ where: { clinicId, invoiceId } });
    expect(pending.status).toBe('pending');
    expect(pending.processedAt).toBeNull();
    expect(pending.razorpayRefundId).toBeTruthy();

    // And the money has not moved: the reducer counts processed refunds only.
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(before.balancePaise).toBe(0);

    await applyRefundProcessedWebhook(pending.razorpayRefundId as string);

    const completed = await prisma.refund.findUniqueOrThrow({ where: { id: pending.id } });
    expect(completed.status).toBe('processed');
    expect(completed.processedAt).toBeTruthy();

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(after.balancePaise).toBe(50000);
  });

  it('surfaces a gateway rejection as 502 and records no refund at all', async () => {
    const invoiceId = await splitPaidAndCaptured(50000, 100000);
    const digital = await prisma.payment.findFirstOrThrow({
      where: { clinicId, invoiceId, channel: 'razorpay', status: 'captured' },
    });

    holder.current.payments.refund = vi.fn(async () => {
      throw {
        statusCode: 400,
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'The refund amount is greater than payment amount',
        },
      };
    }) as unknown as RazorpayMock['payments']['refund'];

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 50000, paymentId: digital.id });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    expect(response.body.error.message).toContain('greater than payment amount');

    // The pending insert rolled back with the transaction.
    expect(await prisma.refund.count({ where: { clinicId, invoiceId } })).toBe(0);
  });

  it('never puts a credential on the wire', async () => {
    const invoiceId = await splitPaidAndCaptured(50000, 100000);
    const digital = await prisma.payment.findFirstOrThrow({
      where: { clinicId, invoiceId, channel: 'razorpay', status: 'captured' },
    });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 50000, paymentId: digital.id });

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain(PLAINTEXT_SECRET);
    expect(serialised).not.toContain('rzp_test_refund');
    expect(serialised).not.toContain('key_secret');
  });
});

describe('GET /billing/invoices/:invoiceId/refunds and /refundable', () => {
  it('lists the refunds issued against an invoice', async () => {
    const invoiceId = await cashPaid(50000);
    await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 20000 });

    const response = await request(app.server)
      .get(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].amountPaise).toBe(20000);
  });

  it('reports the refundable maximum so the sheet does not compute money', async () => {
    const invoiceId = await cashPaid(50000);
    await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth())
      .send({ type: 'partial', amountPaise: 20000 });

    const response = await request(app.server)
      .get(`/api/v1/billing/invoices/${invoiceId}/refundable`)
      .set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.refundablePaise).toBe(30000);
    expect(response.body.data.legs).toHaveLength(1);
    expect(response.body.data.legs[0]).toMatchObject({
      capturedPaise: 50000,
      refundedPaise: 20000,
      refundablePaise: 30000,
    });
  });
});

describe('Refund authorization and tenancy (T-06-73)', () => {
  it('returns 403 for a Clinician, who holds no MANAGE_PAYMENTS', async () => {
    const invoiceId = await cashPaid(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth(clinicianToken))
      .send({ type: 'full', amountPaise: 50000 });

    expect(response.status).toBe(403);
    expect(await prisma.refund.count({ where: { clinicId, invoiceId } })).toBe(0);
  });

  it('returns 401 without a token', async () => {
    const invoiceId = await cashPaid(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .send({ type: 'full', amountPaise: 50000 });

    expect(response.status).toBe(401);
  });

  it('404s a refund against another clinic’s invoice', async () => {
    const invoiceId = await cashPaid(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/refunds`)
      .set(auth(otherToken))
      .send({ type: 'full', amountPaise: 50000 });

    expect(response.status).toBe(404);
  });
});
