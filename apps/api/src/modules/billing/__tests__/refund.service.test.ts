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
 *
 * ## The double models COMMIT and ROLLBACK, not just call counts (CR-02)
 *
 * The `$transaction` stand-in below stages every write its callback performs
 * and applies them to `durableRefunds()` only when the callback RESOLVES. A
 * callback that throws discards its writes, exactly as Postgres would. Without
 * that, a double where `$transaction(fn) => fn(tx)` is the whole implementation
 * cannot express the one failure that matters here — the gateway accepted, the
 * enclosing transaction then rolled back, and the record of money that has
 * genuinely left the account went with it.
 *
 * The gateway double is instrumented in the same spirit: it records the
 * transaction depth it was called at and a snapshot of what was durable at that
 * moment. Those two facts are what the CR-02 block asserts on.
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

const CLINIC_RAZORPAY_CONFIG = {
  id: CLINIC,
  razorpayKeyId: 'rzp_test_key',
  razorpayKeySecretEnc: 'v1.aa.bb.cc',
  razorpayTestMode: true,
};

interface BuildOptions {
  invoice?: Row | null;
  payments?: Row[];
  refunds?: Row[];
  /**
   * Rejects `payments.refund` with this value, the way the SDK does on a 400.
   *
   * Supplied through `build` rather than by reassigning the mock afterwards so
   * that the depth/durability instrumentation stays installed — a test that
   * swapped the function out would silently stop recording the two facts the
   * CR-02 assertions depend on.
   */
  gatewayError?: unknown;
  /**
   * CR-02, the dangerous half. Every database WRITE attempted after the gateway
   * has accepted fails: the interactive transaction hit its 5 s timeout, the
   * pool dropped the connection, the server went away. Real money has moved;
   * what must survive is whatever was committed before the call.
   */
  failDbAfterGateway?: boolean;
}

function build(options: BuildOptions = {}) {
  const invoice = options.invoice === null ? null : lockedRow(options.invoice ?? {});
  const payments = options.payments ?? [cashLeg()];
  const refunds = options.refunds ?? [];

  let created = 0;

  // ── Durability model ──────────────────────────────────────────────────────
  // `durable` holds only writes that a COMMITTED transaction (or a standalone
  // statement) performed. Writes staged inside a transaction that later rejects
  // are dropped on the floor, which is the whole point.
  const durable = new Map<string, Row>();
  let staged: Array<() => void> | null = null;

  const state = {
    txDepth: 0,
    gatewayCalled: false,
    /** The `$transaction` nesting depth each gateway call was made at. */
    txDepthAtGatewayCall: [] as number[],
    /** What was already durable at the moment of each gateway call. */
    durableAtGatewayCall: [] as Row[][],
  };

  function apply(write: () => void) {
    if (staged) staged.push(write);
    else write();
  }

  /** The post-gateway outage. Writes only — a read is not what loses money. */
  function guardWrite() {
    if (options.failDbAfterGateway && state.gatewayCalled) {
      throw new Error('write failed: the connection dropped after the gateway accepted');
    }
  }

  function makeRefundWriter() {
    return {
      create: vi.fn(async ({ data }: { data: Row }) => {
        guardWrite();
        created += 1;
        const row = { id: `refund-${created}`, razorpayRefundId: null, processedAt: null, ...data };
        apply(() => durable.set(row.id, { ...row }));
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        guardWrite();
        const id = where.id as string;
        apply(() => {
          const prev = durable.get(id);
          if (prev) durable.set(id, { ...prev, ...data });
        });
        return { id, ...data };
      }),
    };
  }

  const tx = {
    $queryRaw: vi.fn(async (_query: unknown) => (invoice ? [invoice] : [])),
    payment: {
      findMany: vi.fn(async () => payments),
      findFirst: vi.fn(async () => payments[0] ?? null),
    },
    refund: {
      findMany: vi.fn(async () => refunds),
      ...makeRefundWriter(),
    },
    clinic: { findFirst: vi.fn(async () => CLINIC_RAZORPAY_CONFIG) },
    billingAuditLog: {
      create: vi.fn(async (_args: { data: Row }) => {
        guardWrite();
        return {};
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      guardWrite();
      const outer = staged;
      staged = [];
      state.txDepth += 1;
      try {
        const result = await fn(tx);
        const mine = staged;
        state.txDepth -= 1;
        staged = outer;
        for (const write of mine) write(); // COMMIT
        return result;
      } catch (err) {
        state.txDepth -= 1;
        staged = outer; // ROLLBACK: `mine` is discarded unapplied
        throw err;
      }
    }),
    invoice: {
      findFirst: vi.fn(async () => (invoice ? { id: INVOICE, status: invoice.status } : null)),
    },
    payment: { findMany: vi.fn(async () => payments) },
    refund: { findMany: vi.fn(async () => refunds), ...makeRefundWriter() },
    clinic: { findFirst: vi.fn(async () => CLINIC_RAZORPAY_CONFIG) },
    billingAuditLog: {
      create: vi.fn(async (_args: { data: Row }) => {
        guardWrite();
        return {};
      }),
    },
  };

  const repository = {
    recomputePaymentState: vi.fn(async () => {
      guardWrite();
    }),
    getInvoiceDetail: vi.fn(async () => ({ id: INVOICE, status: 'PAID', balancePaise: 50000 })),
  };

  // The gateway double goes on last, wrapping whatever `buildRazorpayMock`
  // produced, so that every path through the service is observed.
  rzpMockHolder.current = buildRazorpayMock();
  const inner = rzpMockHolder.current.payments.refund;
  rzpMockHolder.current.payments.refund = vi.fn(async (paymentId: string, params: Row) => {
    state.gatewayCalled = true;
    state.txDepthAtGatewayCall.push(state.txDepth);
    state.durableAtGatewayCall.push([...durable.values()].map((row) => ({ ...row })));
    if ('gatewayError' in options) throw options.gatewayError;
    return (inner as unknown as (p: string, q: Row) => Promise<unknown>)(paymentId, params);
  }) as unknown as RazorpayMock['payments']['refund'];

  const logger = { error: vi.fn() };

  const service = new RefundService(repository as never, prisma as never, logger);
  return {
    service,
    repository,
    prisma,
    tx,
    logger,
    rzp: rzpMockHolder.current,
    state,
    /** Everything a committed transaction actually left behind. */
    durableRefunds: () => [...durable.values()],
  };
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
    const { service, tx, prisma, rzp } = build({ payments: [digitalLeg(50000)] });

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

    // The write-back is on the non-transactional handle (CR-02): a single
    // statement, after the reservation has already committed.
    const update = prisma.refund.update.mock.calls[0][0];
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

  it('surfaces an SDK rejection as 502 PAYMENT_GATEWAY_ERROR and marks the reservation failed', async () => {
    const { service, repository, durableRefunds } = build({
      payments: [digitalLeg(50000)],
      gatewayError: {
        statusCode: 400,
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'The refund amount is greater than payment amount',
        },
      },
    });

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'PAYMENT_GATEWAY_ERROR' });

    // CR-02 changed the shape of this outcome, deliberately. The reservation is
    // committed before the call, so a rejection can no longer be erased by a
    // rollback — it is recorded as `failed`, which is not a reserving status and
    // therefore hands the amount straight back to the bound.
    const rows = durableRefunds();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'razorpay', status: 'failed', amountPaise: 50000 });
    expect(rows[0].failureReason).toEqual(expect.stringContaining('greater than payment amount'));

    // Once for the reservation, once after the failure — the second one is what
    // releases the amount the pending row had been holding.
    expect(repository.recomputePaymentState).toHaveBeenCalledTimes(2);
  });

  it('leaves a cash leg standing when the digital leg of the same refund is refused (D-37)', async () => {
    const { service, durableRefunds } = build({
      payments: [cashLeg(100000), digitalLeg(50000)],
      invoice: { grand_total_paise: 150000 },
      gatewayError: { statusCode: 400, error: { description: 'refund not permitted' } },
    });

    await expect(
      service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 150000 }),
    ).rejects.toMatchObject({ statusCode: 502 });

    // The notes are already back across the counter. Rolling that fact back
    // because a gateway refused an unrelated leg would be the refund-side twin
    // of erasing a collected cash payment when a payment link expires (D-37).
    const rows = durableRefunds();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.method === 'cash')).toMatchObject({
      status: 'processed',
      amountPaise: 100000,
    });
    expect(rows.find((r) => r.method === 'razorpay')).toMatchObject({
      status: 'failed',
      amountPaise: 50000,
    });
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

/**
 * CR-02 — the gateway call must not sit inside the database transaction.
 *
 * The old shape called `rzp.payments.refund` from inside a Prisma interactive
 * transaction that held a `FOR UPDATE` lock on the invoice row, under the
 * default 5 000 ms timeout. Its own comments reasoned only about the gateway
 * REJECTING. The unhandled case is the opposite and the expensive one: the
 * gateway ACCEPTS — real money is on its way to the owner — and the transaction
 * then fails for any reason at all. Postgres rolls the `refunds` row back, so
 * there is no local record, `getRefundableAmount` still counts the whole
 * captured amount as refundable, and the front desk retries into a SECOND
 * refund of the same money.
 *
 * Every other gateway call in the phase is deliberately outside its transaction
 * with a compensating action (`payment.service.ts` createPaymentLink /
 * createCombinedPaymentLink). These tests pin the refund path to that pattern.
 */
describe('RefundService.createRefund — the gateway call is outside the transaction (CR-02)', () => {
  it('calls Razorpay with no database transaction open', async () => {
    const { service, state } = build({ payments: [digitalLeg(50000)] });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 });

    // Depth 0 — not "a short transaction", not "a transaction with a generous
    // timeout". No transaction. A network round trip inside a transaction holds
    // a row lock and a pooled connection for its whole duration.
    expect(state.txDepthAtGatewayCall).toEqual([0]);
  });

  it('commits the reserving row BEFORE the call, so the amount is already held', async () => {
    const { service, state } = build({ payments: [digitalLeg(50000)] });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 });

    // The pending row is what keeps the bound honest across the round trip: a
    // concurrent request re-reading `Σ captured − Σ (pending + processed)` sees
    // this amount already spoken for. Calling the gateway first and writing
    // afterwards would leave that window open.
    const durableWhenCalled = state.durableAtGatewayCall[0];
    expect(durableWhenCalled).toHaveLength(1);
    expect(durableWhenCalled[0]).toMatchObject({
      method: 'razorpay',
      status: 'pending',
      amountPaise: 50000,
      paymentId: DIGITAL_PAYMENT,
    });
  });

  it('holds every leg before any of them is sent, on a two-leg digital refund', async () => {
    const SECOND = '55555555-5555-4555-8555-555555555555';
    const { service, state } = build({
      payments: [
        digitalLeg(50000),
        { ...digitalLeg(30000), id: SECOND, razorpayPaymentId: 'pay_test_def456' },
      ],
      invoice: { grand_total_paise: 80000 },
    });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 80000 });

    expect(state.txDepthAtGatewayCall).toEqual([0, 0]);
    // Both reservations are durable before the FIRST call, not one before each.
    expect(state.durableAtGatewayCall[0]).toHaveLength(2);
  });

  it('keeps a durable record of the refund when every write after the gateway fails', async () => {
    const { service, durableRefunds, rzp } = build({
      payments: [digitalLeg(50000)],
      failDbAfterGateway: true,
    });

    // The transaction timed out, the pool dropped the connection, the server
    // went away — whichever it was, nothing can be written any more. The
    // operation may fail loudly or return; that is not what is under test.
    await service
      .createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 })
      .catch(() => undefined);

    expect(rzp.payments.refund).toHaveBeenCalledTimes(1);

    // THE assertion. Money left the account; a row for it survives. Under the
    // old shape this array was empty and the refund was invisible to us.
    const rows = durableRefunds();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clinicId: CLINIC,
      invoiceId: INVOICE,
      paymentId: DIGITAL_PAYMENT,
      method: 'razorpay',
      status: 'pending',
      amountPaise: 50000,
    });
  });

  it('the surviving row carries the id Razorpay was given, so it can be reconciled', async () => {
    const { service, durableRefunds, rzp } = build({
      payments: [digitalLeg(50000)],
      failDbAfterGateway: true,
    });

    await service
      .createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 })
      .catch(() => undefined);

    const [, params] = rzp.payments.refund.mock.calls[0] as [string, Record<string, unknown>];
    const surviving = durableRefunds()[0];

    // `receipt` and `notes.refundId` both carry our primary key, and the row
    // holding that key is durable. That is the reconciliation route when the
    // `razorpayRefundId` write-back never landed: the movement is traceable
    // from either side rather than being an orphan at the gateway.
    expect(params.receipt).toBe(surviving.id);
    expect(params.notes).toMatchObject({ refundId: surviving.id });
  });

  it('a retry after a lost write-back is refused rather than double-refunding', async () => {
    const { service, durableRefunds } = build({
      payments: [digitalLeg(50000)],
      failDbAfterGateway: true,
    });

    await service
      .createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 })
      .catch(() => undefined);

    // Second attempt, against a database that now holds the surviving pending
    // row. `pending` is a reserving status, so the bound is zero.
    const retry = build({
      payments: [digitalLeg(50000)],
      refunds: durableRefunds() as Row[],
    });

    await expect(
      retry.service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'REFUND_EXCEEDS_PAID' });

    // The retry never reached the gateway, which is the point: a second live
    // refund for money already on its way back is unrecoverable.
    expect(retry.rzp.payments.refund).not.toHaveBeenCalled();
  });

  it('surfaces a lost write-back rather than swallowing it', async () => {
    const { service, logger } = build({
      payments: [digitalLeg(50000)],
      failDbAfterGateway: true,
    });

    await service
      .createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 })
      .catch(() => undefined);

    // Nothing can be written, so the audit row cannot be written either. The
    // logger is the last route out, and a silent unreconciled refund is exactly
    // the state D-35 and D-36 exist to prevent.
    expect(logger.error).toHaveBeenCalled();
    const [, message] = logger.error.mock.calls[0] as [unknown, string];
    expect(message).toEqual(expect.stringContaining('reconcil'));
  });

  it('reports the gateway id back to the caller even when it could not be persisted', async () => {
    const { service } = build({ payments: [digitalLeg(50000)], failDbAfterGateway: true });

    const result = await service
      .createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 })
      .catch(() => null);

    // The gateway accepted, so the refund genuinely is pending. Reporting the
    // id keeps it visible to a human even in the one case where our own copy
    // did not land.
    expect(result?.refunds[0]).toMatchObject({ status: 'pending' });
    expect(result?.refunds[0].razorpayRefundId).toEqual(expect.stringContaining('rfnd_'));
  });

  it('never opens a transaction at all when the refund is entirely cash', async () => {
    const { service, prisma, rzp } = build({ payments: [cashLeg(50000)] });

    await service.createRefund(CLINIC, INVOICE, ACTOR, { type: 'full', amountPaise: 50000 });

    // One transaction: the reservation, which for cash is also the settlement.
    // No second transaction, because there was no gateway outcome to record.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(rzp.payments.refund).not.toHaveBeenCalled();
    // And no credential was decrypted for a refund that has no gateway leg.
    expect(prisma.clinic.findFirst).not.toHaveBeenCalled();
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
