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
import { createTenantClient } from '../../src/lib/prisma-rls.js';
import type { TenantPrismaClient } from '../../src/lib/prisma-rls.js';
import { StockMovementService } from '../../src/modules/inventory/stock-movement.service.js';
import { InvoiceRepository } from '../../src/modules/billing/invoice.repository.js';
import { InvoiceService } from '../../src/modules/billing/invoice.service.js';
import { StockValidatorService } from '../../src/modules/billing/stock-validator.service.js';

/**
 * The three findings of the Phase 6 close-out review that corrupt money or
 * documents rather than merely inconveniencing a caller.
 *
 *   * **CR-01** — a draft's invoice-level discount could never be cleared, and
 *     its absolute paise figure went stale the moment the line items moved. The
 *     stale figure is then FROZEN onto a permanent legal document by finalize.
 *   * **CR-03** — the line-item replacement inside `updateDraft` ran outside the
 *     header update's transaction, under no row lock, and with no `status`
 *     predicate of its own, so a PATCH racing a finalize could delete the frozen
 *     tax snapshot of an already-numbered invoice.
 *   * **CR-04** — `InvoiceService.markPaid` took no row lock and enforced no
 *     upper bound, contradicting the invariant `payment.service.ts` documents
 *     and enforces on every other collection path. Overshooting it drove the
 *     invoice into the D-36 overpayment exception state, which has no resolve
 *     endpoint (`deferred-items.md` #15) and therefore blocks void, refund,
 *     credit note and payment on that invoice permanently.
 *
 * Every assertion below is against the real database. The CR-03 race is
 * deterministic rather than sampled — see `withLineReplacementBarrier`.
 */

let app: FastifyInstance;

let clinicId: string;
let token: string;
let userId: string;

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
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const frontDeskUser = await createTestUser({ fullName: 'Front Desk' });
  userId = frontDeskUser.id;

  const clinic = await createTestClinic(frontDeskUser.id, { name: 'Critical Fix Clinic' });
  clinicId = clinic.id;

  await createTestClinicMember(frontDeskUser.id, clinic.id, 'FrontDesk');

  token = (await createTestTokens(app, frontDeskUser.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

const ACTOR = { userId: '', userName: 'Front Desk' };

/**
 * An exempt line, so the arithmetic in these tests is the discount arithmetic
 * and nothing else. Veterinary healthcare is exempt by law anyway (Notification
 * 12/2017-CT(R) Entry 46), so this is the ordinary case rather than a contrivance.
 */
function exemptLine(unitPricePaise: number, description = 'Consultation') {
  return {
    lineType: 'service',
    description,
    quantity: 1,
    unitPricePaise,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
  };
}

async function createDraft(body: Record<string, unknown>) {
  const response = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth())
    .send({ source: 'manual', ...body });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function finalize(invoiceId: string) {
  return request(app.server)
    .post(`/api/v1/billing/invoices/${invoiceId}/finalize`)
    .set(auth())
    .send({});
}

// ─── CR-01 ──────────────────────────────────────────────────────────────────

describe('CR-01 — invoice-level discount clearing and staleness', () => {
  it('clears the discount when the client explicitly sends null, rather than silently keeping it', async () => {
    const invoiceId = await createDraft({
      lineItems: [exemptLine(100_000)],
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 10,
    });

    const withDiscount = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(withDiscount.invoiceDiscountType).toBe('percent');
    expect(withDiscount.invoiceDiscountPaise).toBe(10_000);

    // `null` is the wire form of "remove this discount". Anything else — an
    // omitted key, a zero value — is indistinguishable from "leave it alone",
    // which is exactly the conflation that made the discount unremovable.
    const response = await request(app.server)
      .patch(`/api/v1/billing/invoices/${invoiceId}`)
      .set(auth())
      .send({ invoiceDiscountType: null, invoiceDiscountValue: null });

    expect(response.status).toBe(200);

    const cleared = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(cleared.invoiceDiscountType).toBeNull();
    expect(cleared.invoiceDiscountValue).toBeNull();
    expect(cleared.invoiceDiscountPaise).toBe(0);

    // And the cleared discount must survive into the permanent document.
    const finalized = await finalize(invoiceId);
    expect(finalized.status).toBe(200);

    const frozen = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(frozen.invoiceDiscountPaise).toBe(0);
    expect(frozen.grandTotalPaise).toBe(100_000);
  });

  it('recomputes the absolute discount when the line items move, so finalize cannot freeze a stale figure', async () => {
    // A 10% discount against a ₹1,000 base is ₹100.
    const invoiceId = await createDraft({
      lineItems: [exemptLine(100_000)],
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 10,
    });

    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(before.invoiceDiscountPaise).toBe(10_000);

    // The front desk edits the draft down to ₹200 without restating the
    // discount — the ordinary "I added the wrong line" correction.
    const patched = await request(app.server)
      .patch(`/api/v1/billing/invoices/${invoiceId}`)
      .set(auth())
      .send({ lineItems: [exemptLine(20_000)] });

    expect(patched.status).toBe(200);

    const afterEdit = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    // The intent (10%) is untouched; the DERIVED amount follows the new base.
    expect(afterEdit.invoiceDiscountType).toBe('percent');
    expect(afterEdit.invoiceDiscountValue).toBe(10);
    expect(afterEdit.subtotalPaise).toBe(20_000);
    // ₹100 against a ₹200 invoice would be a 50% discount, not the 10% the
    // clinic agreed to.
    expect(afterEdit.invoiceDiscountPaise).toBe(2_000);

    const finalized = await finalize(invoiceId);
    expect(finalized.status).toBe(200);

    const frozen = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(frozen.invoiceDiscountPaise).toBe(2_000);
    expect(frozen.taxableValuePaise).toBe(18_000);
    expect(frozen.grandTotalPaise).toBe(18_000);
  });

  it('recomputes a flat discount against the new base and never exceeds it', async () => {
    const invoiceId = await createDraft({
      lineItems: [exemptLine(100_000)],
      invoiceDiscountType: 'flat',
      invoiceDiscountValue: 30_000,
    });

    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).invoiceDiscountPaise,
    ).toBe(30_000);

    // The base drops below the flat amount. A discount larger than the invoice
    // would produce a negative taxable value and an invoice that cannot be
    // reported.
    const patched = await request(app.server)
      .patch(`/api/v1/billing/invoices/${invoiceId}`)
      .set(auth())
      .send({ lineItems: [exemptLine(20_000)] });
    expect(patched.status).toBe(200);

    const afterEdit = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(afterEdit.invoiceDiscountPaise).toBe(20_000);

    expect((await finalize(invoiceId)).status).toBe(200);

    const frozen = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(frozen.invoiceDiscountPaise).toBe(20_000);
    expect(frozen.grandTotalPaise).toBe(0);
  });

  it('leaves an untouched discount alone when the PATCH does not mention it', async () => {
    const invoiceId = await createDraft({
      lineItems: [exemptLine(100_000)],
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 10,
    });

    const patched = await request(app.server)
      .patch(`/api/v1/billing/invoices/${invoiceId}`)
      .set(auth())
      .send({ notes: 'Collected at the counter' });
    expect(patched.status).toBe(200);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(after.notes).toBe('Collected at the counter');
    // Omission is not clearing.
    expect(after.invoiceDiscountType).toBe('percent');
    expect(after.invoiceDiscountValue).toBe(10);
    expect(after.invoiceDiscountPaise).toBe(10_000);
  });
});

// ─── CR-03 ──────────────────────────────────────────────────────────────────

/**
 * Wraps a tenant handle so that the FIRST `invoiceLineItem.deleteMany` issued
 * inside an interactive transaction pauses and runs `hook` before proceeding.
 *
 * That call site is the exact instant CR-03 is about: the header has been
 * updated, the line items have not yet been replaced, and the question is
 * whether a concurrent finalize can slip through the gap. Sampling the race with
 * `Promise.all` cannot answer it — the gap in the defective code is a single
 * round trip and a finalize is a hundred times longer, so the interleaving that
 * corrupts data in production is unreachable by chance in a test. Forcing the
 * pause makes the answer deterministic in both directions: with the lock the
 * concurrent finalize blocks, without it the finalize completes and the
 * subsequent delete removes the frozen snapshot it just wrote.
 */
function withLineReplacementBarrier(
  db: TenantPrismaClient,
  hook: () => Promise<void>,
): TenantPrismaClient {
  let fired = false;

  const wrapLineItemDelegate = (delegate: Record<string, unknown>) =>
    new Proxy(delegate, {
      get(target, prop, receiver) {
        if (prop !== 'deleteMany') return Reflect.get(target, prop, receiver);
        const original = Reflect.get(target, prop, receiver) as (...args: unknown[]) => unknown;
        return async (...args: unknown[]) => {
          if (!fired) {
            fired = true;
            await hook();
          }
          return original.call(target, ...args);
        };
      },
    });

  const wrapHandle = (handle: Record<string, unknown>) =>
    new Proxy(handle, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'invoiceLineItem') {
          return wrapLineItemDelegate(value as Record<string, unknown>);
        }
        return value;
      },
    });

  return new Proxy(db as unknown as Record<string, unknown>, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        const original = Reflect.get(target, prop, receiver) as (
          fn: (tx: unknown) => Promise<unknown>,
          options?: unknown,
        ) => Promise<unknown>;
        return (fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
          original.call(target, (tx) => fn(wrapHandle(tx as Record<string, unknown>)), options);
      }
      if (prop === 'invoiceLineItem') {
        return wrapLineItemDelegate(Reflect.get(target, prop, receiver) as Record<string, unknown>);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as TenantPrismaClient;
}

function buildInvoiceService(db: TenantPrismaClient): InvoiceService {
  const stockValidator = new StockValidatorService(db, new StockMovementService(db));
  return new InvoiceService(new InvoiceRepository(db, stockValidator), stockValidator, db);
}

describe('CR-03 — updateDraft must not race a concurrent finalize', () => {
  it('holds the invoice under a row lock so a finalize cannot land between the header update and the line replacement', async () => {
    const invoiceId = await createDraft({ lineItems: [exemptLine(50_000, 'Original line')] });

    const actor = { ...ACTOR, userId };

    // The racing finalize runs on its own tenant handle, and therefore its own
    // pooled connection, exactly as a second HTTP request would.
    const finalizeService = buildInvoiceService(createTenantClient(clinicId));

    let racingFinalize: Promise<unknown> | null = null;
    let observed: 'finalize-slipped-through' | 'finalize-blocked' = 'finalize-blocked';

    const barrierClient = withLineReplacementBarrier(createTenantClient(clinicId), async () => {
      racingFinalize = finalizeService
        .finalize(clinicId, invoiceId, actor, {})
        .then(() => 'ok' as const)
        .catch((error: unknown) => error);

      observed = await Promise.race([
        racingFinalize.then(() => 'finalize-slipped-through' as const),
        new Promise<'finalize-blocked'>((resolve) => {
          setTimeout(() => resolve('finalize-blocked'), 1_500);
        }),
      ]);
    });

    const updateResult = await buildInvoiceService(barrierClient)
      .updateDraft(clinicId, invoiceId, actor, {
        lineItems: [exemptLine(11_111, 'Replaced A'), exemptLine(22_222, 'Replaced B')],
      })
      .then(() => 'ok' as const)
      .catch((error: unknown) => error);

    // Whatever happened, both operations must have settled before we assert.
    if (racingFinalize) await racingFinalize;

    // The concurrent finalize could not proceed while the update held the row.
    expect(observed).toBe('finalize-blocked');

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const lines = await prisma.invoiceLineItem.findMany({
      where: { invoiceId },
      orderBy: { sortOrder: 'asc' },
    });

    if (invoice.status === 'DRAFT') {
      // The update won and the finalize was rejected or rolled back. A draft
      // must carry no number and no frozen figures.
      expect(invoice.invoiceNumber).toBeNull();
      expect(invoice.finalizedAt).toBeNull();
      expect(updateResult).toBe('ok');
      expect(lines.map((l) => l.unitPricePaise)).toEqual([11_111, 22_222]);
      expect(invoice.subtotalPaise).toBe(33_333);
    } else {
      // The finalize won. Its frozen snapshot must still reconcile — the whole
      // point of CR-03 is that the replacement cannot delete it out from under
      // a numbered document.
      expect(invoice.invoiceNumber).not.toBeNull();
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.reduce((sum, l) => sum + l.lineTotalPaise, 0)).toBe(invoice.grandTotalPaise);
    }
  });

  it('rejects the update with a clear 409 when the invoice stops being a draft first', async () => {
    const invoiceId = await createDraft({ lineItems: [exemptLine(50_000)] });
    expect((await finalize(invoiceId)).status).toBe(200);

    const frozen = await prisma.invoiceLineItem.findMany({
      where: { invoiceId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(frozen).toHaveLength(1);

    const response = await request(app.server)
      .patch(`/api/v1/billing/invoices/${invoiceId}`)
      .set(auth())
      .send({ lineItems: [exemptLine(999_900)] });

    // A clear error, never a silent no-op and never a partial write.
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVOICE_NOT_DRAFT');

    const after = await prisma.invoiceLineItem.findMany({
      where: { invoiceId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(after.map((l) => l.id)).toEqual(frozen.map((l) => l.id));
    expect(after.map((l) => l.unitPricePaise)).toEqual(frozen.map((l) => l.unitPricePaise));
  });
});

// ─── CR-04 ──────────────────────────────────────────────────────────────────

describe('CR-04 — markPaid must be bounded by the outstanding balance', () => {
  it('rejects a mark-paid amount larger than the balance instead of manufacturing an overpayment', async () => {
    const invoiceId = await createDraft({ lineItems: [exemptLine(50_000)] });
    expect((await finalize(invoiceId)).status).toBe(200);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash', amountPaise: 60_000 });

    // The same guard `payment.service.ts` applies to every other collection
    // path. D-36's exception list is for races we cannot prevent; a figure typed
    // at the counter is one we can.
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.balancePaise).toBe(50_000);
    expect(invoice.amountPaidPaise).toBe(0);
    expect(invoice.status).not.toBe('PAID');
    // Critically: the invoice must NOT be left in the unresolvable D-36 state.
    // There is no resolve endpoint for it (deferred-items.md #15), so an invoice
    // that lands there can never be voided, refunded, credited or paid again.
    expect(invoice.exceptionFlag).toBeNull();

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(0);
  });

  it('rejects an amount that exceeds the REMAINING balance after a partial payment', async () => {
    const invoiceId = await createDraft({ lineItems: [exemptLine(50_000)] });
    expect((await finalize(invoiceId)).status).toBe(200);

    const partial = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash', amountPaise: 30_000 });
    expect(partial.status).toBe(200);

    const midway = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(midway.status).toBe('PARTIALLY_PAID');
    expect(midway.balancePaise).toBe(20_000);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash', amountPaise: 25_000 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(after.balancePaise).toBe(20_000);
    expect(after.exceptionFlag).toBeNull();
    expect(await prisma.payment.count({ where: { clinicId, invoiceId } })).toBe(1);
  });

  it('still settles the exact remaining balance, and derives PAID from the rows', async () => {
    const invoiceId = await createDraft({ lineItems: [exemptLine(50_000)] });
    expect((await finalize(invoiceId)).status).toBe(200);

    expect(
      (
        await request(app.server)
          .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
          .set(auth())
          .send({ method: 'cash', amountPaise: 30_000 })
      ).status,
    ).toBe(200);

    const settle = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash', amountPaise: 20_000 });
    expect(settle.status).toBe(200);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PAID');
    expect(invoice.balancePaise).toBe(0);
    expect(invoice.exceptionFlag).toBeNull();
  });

  it('serialises concurrent mark-paid calls so two full settlements cannot both land', async () => {
    const invoiceId = await createDraft({ lineItems: [exemptLine(50_000)] });
    expect((await finalize(invoiceId)).status).toBe(200);

    // Without the row lock both requests read a ₹500 balance, both write a ₹500
    // payment row, and the invoice ends ₹500 overpaid and permanently blocked.
    const [first, second] = await Promise.all([
      request(app.server)
        .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
        .set(auth())
        .send({ method: 'cash' }),
      request(app.server)
        .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
        .set(auth())
        .send({ method: 'cash' }),
    ]);

    // Both may return 200 — the second is the accepted PAID -> PAID no-op — but
    // the money must be right either way.
    expect([first.status, second.status].every((s) => s === 200 || s === 400)).toBe(true);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.amountPaidPaise).toBe(50_000);
    expect(invoice.balancePaise).toBe(0);
    expect(invoice.status).toBe('PAID');
    expect(invoice.exceptionFlag).toBeNull();

    const captured = await prisma.payment.findMany({
      where: { clinicId, invoiceId, status: 'captured' },
    });
    expect(captured.reduce((sum, p) => sum + p.amountPaise, 0)).toBe(50_000);
  });
});
