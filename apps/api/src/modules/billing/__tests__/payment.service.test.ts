import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRazorpayMock, type RazorpayMock } from './razorpay-mock.js';

/**
 * Payment collection against mocked collaborators — the `invoice.service.test.ts`
 * style.
 *
 * The assertions that matter here are the ones about what we SEND and what we
 * DERIVE, so they are made against `paymentLink.create.mock.calls[0][0]` rather
 * than against the fixture that comes back. A test that only inspects the
 * return value would pass while sending Razorpay a 15-minute `expire_by`, a
 * 44-character `reference_id` or an amount the client chose.
 *
 * `getRazorpayForClinic` is the only thing stubbed out of `razorpay.client.js`.
 * `toRazorpayExpiry` and `normalizeRazorpayError` run for real, because the
 * expiry buffer and the 502 mapping are two of the behaviours under test.
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

const { PaymentService } = await import('../payment.service.js');

const CLINIC = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const OWNER = '55555555-5555-4555-8555-555555555555';

const ACTOR = { userId: 'user-1', userName: 'Front Desk' };

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE,
    clinicId: CLINIC,
    status: 'UNPAID',
    invoiceNumber: 'INV-202608-0001',
    grandTotalPaise: 50000,
    balancePaise: 50000,
    amountPaidPaise: 0,
    exceptionFlag: null,
    ownerId: OWNER,
    petId: null,
    owner: { id: OWNER, name: 'Asha Rao', mobile: '+919812345678' },
    pet: { id: null, name: 'Rocky' },
    ...overrides,
  };
}

/**
 * The `FOR UPDATE` read is raw SQL, so it comes back with the database's own
 * snake_case column names rather than Prisma's camelCase mapping. The double
 * has to reproduce that: a camelCase fixture would leave every guard reading
 * `undefined`, and the over-payment and exception tests would pass while the
 * service silently collected money it should have refused.
 */
function lockedRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    grand_total_paise: row.grandTotalPaise,
    balance_paise: row.balancePaise,
    exception_flag: row.exceptionFlag,
    invoice_number: row.invoiceNumber,
  };
}

/**
 * The double's rows are deliberately loose. Narrowing them to the seed value
 * (`null`, `[]`) would make every per-test override a type error, and the
 * assertions are about arguments rather than row shapes.
 */
type Row = Record<string, unknown>;
type PrismaArgs = Record<string, never> | Record<string, unknown>;

/** Recovers the SQL text from either a `Prisma.sql` object or a tagged template. */
function queryText(query: unknown): string {
  if (Array.isArray(query)) return query.join(' ');
  const sql = query as { strings?: string[]; sql?: string; text?: string };
  return sql?.strings?.join(' ') ?? sql?.sql ?? sql?.text ?? String(query);
}

function build(options: { invoice?: Record<string, unknown> | null; clinic?: Record<string, unknown> | null } = {}) {
  rzpMockHolder.current = buildRazorpayMock();

  const row = options.invoice === null ? null : invoiceRow(options.invoice ?? {});
  let counter = 0;

  const tx = {
    $queryRaw: vi.fn(async (query: unknown) => {
      // `nextDocumentNumber` and `lockInvoice` share this handle; dispatch on
      // the statement so the receipt allocator gets a counter row back rather
      // than an invoice.
      if (queryText(query).includes('invoice_number_counters')) {
        counter += 1;
        return [{ last_number: counter }];
      }
      return row ? [lockedRow(row)] : [];
    }),
    payment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'pay-row-1',
        razorpayPaymentId: null,
        ...data,
      })),
      updateMany: vi.fn(async (_args: PrismaArgs) => ({ count: 1 })),
      findMany: vi.fn(async (): Promise<Row[]> => []),
      findFirst: vi.fn(async (): Promise<Row | null> => null),
    },
    paymentReceipt: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'receipt-1',
        ...data,
      })),
    },
    billingAuditLog: { create: vi.fn(async () => ({})) },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    invoice: { findFirst: vi.fn(async () => row) },
    clinic: {
      findFirst: vi.fn(async () =>
        options.clinic === null
          ? null
          : (options.clinic ?? {
              id: CLINIC,
              razorpayKeyId: 'rzp_test_key',
              razorpayKeySecretEnc: 'v1.aa.bb.cc',
              razorpayTestMode: true,
            }),
      ),
    },
    payment: {
      findFirst: vi.fn(async (): Promise<Row | null> => null),
      findMany: vi.fn(async (): Promise<Row[]> => []),
    },
    paymentReceipt: { findFirst: vi.fn(async (): Promise<Row | null> => null) },
  };

  const repository = {
    recomputePaymentState: vi.fn(async () => undefined),
    getInvoiceDetail: vi.fn(async () => ({ id: INVOICE, status: 'PAID', balancePaise: 0 })),
    getInvoice: vi.fn(async () => row),
  };

  const service = new PaymentService(repository as never, prisma as never);
  return { service, repository, prisma, tx, rzp: rzpMockHolder.current };
}

// A stable counter response so `nextDocumentNumber` produces RCT-YYYYMM-0001.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaymentService.recordCashPayment — D-10 cash in hand', () => {
  it('inserts a captured cash payment and derives the invoice status in the same transaction', async () => {
    const { service, repository, tx, prisma } = build();

    await service.recordCashPayment(CLINIC, INVOICE, ACTOR, 50000);

    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    const data = tx.payment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      clinicId: CLINIC,
      invoiceId: INVOICE,
      method: 'cash',
      channel: 'manual',
      status: 'captured',
      amountPaise: 50000,
    });
    expect(data.paidAt).toBeInstanceOf(Date);

    // Same transaction handle for the insert and the derivation: a status
    // written outside the transaction that produced the rows can disagree with
    // them, which is the classic billing bug.
    expect(repository.recomputePaymentState).toHaveBeenCalledWith(tx, CLINIC, INVOICE);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates exactly one PaymentReceipt with a null transactionRef for cash (D-13)', async () => {
    const { service, tx } = build();

    await service.recordCashPayment(CLINIC, INVOICE, ACTOR, 50000);

    expect(tx.paymentReceipt.create).toHaveBeenCalledTimes(1);
    const receipt = tx.paymentReceipt.create.mock.calls[0][0].data;
    expect(receipt).toMatchObject({ clinicId: CLINIC, invoiceId: INVOICE, method: 'cash', amountPaise: 50000 });
    expect(receipt.transactionRef).toBeNull();
    expect(String(receipt.receiptNumber)).toMatch(/^RCT-\d{6}-\d{4}$/);
  });

  it('records a partial cash payment without settling the invoice', async () => {
    const { service, tx, repository } = build();

    await service.recordCashPayment(CLINIC, INVOICE, ACTOR, 20000);

    expect(tx.payment.create.mock.calls[0][0].data.amountPaise).toBe(20000);
    // The service never writes `status` itself — PARTIALLY_PAID vs PAID is the
    // reducer's call, from the rows.
    expect(repository.recomputePaymentState).toHaveBeenCalledOnce();
  });

  it('rejects an over-payment with PAYMENT_EXCEEDS_BALANCE and inserts nothing', async () => {
    const { service, tx } = build({ invoice: { balancePaise: 50000 } });

    await expect(service.recordCashPayment(CLINIC, INVOICE, ACTOR, 60000)).rejects.toMatchObject({
      statusCode: 400,
      code: 'PAYMENT_EXCEEDS_BALANCE',
    });

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.paymentReceipt.create).not.toHaveBeenCalled();
  });

  it('refuses a payment against a DRAFT invoice — an unnumbered invoice cannot be paid', async () => {
    const { service, tx } = build({ invoice: { status: 'DRAFT', invoiceNumber: null } });

    await expect(service.recordCashPayment(CLINIC, INVOICE, ACTOR, 50000)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('refuses to touch an invoice carrying an unresolved billing exception (D-35, D-36)', async () => {
    const { service, tx } = build({ invoice: { exceptionFlag: 'overpayment' } });

    await expect(service.recordCashPayment(CLINIC, INVOICE, ACTOR, 10000)).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('locks the invoice row FOR UPDATE before reading its balance', async () => {
    const { service, tx } = build();

    await service.recordCashPayment(CLINIC, INVOICE, ACTOR, 10000);

    const sql = JSON.stringify(tx.$queryRaw.mock.calls[0]);
    expect(sql).toContain('FOR UPDATE');
  });
});

describe('PaymentService.createPaymentLink — D-09 / BIL-05', () => {
  it('sends Razorpay the server-computed balance, not a client figure', async () => {
    const { service, rzp } = build({ invoice: { balancePaise: 37500 } });

    await service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' });

    const params = rzp.paymentLink.create.mock.calls[0][0];
    expect(params.amount).toBe(37500);
    expect(params.currency).toBe('INR');
    expect(params.accept_partial).toBe(false);
    expect(params.notify).toEqual({ sms: false, email: false });
    expect(params.notes).toMatchObject({ clinicId: CLINIC, invoiceId: INVOICE });
  });

  it('uses the bare invoice UUID as reference_id, inside Razorpay 40-character cap', async () => {
    const { service, rzp } = build();

    await service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' });

    const params = rzp.paymentLink.create.mock.calls[0][0];
    expect(params.reference_id).toBe(INVOICE);
    expect(params.reference_id.length).toBeLessThanOrEqual(40);
    expect(params.reference_id.length).toBe(36);
  });

  it('sets expire_by at least 960 seconds out so the 15-minute minimum is never grazed', async () => {
    const { service, rzp } = build();
    const nowSeconds = Math.floor(Date.now() / 1000);

    await service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' });

    const params = rzp.paymentLink.create.mock.calls[0][0];
    expect(params.expire_by - nowSeconds).toBeGreaterThanOrEqual(960);
  });

  it('inserts a pending razorpay Payment and does NOT move the invoice status (T-06-50)', async () => {
    const { service, tx, repository } = build();

    await service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' });

    const data = tx.payment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ channel: 'razorpay', method: 'upi', status: 'pending' });
    expect(data.razorpayPaymentLinkId).toMatch(/^plink_test/);
    expect(data.shortUrl).toContain('https://rzp.io/');
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.paidAt).toBeUndefined();

    // A Razorpay 200 means a link exists, not that money arrived.
    expect(repository.recomputePaymentState).not.toHaveBeenCalled();
    expect(tx.paymentReceipt.create).not.toHaveBeenCalled();
  });

  it('returns only the link id, short url, expiry and amount — no key, no secret, no raw response', async () => {
    const { service } = build();

    const result = await service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' });

    expect(Object.keys(result).sort()).toEqual(
      ['amountPaise', 'expiresAt', 'paymentLinkId', 'shortUrl'].sort(),
    );
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('rzp_test');
    expect(serialised).not.toContain('key_secret');
  });

  it('rejects a balance below gateway minimum without calling the SDK', async () => {
    const { service, rzp } = build({ invoice: { balancePaise: 99 } });

    await expect(
      service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'AMOUNT_BELOW_GATEWAY_MINIMUM' });

    expect(rzp.paymentLink.create).not.toHaveBeenCalled();
  });

  it('tolerates a walk-in with no owner on file (D-44 — the QR is shown on screen)', async () => {
    const { service, rzp } = build({ invoice: { ownerId: null, owner: null } });

    await expect(
      service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' }),
    ).resolves.toBeDefined();

    const params = rzp.paymentLink.create.mock.calls[0][0];
    expect(params.customer).toEqual({});
    expect(params.notify).toEqual({ sms: false, email: false });
  });

  it('tolerates an owner with no mobile number on file (D-44)', async () => {
    const { service, rzp } = build({
      invoice: { owner: { id: OWNER, name: 'Asha Rao', mobile: null } },
    });

    await service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' });

    const params = rzp.paymentLink.create.mock.calls[0][0];
    expect(params.customer).toEqual({ name: 'Asha Rao' });
    expect(params.customer.contact).toBeUndefined();
  });

  it('surfaces an SDK rejection as a 502 PAYMENT_GATEWAY_ERROR and writes no Payment row', async () => {
    const { service, tx } = build();
    rzpMockHolder.current.paymentLink.create = vi.fn(async () => {
      throw {
        statusCode: 400,
        error: { code: 'BAD_REQUEST_ERROR', description: 'The amount must be atleast INR 1.00' },
      };
    });

    await expect(
      service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'PAYMENT_GATEWAY_ERROR' });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('cancels the gateway link when the local Payment insert fails, leaving no orphan (T-06-53)', async () => {
    const { service, prisma, rzp } = build();
    prisma.$transaction = vi.fn(async () => {
      throw new Error('insert failed');
    });

    await expect(
      service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' }),
    ).rejects.toThrow();

    expect(rzp.paymentLink.cancel).toHaveBeenCalledTimes(1);
    expect(rzp.paymentLink.cancel.mock.calls[0][0]).toMatch(/^plink_test/);
  });

  it('never marks the invoice PAID on a gateway 200 (T-06-50)', async () => {
    const { service, tx, repository } = build();

    await service.createPaymentLink(CLINIC, INVOICE, ACTOR, { method: 'upi' });

    const written = tx.payment.create.mock.calls[0][0].data;
    expect(written.status).not.toBe('captured');
    expect(repository.recomputePaymentState).not.toHaveBeenCalled();
  });
});

describe('PaymentService.recordSplitPayment — D-10 split', () => {
  it('records the cash leg immediately and opens a link for the digital leg', async () => {
    const { service, tx, rzp, repository } = build({ invoice: { balancePaise: 150000, grandTotalPaise: 150000 } });

    const result = await service.recordSplitPayment(CLINIC, INVOICE, ACTOR, {
      totalPaise: 150000,
      cashAmountPaise: 100000,
      digitalAmountPaise: 50000,
      digitalMethod: 'upi',
    });

    const cash = tx.payment.create.mock.calls[0][0].data;
    expect(cash).toMatchObject({ method: 'cash', channel: 'manual', status: 'captured', amountPaise: 100000 });

    const digital = tx.payment.create.mock.calls[1][0].data;
    expect(digital).toMatchObject({ channel: 'razorpay', method: 'upi', status: 'pending', amountPaise: 50000 });

    // The digital leg is a separate Payment row on our side, not a partially
    // payable link on Razorpay's.
    expect(rzp.paymentLink.create.mock.calls[0][0].accept_partial).toBe(false);
    expect(rzp.paymentLink.create.mock.calls[0][0].amount).toBe(50000);

    expect(repository.recomputePaymentState).toHaveBeenCalled();
    expect(result.paymentLink.amountPaise).toBe(50000);
  });

  it('rejects a split whose legs do not sum to the declared total', async () => {
    const { service, tx } = build({ invoice: { balancePaise: 150000 } });

    await expect(
      service.recordSplitPayment(CLINIC, INVOICE, ACTOR, {
        totalPaise: 150000,
        cashAmountPaise: 100000,
        digitalAmountPaise: 40000,
        digitalMethod: 'upi',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a split whose total exceeds the outstanding balance', async () => {
    const { service, tx } = build({ invoice: { balancePaise: 120000 } });

    await expect(
      service.recordSplitPayment(CLINIC, INVOICE, ACTOR, {
        totalPaise: 150000,
        cashAmountPaise: 100000,
        digitalAmountPaise: 50000,
        digitalMethod: 'upi',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE' });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe('PaymentService.retryPaymentLink — D-11 retry', () => {
  it('cancels the outstanding link, marks that Payment cancelled, and issues a fresh one', async () => {
    const { service, prisma, tx, rzp } = build();
    prisma.payment.findFirst = vi.fn(async () => ({
      id: 'pay-old',
      razorpayPaymentLinkId: 'plink_test_old0001',
      amountPaise: 50000,
      method: 'upi',
      status: 'pending',
    }));

    const result = await service.retryPaymentLink(CLINIC, INVOICE, ACTOR);

    expect(rzp.paymentLink.cancel).toHaveBeenCalledWith('plink_test_old0001');
    expect(tx.payment.updateMany).toHaveBeenCalled();
    const update = tx.payment.updateMany.mock.calls[0][0] as { data: Row; where: Row };
    expect(update.data.status).toBe('cancelled');
    expect(rzp.paymentLink.create).toHaveBeenCalledTimes(1);
    expect(result.paymentLinkId).toMatch(/^plink_test/);
  });

  it('does not cancel a captured payment when retrying (D-37 — collected money is never dropped)', async () => {
    const { service, prisma, tx } = build();
    prisma.payment.findFirst = vi.fn(async () => ({
      id: 'pay-old',
      razorpayPaymentLinkId: 'plink_test_old0001',
      amountPaise: 50000,
      method: 'upi',
      status: 'pending',
    }));

    await service.retryPaymentLink(CLINIC, INVOICE, ACTOR);

    const where = (tx.payment.updateMany.mock.calls[0][0] as { where: Row }).where;
    expect(where.status).toBe('pending');
    expect(where.channel).toBe('razorpay');
  });
});

describe('PaymentService.markPaymentUnpaid — D-11 manual fallback, D-37 guard', () => {
  it('cancels only pending razorpay rows, never a captured cash leg (D-37)', async () => {
    const { service, prisma, tx, rzp } = build({ invoice: { status: 'PARTIALLY_PAID', balancePaise: 50000 } });
    prisma.payment.findMany = vi.fn(async () => [
      { id: 'pay-1', razorpayPaymentLinkId: 'plink_test_pending1', status: 'pending' },
    ]);

    await service.markPaymentUnpaid(CLINIC, INVOICE, ACTOR);

    const where = (tx.payment.updateMany.mock.calls[0][0] as { where: Row }).where;
    expect(where.status).toBe('pending');
    expect(where.channel).toBe('razorpay');
    // A cash leg already collected must survive: reverting to fully UNPAID
    // would erase money the clinic is holding.
    expect(where.channel).not.toBe('manual');

    expect(rzp.paymentLink.cancel).toHaveBeenCalledWith('plink_test_pending1');
  });

  it('recomputes the derived state so the invoice lands on PARTIALLY_PAID, not UNPAID (D-37)', async () => {
    const { service, prisma, repository, tx } = build({ invoice: { status: 'PARTIALLY_PAID' } });
    prisma.payment.findMany = vi.fn(async () => [
      { id: 'pay-1', razorpayPaymentLinkId: 'plink_test_pending1', status: 'pending' },
    ]);

    await service.markPaymentUnpaid(CLINIC, INVOICE, ACTOR);

    expect(repository.recomputePaymentState).toHaveBeenCalledWith(tx, CLINIC, INVOICE);
  });

  it('is a no-op at the gateway when there is no outstanding link', async () => {
    const { service, prisma, rzp } = build();
    prisma.payment.findMany = vi.fn(async () => []);

    await service.markPaymentUnpaid(CLINIC, INVOICE, ACTOR);

    expect(rzp.paymentLink.cancel).not.toHaveBeenCalled();
  });
});

describe('PaymentService.getLatestReceiptForInvoice — D-13, finding 9.3', () => {
  // The owner-portal receipt route (finding 9.3) has no receiptId to present
  // -- unlike `getReceipt` (D-13's staff-side "View Receipt", which takes an
  // explicit receiptId), it can only ask "the most recent receipt for this
  // invoice". This method is what that route delegates to rather than
  // reinventing the `paymentReceipt` lookup a second time.
  it('returns the most recently issued receipt for the invoice, clinic-scoped', async () => {
    const { service, prisma } = build();
    const receiptRow = {
      id: 'receipt-1',
      clinicId: CLINIC,
      invoiceId: INVOICE,
      receiptNumber: 'RCT-202608-0001',
      amountPaise: 50000,
      method: 'cash',
      transactionRef: null,
      issuedAt: new Date('2026-08-10T00:00:00.000Z'),
    };
    prisma.paymentReceipt.findFirst = vi.fn(async () => receiptRow);

    const result = await service.getLatestReceiptForInvoice(CLINIC, INVOICE);

    expect(result).toEqual(receiptRow);
    expect(prisma.paymentReceipt.findFirst).toHaveBeenCalledWith({
      where: { clinicId: CLINIC, invoiceId: INVOICE },
      orderBy: { issuedAt: 'desc' },
    });
  });

  it('returns null rather than throwing when the invoice has no receipt yet (unpaid, not an error state here)', async () => {
    const { service, prisma } = build();
    prisma.paymentReceipt.findFirst = vi.fn(async () => null);

    const result = await service.getLatestReceiptForInvoice(CLINIC, INVOICE);

    expect(result).toBeNull();
  });
});
