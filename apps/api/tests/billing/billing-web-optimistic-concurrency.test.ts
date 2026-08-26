import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

/**
 * Verify-fix 10.10 (Plan 10-05, D-05): `BillingWorkbenchService.
 * assertInvoiceVersionCurrent`'s `expectedVersion` check used to be a
 * separate `findUnique` read, with the real write
 * (`PaymentService.recordCashPayment`) running several `await`s later --
 * the same check-then-act gap `web-queue.service.ts` had. Every pre-existing
 * test for this path mocked the Prisma delegate. This file fires two
 * GENUINELY concurrent HTTP requests (real listening server via
 * `buildTestApp`, real Postgres) sharing the same stale `expectedVersion`
 * against the same invoice, and asserts exactly one succeeds.
 *
 * `apps/api/vitest.config.ts` sets `fileParallelism: false`, so this file's
 * own concurrency has to come from `Promise.allSettled` inside one test,
 * same convention as `apps/api/tests/billing/finalize-stock.test.ts`'s
 * "two concurrent finalizes" race.
 */
let app: FastifyInstance;

let clinicId: string;
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

  const user = await createTestUser({ fullName: 'Billing Admin' });
  const clinic = await createTestClinic(user.id, { name: 'Billing Concurrency Clinic' });
  await createTestClinicMember(user.id, clinic.id, 'Admin');
  clinicId = clinic.id;
  token = (await createTestTokens(app, user.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

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

/** Creates and finalizes a manual invoice, returning its id and grand total. */
async function createFinalizedInvoice(unitPricePaise = 50000): Promise<{ invoiceId: string; grandTotalPaise: number }> {
  const draft = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth())
    .send({ source: 'manual', lineItems: [serviceLine(unitPricePaise)] });
  expect(draft.status).toBe(201);

  const finalized = await request(app.server)
    .post(`/api/v1/billing/invoices/${draft.body.data.id}/finalize`)
    .set(auth())
    .send({});
  expect(finalized.status).toBe(200);

  return { invoiceId: draft.body.data.id as string, grandTotalPaise: finalized.body.data.grandTotalPaise as number };
}

/** Reads the invoice's browser-visible `staleVersion` (== live `updatedAt` in ms) off the real workbench. */
async function readKnownVersion(invoiceId: string): Promise<number> {
  const workbenchRes = await request(app.server).get('/api/v1/billing/web/workbench').set(auth());
  expect(workbenchRes.status).toBe(200);
  const row = workbenchRes.body.data.unpaid.find((r: { id: string }) => r.id === invoiceId);
  expect(row).toBeTruthy();
  return row.changeMetadata.staleVersion as number;
}

describe('Browser billing write path: real concurrent stale-version race (verify-fix 10.10)', () => {
  it('resolves two genuinely concurrent collect-payment calls sharing the same expectedVersion to exactly one success and one real 409 conflict', async () => {
    const { invoiceId, grandTotalPaise } = await createFinalizedInvoice(50000);
    const expectedVersion = await readKnownVersion(invoiceId);

    // Two browser tabs, both still rendering the pre-payment version, both
    // fire "collect payment" at once. Before the fix this was a plain
    // read-then-write with no atomicity between the check and
    // `PaymentService.recordCashPayment` -- both could observe themselves as
    // current and both apply, double-collecting cash that was never taken.
    const [first, second] = await Promise.allSettled([
      request(app.server)
        .post(`/api/v1/billing/web/invoices/${invoiceId}/collect-payment`)
        .set(auth())
        .send({ amountPaise: grandTotalPaise, expectedVersion }),
      request(app.server)
        .post(`/api/v1/billing/web/invoices/${invoiceId}/collect-payment`)
        .set(auth())
        .send({ amountPaise: grandTotalPaise, expectedVersion }),
    ]);

    const responses = [first, second].map((r) => (r.status === 'fulfilled' ? r.value : null));
    const statuses = responses.map((r) => r?.status ?? 0);

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    const conflictResponse = responses.find((r) => r?.status === 409);
    expect(conflictResponse?.body.error.code).toBe('STALE_WRITE_CONFLICT');
    // The `.conflict` payload must actually be on the wire.
    expect(conflictResponse?.body.error.conflict).toMatchObject({
      domain: 'billing',
      entityType: 'INVOICE',
      entityId: invoiceId,
      severity: 'OPERATIONAL',
    });
    expect(conflictResponse?.body.error.conflict.currentVersion).toBeGreaterThan(expectedVersion);

    // Exactly one cash payment was actually recorded -- not two.
    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(1);

    const finalInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(finalInvoice.status).toBe('PAID');
    expect(finalInvoice.balancePaise).toBe(0);
  });
});
