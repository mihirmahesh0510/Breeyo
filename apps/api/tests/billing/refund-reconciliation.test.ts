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
import { runRefundReconciliationSweep } from '../../src/jobs/refund-reconciliation.job.js';

/**
 * WR-3 — the poll-based fallback for a refund stuck `pending` because its
 * `refund.processed`/`refund.failed` webhook was never delivered.
 *
 * `refund.service.ts`'s `reserveDigitalLeg` writes a digital refund `pending`
 * and never touches it again by design; only the webhook completes it
 * (`webhook.worker.ts`). This suite drives the sweep directly — the same
 * shape as `webhook.test.ts` drives `applyWebhookEvent` directly — against a
 * real Postgres database and a doubled Razorpay SDK, and asserts the sweep
 * produces the IDENTICAL side effects the webhook handler's own tests assert
 * (row status, recomputed balance, one audit log entry).
 */

const PLAINTEXT_SECRET = 'test_secret_never_on_the_wire_recon0';
const TEST_KEY_ID = 'rzp_test_recon0000001';

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
let frontDeskId: string;
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
  holder.current = buildRazorpayMock();

  const frontDesk = await createTestUser({ fullName: 'Front Desk' });
  frontDeskId = frontDesk.id;

  const clinic = await createTestClinic(frontDesk.id, {
    name: 'Reconciliation Clinic',
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecretEnc: encryptSecret(PLAINTEXT_SECRET),
  });
  clinicId = clinic.id;

  await createTestClinicMember(frontDesk.id, clinic.id, 'FrontDesk');
  token = (await createTestTokens(app, frontDesk.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createFinalizedInvoice(unitPricePaise = 50000): Promise<string> {
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
 * A digital refund exactly as `reserveDigitalLeg` leaves it — `pending`, a
 * `razorpayRefundId` set — with `createdAt` backdated so the sweep's
 * staleness predicate can be exercised without waiting thirty real minutes.
 */
async function seedPendingRefund(
  invoiceId: string,
  options: { razorpayRefundId: string; amountPaise?: number; minutesOld?: number },
) {
  return prisma.refund.create({
    data: {
      clinicId,
      invoiceId,
      method: 'razorpay',
      amountPaise: options.amountPaise ?? 50000,
      status: 'pending',
      razorpayRefundId: options.razorpayRefundId,
      createdById: frontDeskId,
      createdAt: new Date(Date.now() - (options.minutesOld ?? 45) * 60_000),
    },
  });
}

describe('runRefundReconciliationSweep (WR-3)', () => {
  it('reconciles a stale-pending refund to processed and triggers the same side effects as the webhook path', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const cashLeg = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: 50000 });
    expect(cashLeg.status).toBe(200);

    const refund = await seedPendingRefund(invoiceId, { razorpayRefundId: 'rfnd_test_recon_ok' });
    holder.current.refunds.fetch = vi.fn(async (id: string) => ({ id, status: 'processed' }));

    const count = await runRefundReconciliationSweep(prisma, null);

    expect(count).toBe(1);
    expect(holder.current.refunds.fetch).toHaveBeenCalledWith('rfnd_test_recon_ok');

    const applied = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(applied.status).toBe('processed');
    expect(applied.processedAt).not.toBeNull();

    // Same recompute the webhook handler triggers: a processed refund gives
    // the cash back out of the balance.
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.amountPaidPaise).toBe(0);
    expect(invoice.balancePaise).toBe(50000);

    // Same audit trail as `webhook.test.ts`'s "applies refund.processed" case.
    const audit = await prisma.billingAuditLog.findMany({
      where: { clinicId, invoiceId, event: 'REFUND_PROCESSED' },
    });
    expect(audit).toHaveLength(1);
  });

  it('reconciles a stale-pending refund to failed and records the audit trail', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const refund = await seedPendingRefund(invoiceId, { razorpayRefundId: 'rfnd_test_recon_fail' });
    holder.current.refunds.fetch = vi.fn(async (id: string) => ({ id, status: 'failed' }));

    const count = await runRefundReconciliationSweep(prisma, null);

    expect(count).toBe(1);

    const applied = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(applied.status).toBe('failed');
    expect(applied.failureReason).toBeTruthy();

    expect(
      await prisma.billingAuditLog.count({ where: { clinicId, invoiceId, event: 'REFUND_FAILED' } }),
    ).toBe(1);
  });

  it('does not touch a pending refund still inside the staleness window', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const refund = await seedPendingRefund(invoiceId, {
      razorpayRefundId: 'rfnd_test_recon_fresh',
      minutesOld: 5,
    });
    holder.current.refunds.fetch = vi.fn(async (id: string) => ({ id, status: 'processed' }));

    const count = await runRefundReconciliationSweep(prisma, null);

    expect(count).toBe(0);
    expect(holder.current.refunds.fetch).not.toHaveBeenCalled();

    const untouched = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(untouched.status).toBe('pending');
  });

  it('does not touch a refund that has already been processed', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const refund = await prisma.refund.create({
      data: {
        clinicId,
        invoiceId,
        method: 'razorpay',
        amountPaise: 50000,
        status: 'processed',
        processedAt: new Date(),
        razorpayRefundId: 'rfnd_test_recon_already',
        createdById: frontDeskId,
        createdAt: new Date(Date.now() - 60 * 60_000),
      },
    });
    holder.current.refunds.fetch = vi.fn(async (id: string) => ({ id, status: 'processed' }));

    const count = await runRefundReconciliationSweep(prisma, null);

    expect(count).toBe(0);
    expect(holder.current.refunds.fetch).not.toHaveBeenCalled();

    const untouched = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(untouched.status).toBe('processed');
  });

  it('leaves the row pending when Razorpay itself still reports pending', async () => {
    const invoiceId = await createFinalizedInvoice(50000);
    const refund = await seedPendingRefund(invoiceId, {
      razorpayRefundId: 'rfnd_test_recon_stillpending',
    });
    holder.current.refunds.fetch = vi.fn(async (id: string) => ({ id, status: 'pending' }));

    const count = await runRefundReconciliationSweep(prisma, null);

    expect(count).toBe(0);
    expect(holder.current.refunds.fetch).toHaveBeenCalledWith('rfnd_test_recon_stillpending');

    const untouched = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(untouched.status).toBe('pending');
  });
});
