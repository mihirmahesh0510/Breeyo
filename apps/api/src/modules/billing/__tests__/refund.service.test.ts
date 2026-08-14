import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRazorpayMock, type RazorpayMock } from './razorpay-mock.js';

/**
 * Refunds against mocked collaborators — the `payment.service.test.ts` style.
 *
 * The assertions that matter are about the BOUND and the STATUS we write, not
 * about the fixture the gateway hands back:
 *
 *  * the bound is `Σ captured payments − Σ (pending + processed) refunds`,
 *    evaluated on the transaction handle that holds the `FOR UPDATE` lock;
 *  * a digital leg is inserted `pending` and stays `pending` even though the
 *    SDK call resolved. Only plan 06-10's `refund.processed` handler may move
 *    it on. A test that asserted on the SDK's own `status: 'processed'` fixture
 *    would pass while the service marked money returned that Razorpay has not
 *    yet settled — the refund-side twin of T-06-50.
 *
 * `getRazorpayForClinic` is the only thing stubbed out of `razorpay.client.js`;
 * `normalizeRazorpayError` runs for real, because the 502 mapping is one of the
 * behaviours under test.
 */

const rzpMockHolder: { current: RazorpayMock } = { current: buildRazorpayMock() };

vi.mock('../razorpay.client.js', async () => {
  const actual =
    await vi.importActual<typeof import('../razorpay.client.js')>('../razorpay.client.js');
  return {
    ...actual,
    getRazorpayForClinic: vi.fn(() => rzpMockHolder.current),
  };
});

const { RefundService } = await import('../refund.service.js');

const CLINIC = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const CASH_PAYMENT = '33333333-3333-4333-8333-333333333333';
const DIGITAL_PAYMENT = '44444444-4444-4444-8444-444444444444';

const ACTOR = { userId: 'user-1', userName: 'Front Desk' };

type Row = Record<string, unknown>;

function lockedRow(overrides: Row = {}) {
  return {
    id: INVOICE,
    status: 'PAID',
    grand_total_paise: 50000,
    balance_paise: 0,
    exception_flag: null,
    invoice_number: 'INV-202608-0001',
    ...overrides,
  };
}

function cashLeg(amountPaise = 50000): Row {
  return {
    id: CASH_PAYMENT,
    method: 'cash',
    channel: 'manual',
    amountPaise,
    status: 'captured',
    razorpayPaymentId: null,
  };
}

function digitalLeg(amountPaise = 50000): Row {
  return {
    id: DIGITAL_PAYMENT,
    method: 'upi',
    channel: 'razorpay',
    amountPaise,
    status: 'captured',
    razorpayPaymentId: 'pay_test_abc123',
  };
}

function build(
  options: {
    invoice?: Row | null;
    payments?: Row[];
    refunds?: Row[];
  } = {},
) {
  rzpMockHolder.current = buildRazorpayMock();

  const invoice = options.invoice === null ? null : lockedRow(options.invoice ?? {});
  const payments = options.payments ?? [cashLeg()];
  const refunds = options.refunds ?? [];

  let created = 0;

  const tx = {
    $queryRaw: vi.fn(async (_query: unknown) => (invoice ? [invoice] : [])),
    payment: {
      findMany: vi.fn(async () => payments),
      findFirst: vi.fn(async () => payments[0] ?? null),
    },
    refund: {
      findMany: vi.fn(async () => refunds),
      create: vi.fn(async ({ data }: { data: Row }) => {
        created += 1;
        return { id: `refund-${created}`, razorpayRefundId: null, processedAt: null, ...data };
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => ({
        id: where.id,
        ...data,
      })),
    },
    clinic: {
      findFirst: vi.fn(async () => ({
        id: CLINIC,
        razorpayKeyId: 'rzp_test_key',
        razorpayKeySecretEnc: 'v1.aa.bb.cc',
        razorpayTestMode: true,
      })),
    },
    billingAuditLog: {
      create: vi.fn(async (_args: { data: Row }) => ({})),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    invoice: { findFirst: vi.fn(async () => (invoice ? { id: INVOICE, status: invoice.status } : null)) },
    payment: { findMany: vi.fn(async () => payments) },
    refund: { findMany: vi.fn(async () => refunds) },
  };

  const repository = {
    recomputePaymentState: vi.fn(async () => undefined),
    getInvoiceDetail: vi.fn(async () => ({ id: INVOICE, status: 'PAID', balancePaise: 50000 })),
  };

  const service = new RefundService(repository as never, prisma as never);
  return { service, repository, prisma, tx, rzp: rzpMockHolder.current };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RefundService.createRefund — the bound (T-06-66, T-06-67)', () => {
  it('refunds the full captured amount on a cash-paid invoice without calling the SDK', async () => {
    const { service, tx, rzp } = build({ payments: [cashLeg(50000)] });

    const result = await service.createRefund(CLINIC, INVOICE, ACTOR, {
      type: 'full',
      amountPaise: 50000,
    });

    expect(tx.refund.create).toHaveBeenCalledTimes(1);
    const data = tx.refund.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      clinicId: CLINIC,
      invoiceId: INVOICE,
      paymentId: CASH_PAYMENT,
      method: 'cash',
      status: 'processed',
      amountPaise: 50000,
    });
    // Cash in hand is settled the moment it is handed back across the counter.
    expect(data.processedAt).toBeInstanceOf(Date);
    expect(rzp.payments.refund).not.toHaveBeenCalled();
    expect(result.refunds).toHaveLength(1);
    expect(result.totalRefundedPaise).toBe(50000);
  });

  it('rejects a second partial refund that would breach the captured total', async () => {
    const { service, tx } = build({
      payments: [cashLeg(50000)],
      refunds: [{ id: 'r1', paymentId: CASH_PAYMENT, amountPaise: 20000, status: 'processed' }],
    });

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'partial', amountPaise: 40000 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'REFUND_EXCEEDS_PAID' });

    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('counts a PENDING refund against the bound, not just a processed one (T-06-67)', async () => {
    const { service, tx } = build({
      payments: [digitalLeg(50000)],
      // Still awaiting `refund.processed`. If the subtrahend counted only
      // processed refunds, this second request would pass and the invoice would
      // be refunded twice.
      refunds: [{ id: 'r1', paymentId: DIGITAL_PAYMENT, amountPaise: 30000, status: 'pending' }],
    });

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'partial', amountPaise: 30000 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'REFUND_EXCEEDS_PAID' });

    expect(tx.refund.create).not.toHaveBeenCalled();

    // The bound was read on the locked handle, not optimistically outside it.
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(String(tx.$queryRaw.mock.calls[0][0])).toBeTruthy();
  });

  it('rejects a refund on an invoice with nothing captured, before touching the SDK', async () => {
    const { service, rzp, tx } = build({ payments: [] });

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 10000 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'REFUND_EXCEEDS_PAID' });

    expect(rzp.payments.refund).not.toHaveBeenCalled();
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('refuses a DRAFT invoice and refuses a VOIDED one', async () => {
    for (const status of ['DRAFT', 'VOIDED']) {
      const { service } = build({ invoice: { status } });

      await expect(
        service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 10000 }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION' });
    }
  });

  it('bounds by captured payments even when the invoice balance is negative (D-36)', async () => {
    // An overpaid invoice: two legs both settled, balance below zero. The bound
    // is Σ captured − Σ refunds and never reads `balance_paise`, so the
    // overpayment is fully refundable rather than unreachable.
    const { service, tx } = build({
      invoice: { balance_paise: -20000, exception_flag: 'overpayment' },
      payments: [cashLeg(70000)],
    });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'partial', amountPaise: 70000 });

    expect(tx.refund.create).toHaveBeenCalledTimes(1);
    expect(tx.refund.create.mock.calls[0][0].data.amountPaise).toBe(70000);
  });
});

describe('RefundService.createRefund — digital legs settle asynchronously (T-06-68)', () => {
  it('inserts the refund PENDING and leaves it pending even though the SDK resolved', async () => {
    const { service, tx, rzp } = build({ payments: [digitalLeg(50000)] });

    const result = await service.createRefund(CLINIC, INVOICE, ACTOR, {
      type: 'full',
      amountPaise: 50000,
    });

    const data = tx.refund.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ method: 'razorpay', status: 'pending', amountPaise: 50000 });
    expect(data.processedAt).toBeUndefined();

    // The SDK fixture comes back `status: 'processed'`. Believing it is the bug.
    expect(rzp.payments.refund).toHaveBeenCalledTimes(1);
    expect(result.refunds[0].status).toBe('pending');

    // Only the gateway id is written back — never the status.
    const update = tx.refund.update.mock.calls[0][0];
    expect(update.data).toHaveProperty('razorpayRefundId');
    expect(update.data).not.toHaveProperty('status');
    expect(update.data).not.toHaveProperty('processedAt');
  });

  it('sends the amount, normal speed and our own refund id as the receipt', async () => {
    const { service, rzp } = build({ payments: [digitalLeg(50000)] });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 });

    const [paymentId, params] = rzp.payments.refund.mock.calls[0] as [string, Record<string, unknown>];
    expect(paymentId).toBe('pay_test_abc123');
    expect(params.amount).toBe(50000);
    expect(params.speed).toBe('normal');
    // Traceability both ways: the webhook can match on `receipt` even if the
    // `razorpayRefundId` write-back never landed.
    expect(params.receipt).toBe('refund-1');
    expect(params.notes).toMatchObject({ clinicId: CLINIC, invoiceId: INVOICE });
  });

  it('surfaces an SDK rejection as 502 PAYMENT_GATEWAY_ERROR and rolls the insert back', async () => {
    const { service, prisma } = build({ payments: [digitalLeg(50000)] });
    rzpMockHolder.current.payments.refund = vi.fn(async () => {
      throw {
        statusCode: 400,
        error: { code: 'BAD_REQUEST_ERROR', description: 'The refund amount is greater than payment amount' },
      };
    }) as unknown as RazorpayMock['payments']['refund'];

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'PAYMENT_GATEWAY_ERROR' });

    // The throw propagated out of the transaction callback, so the pending
    // Refund insert rolls back with it.
    await expect(prisma.$transaction.mock.results[0].value).rejects.toBeTruthy();
  });

  it('refuses a digital leg that never captured a gateway payment id', async () => {
    const { service } = build({
      payments: [{ ...digitalLeg(50000), razorpayPaymentId: null }],
    });

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'PAYMENT_NOT_REFUNDABLE' });
  });
});

describe('RefundService.createRefund — split legs (D-12, D-42)', () => {
  it('splits a whole-invoice refund across both legs in proportion to what each captured', async () => {
    const { service, tx } = build({
      payments: [cashLeg(100000), digitalLeg(50000)],
      invoice: { grand_total_paise: 150000 },
    });

    const result = await service.createRefund(CLINIC, INVOICE, ACTOR, {
      type: 'full',
      amountPaise: 150000,
    });

    expect(tx.refund.create).toHaveBeenCalledTimes(2);
    const rows = tx.refund.create.mock.calls.map((call) => call[0].data);

    const cash = rows.find((r) => r.method === 'cash');
    const digital = rows.find((r) => r.method === 'razorpay');

    expect(cash).toMatchObject({ amountPaise: 100000, status: 'processed', paymentId: CASH_PAYMENT });
    expect(digital).toMatchObject({ amountPaise: 50000, status: 'pending', paymentId: DIGITAL_PAYMENT });

    // Remainder-exact: the legs sum to exactly what was asked for.
    expect(rows.reduce((sum, r) => sum + (r.amountPaise as number), 0)).toBe(150000);
    expect(result.refunds).toHaveLength(2);
  });

  it('allocates an odd partial amount remainder-exactly across the legs', async () => {
    const { service, tx } = build({
      payments: [cashLeg(100000), digitalLeg(50000)],
      invoice: { grand_total_paise: 150000 },
    });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'partial', amountPaise: 10001 });

    const rows = tx.refund.create.mock.calls.map((call) => call[0].data);
    expect(rows.reduce((sum, r) => sum + (r.amountPaise as number), 0)).toBe(10001);
  });

  it('D-42: refunds only the cash leg when that payment is named', async () => {
    const { service, tx, rzp } = build({
      payments: [cashLeg(100000), digitalLeg(50000)],
      invoice: { grand_total_paise: 150000 },
    });

    await service.createRefund(CLINIC, INVOICE, ACTOR, {
      type: 'partial',
      amountPaise: 100000,
      paymentId: CASH_PAYMENT,
    });

    expect(tx.refund.create).toHaveBeenCalledTimes(1);
    expect(tx.refund.create.mock.calls[0][0].data).toMatchObject({
      paymentId: CASH_PAYMENT,
      method: 'cash',
      status: 'processed',
    });
    expect(rzp.payments.refund).not.toHaveBeenCalled();
  });

  it('D-42: refunds only the digital leg when that payment is named', async () => {
    const { service, tx, rzp } = build({
      payments: [cashLeg(100000), digitalLeg(50000)],
      invoice: { grand_total_paise: 150000 },
    });

    await service.createRefund(CLINIC, INVOICE, ACTOR, {
      type: 'partial',
      amountPaise: 50000,
      paymentId: DIGITAL_PAYMENT,
    });

    expect(tx.refund.create).toHaveBeenCalledTimes(1);
    expect(tx.refund.create.mock.calls[0][0].data).toMatchObject({
      paymentId: DIGITAL_PAYMENT,
      method: 'razorpay',
      status: 'pending',
    });
    expect(rzp.payments.refund).toHaveBeenCalledTimes(1);
  });

  it('bounds a named leg by that leg alone, not by the invoice total', async () => {
    const { service } = build({
      payments: [cashLeg(100000), digitalLeg(50000)],
      invoice: { grand_total_paise: 150000 },
    });

    // 120000 is well inside the invoice's captured 150000, but the digital leg
    // only ever took 50000 and Razorpay cannot return more than it collected.
    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, {
        type: 'partial',
        amountPaise: 120000,
        paymentId: DIGITAL_PAYMENT,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'REFUND_EXCEEDS_PAID' });
  });

  it('404s a payment id belonging to another invoice', async () => {
    const { service } = build({ payments: [cashLeg(50000)] });

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, {
        type: 'partial',
        amountPaise: 1000,
        paymentId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
  });
});

describe('RefundService — derivation and audit (T-06-74)', () => {
  it('derives the invoice money state and audits inside the same transaction', async () => {
    const { service, repository, tx, prisma } = build({ payments: [cashLeg(50000)] });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 });

    expect(repository.recomputePaymentState).toHaveBeenCalledWith(tx, CLINIC, INVOICE);
    expect(tx.billingAuditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.billingAuditLog.create.mock.calls[0][0].data).toMatchObject({
      clinicId: CLINIC,
      invoiceId: INVOICE,
      event: 'REFUND_INITIATED',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('never assigns an invoice status — D-20 has no REFUNDED state', async () => {
    const { service, tx } = build({ payments: [cashLeg(50000)] });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 });

    // The service holds no `invoice.update` at all; the reducer owns the status.
    expect(tx).not.toHaveProperty('invoice');
  });

  it('reports the refundable amount and the per-leg breakdown for the mobile sheet', async () => {
    const { service } = build({
      payments: [cashLeg(100000), digitalLeg(50000)],
      refunds: [{ id: 'r1', paymentId: CASH_PAYMENT, amountPaise: 20000, status: 'pending' }],
    });

    const summary = await service.getRefundableSummary(CLINIC, INVOICE);

    expect(summary.refundablePaise).toBe(130000);
    expect(summary.legs).toHaveLength(2);
    expect(summary.legs.find((l) => l.paymentId === CASH_PAYMENT)).toMatchObject({
      capturedPaise: 100000,
      refundedPaise: 20000,
      refundablePaise: 80000,
    });
  });
});
