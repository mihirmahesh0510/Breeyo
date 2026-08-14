import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestPet,
  createTestPetOwner,
  createTestTokens,
  prisma,
} from '../helpers/factories.js';
import {
  buildRazorpayMock,
  paymentLinkPaidWebhookFixture,
  signWebhookPayload,
  type RazorpayMock,
} from '../helpers/razorpay-mock.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { applyWebhookEvent } from '../../src/modules/billing/webhook.worker.js';

/**
 * D-27 / D-39 — one Razorpay link settling several of an owner's invoices.
 *
 * ## Why this suite exists separately from `payment.test.ts`
 *
 * The single-invoice path answers "can this invoice be paid?". The combined
 * path answers a question that has no single-invoice equivalent: "do these
 * invoices belong together?" Every rejection below is about the *relationship*
 * between invoices — one owner, one clinic, each still payable — and none of
 * them can be expressed as a property of one invoice on its own. Putting them
 * beside the per-invoice cases would blur which guard is being exercised.
 *
 * ## The loop this suite closes
 *
 * Plan 06-03 relaxed the `payments` unique constraint to
 * `(razorpay_payment_link_id, invoice_id)` and added `payment_group_id`; plan
 * 06-10 built the webhook fan-out that settles a whole group from one
 * `payment_link.paid`. Until now nothing in the product could *create* such a
 * group, so the fan-out was only ever exercised against hand-seeded rows. The
 * last test here drives the real endpoint and then feeds a genuinely signed
 * webhook through the real worker, which is the only arrangement that proves
 * the two halves agree on the shape of a group.
 *
 * Razorpay itself is doubled at the module boundary, exactly as in
 * `payment.test.ts`: no test credentials are provisioned for this repository
 * (06-RESEARCH `## Environment Availability`). Everything below the SDK is
 * real — the AES-256-GCM credential envelope, the HMAC over the raw request
 * bytes, the permission resolution, and every row written to Postgres.
 */

const PLAINTEXT_SECRET = 'combined_secret_never_on_the_wire';
const WEBHOOK_SECRET = 'combined_webhook_secret';
const TEST_KEY_ID = 'rzp_test_combined01';

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
let webhookToken: string;
let ownerId: string;
let petId: string;
let secondOwnerId: string;
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
  if (keys.length > 0) await app.redis.del(...keys);

  const frontDesk = await createTestUser({ fullName: 'Front Desk' });
  const clinician = await createTestUser({ fullName: 'Clinician' });

  webhookToken = randomUUID().replace(/-/g, '');
  const clinic = await createTestClinic(frontDesk.id, {
    name: 'Combined Link Clinic',
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecretEnc: encryptSecret(PLAINTEXT_SECRET),
    razorpayWebhookSecretEnc: encryptSecret(WEBHOOK_SECRET),
    razorpayWebhookToken: webhookToken,
  });
  clinicId = clinic.id;

  await createTestClinicMember(frontDesk.id, clinic.id, 'FrontDesk');
  await createTestClinicMember(clinician.id, clinic.id, 'Clinician');

  token = (await createTestTokens(app, frontDesk.id, clinic.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinician.id, clinic.id)).accessToken;

  // D-27: one invoice per pet, so the multi-pet owner is the motivating case.
  const owner = await createTestPetOwner(clinic.id, { name: 'Combined Owner' });
  ownerId = owner.id;
  petId = (await createTestPet(clinic.id, owner.id, { name: 'Bruno' })).id;

  const secondOwner = await createTestPetOwner(clinic.id, { name: 'Second Owner' });
  secondOwnerId = secondOwner.id;

  const otherClinicUser = await createTestUser({ fullName: 'Other Front Desk' });
  const otherClinic = await createTestClinic(otherClinicUser.id, {
    name: 'Other Clinic',
    razorpayKeyId: 'rzp_test_othercomb1',
    razorpayKeySecretEnc: encryptSecret('other_secret'),
  });
  otherClinicId = otherClinic.id;
  await createTestClinicMember(otherClinicUser.id, otherClinic.id, 'FrontDesk');
  otherToken = (await createTestTokens(app, otherClinicUser.id, otherClinic.id)).accessToken;
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

/** A finalized invoice, optionally attributed to an owner and pet. */
async function createFinalized(
  unitPricePaise: number,
  options: { ownerId?: string; petId?: string; token?: string } = {},
) {
  const t = options.token ?? token;

  const draft = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth(t))
    .send({
      source: 'manual',
      ownerId: options.ownerId,
      petId: options.petId,
      lineItems: [serviceLine(unitPricePaise)],
    });
  expect(draft.status).toBe(201);

  const finalized = await request(app.server)
    .post(`/api/v1/billing/invoices/${draft.body.data.id}/finalize`)
    .set(auth(t))
    .send({});
  expect(finalized.status).toBe(200);

  return draft.body.data.id as string;
}

/** Two finalized invoices for the same owner — the D-27 shape. */
async function twoForOneOwner(first = 50000, second = 30000) {
  return [
    await createFinalized(first, { ownerId, petId }),
    await createFinalized(second, { ownerId, petId }),
  ] as const;
}

function createCombined(body: Record<string, unknown>, t = token) {
  return request(app.server).post('/api/v1/billing/payment-links').set(auth(t)).send(body);
}

describe('POST /billing/payment-links — creation (D-27, D-39)', () => {
  it('opens ONE link for the summed balance and a pending row per invoice in one group', async () => {
    const [first, second] = await twoForOneOwner(50000, 30000);

    const response = await createCombined({ invoiceIds: [first, second] });

    expect(response.status).toBe(200);
    expect(response.body.data.amountPaise).toBe(80000);
    expect(response.body.data.paymentLinkId).toMatch(/^plink_test/);
    expect(response.body.data.shortUrl).toContain('https://rzp.io/');
    expect(response.body.data.paymentGroupId).toBeTruthy();

    // One call to the gateway, for the combined figure — not one per invoice.
    expect(holder.current.paymentLink.create).toHaveBeenCalledTimes(1);
    const params = holder.current.paymentLink.create.mock.calls[0][0] as {
      amount: number;
      reference_id: string;
      accept_partial: boolean;
    };
    expect(params.amount).toBe(80000);
    expect(params.accept_partial).toBe(false);
    // Razorpay caps `reference_id` at 40 characters, so it carries one invoice
    // id; the group is what ties the rest together on our side.
    expect(params.reference_id.length).toBeLessThanOrEqual(40);

    const payments = await prisma.payment.findMany({
      where: { clinicId, razorpayPaymentLinkId: response.body.data.paymentLinkId },
      orderBy: { amountPaise: 'desc' },
    });
    expect(payments).toHaveLength(2);
    expect(new Set(payments.map((p) => p.paymentGroupId))).toEqual(
      new Set([response.body.data.paymentGroupId]),
    );
    expect(payments.map((p) => p.amountPaise)).toEqual([50000, 30000]);
    expect(payments.every((p) => p.status === 'pending')).toBe(true);
    expect(payments.every((p) => p.channel === 'razorpay')).toBe(true);
    expect(new Set(payments.map((p) => p.invoiceId))).toEqual(new Set([first, second]));
  });

  it('leaves both invoices unpaid — a gateway 200 is not money (T-06-50)', async () => {
    const [first, second] = await twoForOneOwner();

    expect((await createCombined({ invoiceIds: [first, second] })).status).toBe(200);

    for (const id of [first, second]) {
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(invoice.status).toBe('UNPAID');
    }
    expect(await prisma.paymentReceipt.count({ where: { clinicId } })).toBe(0);
  });

  it('never returns a key or a secret (T-06-49)', async () => {
    const [first, second] = await twoForOneOwner();

    const response = await createCombined({ invoiceIds: [first, second] });

    // Asserted first so the scan below cannot pass against an error body, which
    // trivially contains no credential and would make this test decorative.
    expect(response.status).toBe(200);
    expect(response.body.data.shortUrl).toBeTruthy();

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain(PLAINTEXT_SECRET);
    expect(serialised).not.toContain('rzp_test_combined01');
    expect(serialised).not.toContain('key_secret');
  });

  it('collapses a repeated invoice id instead of billing it twice', async () => {
    const [first, second] = await twoForOneOwner(50000, 30000);

    const response = await createCombined({ invoiceIds: [first, second, first] });

    expect(response.status).toBe(200);
    expect(response.body.data.amountPaise).toBe(80000);

    const payments = await prisma.payment.findMany({
      where: { clinicId, razorpayPaymentLinkId: response.body.data.paymentLinkId },
    });
    expect(payments).toHaveLength(2);
  });

  it('accepts a single id — the degenerate group of one', async () => {
    const [only] = await twoForOneOwner(50000, 30000);

    const response = await createCombined({ invoiceIds: [only] });

    expect(response.status).toBe(200);
    expect(response.body.data.amountPaise).toBe(50000);
    expect(response.body.data.invoices).toHaveLength(1);
  });

  it('bills only what is still outstanding on a partly paid invoice', async () => {
    const [first, second] = await twoForOneOwner(50000, 30000);

    const cash = await request(app.server)
      .post(`/api/v1/billing/invoices/${first}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 20000 });
    expect(cash.status).toBe(200);

    const response = await createCombined({ invoiceIds: [first, second] });

    expect(response.status).toBe(200);
    expect(response.body.data.amountPaise).toBe(60000);
  });
});

describe('POST /billing/payment-links — rejected combinations (D-27)', () => {
  /** Nothing may be written and the gateway may not be called. */
  async function expectNothingHappened() {
    expect(holder.current.paymentLink.create).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { clinicId } })).toBe(0);
  }

  it('rejects invoices belonging to different owners', async () => {
    const mine = await createFinalized(50000, { ownerId, petId });
    const theirs = await createFinalized(30000, { ownerId: secondOwnerId });

    const response = await createCombined({ invoiceIds: [mine, theirs] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVOICES_NOT_SAME_OWNER');
    await expectNothingHappened();
  });

  it('rejects combining an unattributed walk-in invoice with an owner invoice', async () => {
    const attributed = await createFinalized(50000, { ownerId, petId });
    const walkIn = await createFinalized(30000);

    const response = await createCombined({ invoiceIds: [attributed, walkIn] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVOICES_NOT_SAME_OWNER');
    await expectNothingHappened();
  });

  it('rejects a combination containing an already-settled invoice', async () => {
    const [first, second] = await twoForOneOwner(50000, 30000);

    const cash = await request(app.server)
      .post(`/api/v1/billing/invoices/${first}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });
    expect(cash.status).toBe(200);
    holder.current = buildRazorpayMock();

    const response = await createCombined({ invoiceIds: [first, second] });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVOICE_ALREADY_SETTLED');
    expect(holder.current.paymentLink.create).not.toHaveBeenCalled();
    // The second invoice must not have acquired a link of its own.
    expect(await prisma.payment.count({ where: { clinicId, invoiceId: second } })).toBe(0);
  });

  it('rejects a combination containing a voided invoice', async () => {
    const [first, second] = await twoForOneOwner(50000, 30000);

    const voided = await request(app.server)
      .post(`/api/v1/billing/invoices/${second}/void`)
      .set(auth())
      .send({ reason: 'Duplicate consultation entry' });
    expect(voided.status).toBe(200);
    holder.current = buildRazorpayMock();

    const response = await createCombined({ invoiceIds: [first, second] });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    await expectNothingHappened();
  });

  it('rejects a combination containing a draft', async () => {
    const finalized = await createFinalized(50000, { ownerId, petId });
    const draft = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set(auth())
      .send({ source: 'manual', ownerId, petId, lineItems: [serviceLine(30000)] });
    expect(draft.status).toBe(201);

    const response = await createCombined({
      invoiceIds: [finalized, draft.body.data.id],
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    await expectNothingHappened();
  });

  it('404s when one id belongs to another clinic, without saying so', async () => {
    const mine = await createFinalized(50000, { ownerId, petId });
    const theirs = await createFinalized(30000, { token: otherToken });
    expect(otherClinicId).not.toBe(clinicId);

    const response = await createCombined({ invoiceIds: [mine, theirs] });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INVOICE_NOT_FOUND');
    await expectNothingHappened();
  });

  it('refuses a combined total below the gateway minimum rather than surfacing a 502', async () => {
    const first = await createFinalized(40, { ownerId, petId });
    const second = await createFinalized(30, { ownerId, petId });

    const response = await createCombined({ invoiceIds: [first, second] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('AMOUNT_BELOW_GATEWAY_MINIMUM');
    await expectNothingHappened();
  });

  it('rejects an empty list at the schema boundary', async () => {
    const response = await createCombined({ invoiceIds: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('writes nothing when the gateway rejects the link', async () => {
    const [first, second] = await twoForOneOwner();
    holder.current.paymentLink.create = vi.fn(async () => {
      throw {
        statusCode: 400,
        error: { code: 'BAD_REQUEST_ERROR', description: 'Amount exceeds maximum permitted' },
      };
    }) as unknown as RazorpayMock['paymentLink']['create'];

    const response = await createCombined({ invoiceIds: [first, second] });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    expect(await prisma.payment.count({ where: { clinicId } })).toBe(0);
  });
});

describe('POST /billing/payment-links — authorization', () => {
  it('403s for a user without MANAGE_PAYMENTS', async () => {
    const [first, second] = await twoForOneOwner();

    const response = await createCombined({ invoiceIds: [first, second] }, clinicianToken);

    expect(response.status).toBe(403);
    expect(await prisma.payment.count({ where: { clinicId } })).toBe(0);
  });

  it('401s without a token', async () => {
    const [first, second] = await twoForOneOwner();

    const response = await request(app.server)
      .post('/api/v1/billing/payment-links')
      .send({ invoiceIds: [first, second] });

    expect(response.status).toBe(401);
  });
});

describe('Combined link end to end — creation through webhook fan-out (D-39)', () => {
  it('settles every invoice in the group from one payment_link.paid', async () => {
    const [first, second] = await twoForOneOwner(50000, 30000);

    const created = await createCombined({ invoiceIds: [first, second] });
    expect(created.status).toBe(200);
    const { paymentLinkId, amountPaise } = created.body.data;
    expect(amountPaise).toBe(80000);

    // A genuinely signed event for the link the endpoint just created — the
    // reference_id and notes are the ones our own service sent to Razorpay.
    const sentNotes = (
      holder.current.paymentLink.create.mock.calls[0][0] as {
        notes: Record<string, string>;
        reference_id: string;
      }
    );
    const body = paymentLinkPaidWebhookFixture({
      referenceId: sentNotes.reference_id,
      paymentLinkId,
      amountPaid: 80000,
      notes: sentNotes,
    });
    const raw = JSON.stringify(body);

    const delivered = await request(app.server)
      .post(`/api/v1/webhooks/razorpay/${webhookToken}`)
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', signWebhookPayload(raw, WEBHOOK_SECRET))
      .set('x-razorpay-event-id', `evt_${randomUUID()}`)
      .send(raw);
    expect(delivered.status).toBe(200);

    const event = await prisma.webhookEvent.findFirstOrThrow({
      where: { clinicId },
      orderBy: { receivedAt: 'desc' },
    });
    await applyWebhookEvent(prisma, null, event.id);

    // Both invoices settled from the single event — the whole point of D-39.
    for (const id of [first, second]) {
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(invoice.status).toBe('PAID');
      expect(invoice.balancePaise).toBe(0);
      expect(invoice.exceptionFlag).toBeNull();
    }

    const payments = await prisma.payment.findMany({ where: { clinicId } });
    expect(payments).toHaveLength(2);
    expect(payments.every((p) => p.status === 'captured')).toBe(true);
    expect(payments.reduce((sum, p) => sum + p.amountPaise, 0)).toBe(80000);

    // D-13: a receipt per invoice, not one for the group. The owner is paying
    // two invoices and the clinic's books record two settlements.
    const receipts = await prisma.paymentReceipt.findMany({ where: { clinicId } });
    expect(receipts).toHaveLength(2);
    expect(new Set(receipts.map((r) => r.invoiceId))).toEqual(new Set([first, second]));
  });
});
