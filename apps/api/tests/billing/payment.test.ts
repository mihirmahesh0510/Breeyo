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
 * BIL-05 payment collection over HTTP.
 *
 * ## What is real here and what is not
 *
 * Razorpay test credentials are not provisioned for this repository
 * (06-RESEARCH `## Environment Availability`), so the SDK is mocked at the
 * module boundary. Everything below it is real: the clinic row genuinely holds
 * an AES-256-GCM envelope, `getRazorpayForClinic` genuinely decrypts it, the
 * routes genuinely resolve permissions from Redis, and the payment rows and
 * derived invoice status are genuinely written to Postgres. Seeding a plaintext
 * secret, or stubbing `getRazorpayForClinic` itself, would skip the decryption
 * path — which is precisely the path T-06-49 is about.
 *
 * The mock delegates to a mutable holder rather than capturing a snapshot at
 * construction, because `razorpay.client.ts` caches one instance per clinic: a
 * test that swaps in a rejecting `paymentLink.create` after the first request
 * must still be honoured by the already-cached client.
 */

const PLAINTEXT_SECRET = 'test_secret_never_on_the_wire_7Q2x';
const TEST_KEY_ID = 'rzp_test_integration01';

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
let otherClinicId: string;
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
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const frontDesk = await createTestUser({ fullName: 'Front Desk' });
  const clinician = await createTestUser({ fullName: 'Clinician' });

  const clinic = await createTestClinic(frontDesk.id, {
    name: 'Payments Clinic',
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecretEnc: encryptSecret(PLAINTEXT_SECRET),
  });
  clinicId = clinic.id;

  await createTestClinicMember(frontDesk.id, clinic.id, 'FrontDesk');
  await createTestClinicMember(clinician.id, clinic.id, 'Clinician');

  token = (await createTestTokens(app, frontDesk.id, clinic.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinician.id, clinic.id)).accessToken;

  // A second tenant, for the cross-clinic 404s.
  const otherOwner = await createTestUser({ fullName: 'Other Owner' });
  const otherClinic = await createTestClinic(otherOwner.id, {
    name: 'Other Clinic',
    razorpayKeyId: 'rzp_test_other0001',
    razorpayKeySecretEnc: encryptSecret('other_secret'),
  });
  otherClinicId = otherClinic.id;
  await createTestClinicMember(otherOwner.id, otherClinic.id, 'FrontDesk');
  otherToken = (await createTestTokens(app, otherOwner.id, otherClinic.id)).accessToken;
});

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

function serviceLine(unitPricePaise = 50000) {
  return {
    lineType: 'service',
    description: 'Consultation',
    quantity: 1,
    unitPricePaise,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
  };
}

async function createFinalized(unitPricePaise = 50000, t = token) {
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

describe('POST /billing/invoices/:invoiceId/payments — cash (D-10)', () => {
  it('records the cash, settles the invoice and returns the receipt id', async () => {
    const invoiceId = await createFinalized(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });

    expect(response.status).toBe(200);
    expect(response.body.data.receiptId).toBeTruthy();
    expect(response.body.data.invoice.status).toBe('PAID');
    expect(response.body.data.invoice.balancePaise).toBe(0);

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ method: 'cash', channel: 'manual', status: 'captured' });

    const receipts = await prisma.paymentReceipt.findMany({ where: { clinicId, invoiceId } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].receiptNumber).toMatch(/^RCT-\d{6}-\d{4}$/);
    expect(receipts[0].transactionRef).toBeNull();
  });

  it('leaves a partly paid invoice PARTIALLY_PAID with the remaining balance', async () => {
    const invoiceId = await createFinalized(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 20000 });

    expect(response.status).toBe(200);
    expect(response.body.data.invoice.status).toBe('PARTIALLY_PAID');
    expect(response.body.data.invoice.balancePaise).toBe(30000);
  });
});

describe('POST /billing/invoices/:invoiceId/payments — Razorpay link (D-09, BIL-05)', () => {
  it('returns only the link id, short url and expiry — no key and no secret (T-06-49)', async () => {
    const invoiceId = await createFinalized(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'upi', amountPaise: 50000 });

    expect(response.status).toBe(200);
    expect(response.body.data.paymentLinkId).toMatch(/^plink_test/);
    expect(response.body.data.shortUrl).toContain('https://rzp.io/');
    expect(response.body.data.expiresAt).toBeTruthy();

    // The whole body, not just the fields we happened to name.
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain(PLAINTEXT_SECRET);
    expect(serialised).not.toContain('rzp_test_');
    expect(serialised).not.toContain('key_secret');
  });

  it('records a PENDING payment and does not mark the invoice paid on a gateway 200 (T-06-50)', async () => {
    const invoiceId = await createFinalized(50000);

    await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'upi', amountPaise: 50000 });

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ channel: 'razorpay', status: 'pending' });
    expect(payments[0].paidAt).toBeNull();
    expect(payments[0].expiresAt).toBeTruthy();

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('UNPAID');
    expect(invoice.balancePaise).toBe(50000);
  });

  it('sends an expire_by at least 960 seconds out and a 36-character reference_id', async () => {
    const invoiceId = await createFinalized(50000);
    const nowSeconds = Math.floor(Date.now() / 1000);

    await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'upi', amountPaise: 50000 });

    const params = holder.current.paymentLink.create.mock.calls[0][0] as {
      expire_by: number;
      reference_id: string;
      amount: number;
    };
    expect(params.expire_by - nowSeconds).toBeGreaterThanOrEqual(960);
    expect(params.reference_id).toBe(invoiceId);
    expect(params.reference_id.length).toBeLessThanOrEqual(40);
    expect(params.amount).toBe(50000);
  });

  it('surfaces a gateway rejection as 502 PAYMENT_GATEWAY_ERROR with the reason intact (D-11)', async () => {
    const invoiceId = await createFinalized(50000);
    holder.current.paymentLink.create = vi.fn(async () => {
      throw {
        statusCode: 400,
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'Payment link expiry time should be at least 15 minutes from now',
        },
      };
    }) as unknown as RazorpayMock['paymentLink']['create'];

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'upi', amountPaise: 50000 });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    expect(response.body.error.message).toContain('at least 15 minutes from now');

    // Nothing recorded for a link that was never created.
    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(0);
  });
});

describe('POST /billing/invoices/:invoiceId/payments — split (D-10, D-37)', () => {
  it('records the cash leg and opens a link for the digital leg', async () => {
    const invoiceId = await createFinalized(150000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({
        mode: 'split',
        totalPaise: 150000,
        cashAmountPaise: 100000,
        digitalAmountPaise: 50000,
        digitalMethod: 'upi',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.paymentLink.paymentLinkId).toMatch(/^plink_test/);

    const payments = await prisma.payment.findMany({
      where: { clinicId, invoiceId },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments).toHaveLength(2);
    expect(payments[0]).toMatchObject({ method: 'cash', status: 'captured', amountPaise: 100000 });
    expect(payments[1]).toMatchObject({ channel: 'razorpay', status: 'pending', amountPaise: 50000 });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.balancePaise).toBe(50000);
  });

  it('rejects a split whose legs do not sum with a 400 VALIDATION_ERROR', async () => {
    const invoiceId = await createFinalized(150000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({
        mode: 'split',
        totalPaise: 150000,
        cashAmountPaise: 100000,
        digitalAmountPaise: 40000,
        digitalMethod: 'upi',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(0);
  });
});

describe('POST /billing/invoices/:invoiceId/payments/retry — D-11 retry', () => {
  it('cancels the outstanding link and returns a different short url', async () => {
    const invoiceId = await createFinalized(50000);

    const first = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'upi', amountPaise: 50000 });
    expect(first.status).toBe(200);

    const retry = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments/retry`)
      .set(auth())
      .send({});

    expect(retry.status).toBe(200);
    expect(retry.body.data.shortUrl).not.toBe(first.body.data.shortUrl);
    expect(holder.current.paymentLink.cancel).toHaveBeenCalledWith(
      first.body.data.paymentLinkId,
    );

    const payments = await prisma.payment.findMany({
      where: { clinicId, invoiceId },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments).toHaveLength(2);
    expect(payments[0].status).toBe('cancelled');
    expect(payments[1].status).toBe('pending');
  });
});

describe('POST /billing/invoices/:invoiceId/payments/mark-unpaid — D-11 fallback, D-37', () => {
  it('cancels the pending link and returns the invoice as UNPAID', async () => {
    const invoiceId = await createFinalized(50000);

    const link = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'upi', amountPaise: 50000 });
    expect(link.status).toBe(200);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments/mark-unpaid`)
      .set(auth())
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('UNPAID');
    expect(holder.current.paymentLink.cancel).toHaveBeenCalledWith(link.body.data.paymentLinkId);

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments[0].status).toBe('cancelled');
  });

  it('keeps a collected cash leg and lands on PARTIALLY_PAID, never UNPAID (D-37)', async () => {
    const invoiceId = await createFinalized(150000);

    await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({
        mode: 'split',
        totalPaise: 150000,
        cashAmountPaise: 100000,
        digitalAmountPaise: 50000,
        digitalMethod: 'upi',
      });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments/mark-unpaid`)
      .set(auth())
      .send({});

    expect(response.status).toBe(200);
    // The cash is real and the clinic is holding it. Falling back to UNPAID
    // would erase it from the invoice's own account of itself.
    expect(response.body.data.status).toBe('PARTIALLY_PAID');
    expect(response.body.data.balancePaise).toBe(50000);

    const cash = await prisma.payment.findFirst({ where: { clinicId, invoiceId, method: 'cash' } });
    expect(cash?.status).toBe('captured');
  });
});

describe('GET /billing/invoices/:invoiceId/receipts/:receiptId — D-13', () => {
  it('returns the receipt record', async () => {
    const invoiceId = await createFinalized(50000);

    const paid = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });

    const response = await request(app.server)
      .get(`/api/v1/billing/invoices/${invoiceId}/receipts/${paid.body.data.receiptId}`)
      .set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.amountPaise).toBe(50000);
    expect(response.body.data.method).toBe('cash');
    expect(response.body.data.receiptNumber).toMatch(/^RCT-/);
  });

  it('404s for a receipt belonging to another clinic', async () => {
    const invoiceId = await createFinalized(50000);
    const paid = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });

    const otherInvoiceId = await createFinalized(50000, otherToken);

    const response = await request(app.server)
      .get(`/api/v1/billing/invoices/${otherInvoiceId}/receipts/${paid.body.data.receiptId}`)
      .set(auth(otherToken));

    expect(response.status).toBe(404);
  });
});

describe('Payment authorization and tenancy', () => {
  it('returns 403 for a user without MANAGE_PAYMENTS', async () => {
    const invoiceId = await createFinalized(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth(clinicianToken))
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });

    expect(response.status).toBe(403);

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(0);
  });

  it('returns 401 without a token', async () => {
    const invoiceId = await createFinalized(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });

    expect(response.status).toBe(401);
  });

  it('404s when paying an invoice belonging to another clinic', async () => {
    const invoiceId = await createFinalized(50000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth(otherToken))
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });

    expect(response.status).toBe(404);
    expect(otherClinicId).not.toBe(clinicId);
  });
});
