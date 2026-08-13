import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { InvoiceRepository } from '../invoice.repository.js';
import type { FinalizeComputation } from '../invoice.repository.js';

/**
 * Contract coverage for the invoice repository against a Prisma double.
 *
 * The database-backed behaviour (real row locks, real concurrency, real
 * partial-unique-index conflicts) is plan 06-08's integration suite. What is
 * provable here is the part that has historically gone wrong silently: that the
 * finalize transaction calls the stock validator exactly once and only with the
 * plan it was handed, that an empty plan short-circuits it entirely, that the
 * draft-immutability guard sits in the WHERE clause rather than in a service
 * check, and that a movement already claimed by another invoice is never
 * stolen.
 */

const CLINIC = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ACTOR = { userId: 'user-1', userName: 'Front Desk' };

function computation(overrides: Partial<FinalizeComputation> = {}): FinalizeComputation {
  return {
    lines: [
      {
        lineId: 'line-1',
        taxTreatment: 'taxable',
        gstRatePercent: 12,
        allocatedInvoiceDiscountPaise: 0,
        taxableValuePaise: 10000,
        cgstPaise: 600,
        sgstPaise: 600,
        igstPaise: 0,
        lineTotalPaise: 11200,
      },
    ],
    subtotalPaise: 10000,
    lineDiscountPaise: 0,
    invoiceDiscountPaise: 0,
    taxableValuePaise: 10000,
    cgstPaise: 600,
    sgstPaise: 600,
    igstPaise: 0,
    roundOffPaise: 0,
    grandTotalPaise: 11200,
    documentType: 'tax_invoice',
    placeOfSupplyStateCode: '29',
    isInterState: false,
    gstEnabledSnapshot: true,
    clinicGstinSnapshot: '29ABCDE1234F1Z5',
    dueDate: null,
    sourceStockMovementIds: [],
    ...overrides,
  };
}

function createHarness(options: { lockedRows?: unknown[] } = {}) {
  const rawQueries: Prisma.Sql[] = [];
  const rawExecutes: Prisma.Sql[] = [];
  const lockedRows = options.lockedRows ?? [{ id: INVOICE }];

  const tx = {
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
      rawQueries.push(sql);
      // Only the invoice FOR UPDATE probe and the numbering upsert go through
      // $queryRaw in the finalize path; distinguish them by target table.
      if (sql.sql.includes('invoice_number_counters')) return [{ last_number: 7 }];
      return lockedRows;
    }),
    $executeRaw: vi.fn(async (sql: Prisma.Sql) => {
      rawExecutes.push(sql);
      return 1;
    }),
    invoice: {
      update: vi.fn(async () => ({ id: INVOICE })),
      findFirst: vi.fn(async () => ({
        id: INVOICE,
        clinicId: CLINIC,
        status: 'FINALIZED',
        grandTotalPaise: 11200,
        creditedPaise: 0,
        exceptionFlag: null,
      })),
    },
    invoiceLineItem: {
      update: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    payment: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    refund: { findMany: vi.fn(async () => []) },
    creditNote: { findMany: vi.fn(async () => []) },
    billingAuditLog: { create: vi.fn(async () => ({})) },
    stockMovement: { findMany: vi.fn(async () => []) },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
      rawQueries.push(sql);
      return [];
    }),
    invoice: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
  };

  const stockValidator = {
    reserveAndDeduct: vi.fn(async () => []),
    restoreToStock: vi.fn(async () => 0),
    checkAvailability: vi.fn(async () => []),
  };

  const repository = new InvoiceRepository(prisma as any, stockValidator as any);

  return { repository, prisma, tx, stockValidator, rawQueries, rawExecutes };
}

describe('InvoiceRepository.findUninvoicedDispensedMovements', () => {
  it('queries dispensed, still-unclaimed movements for a consultation', async () => {
    const { repository, prisma, rawQueries } = createHarness();

    await repository.findUninvoicedDispensedMovements(CLINIC, { consultationId: 'consult-1' });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = rawQueries[0].sql;
    expect(sql).toContain("type = 'dispensed'");
    expect(sql).toContain('invoice_id IS NULL');
    expect(sql).toContain('consultation_id =');
    expect(sql).toContain('ABS(');
    // The unit price must come from the movement's dispense-time snapshot, not
    // from the item's current selling price.
    expect(sql).toContain('m.unit_price');
  });

  it('queries counter-sale movements by owner when no consultation is given (D-04)', async () => {
    const { repository, rawQueries } = createHarness();

    await repository.findUninvoicedDispensedMovements(CLINIC, { ownerId: 'owner-1' });

    const sql = rawQueries[0].sql;
    expect(sql).toContain('consultation_id IS NULL');
    expect(sql).toContain('owner_id =');
    expect(sql).toContain('invoice_id IS NULL');
  });
});

describe('InvoiceRepository draft immutability', () => {
  it('scopes updateDraft to DRAFT at the query layer and reports zero rows affected', async () => {
    const { repository, prisma } = createHarness();
    prisma.invoice.updateMany = vi.fn(async () => ({ count: 0 })) as any;

    const updated = await repository.updateDraft(CLINIC, INVOICE, { notes: 'hello' });

    expect(updated).toBe(false);
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: INVOICE, clinicId: CLINIC, status: 'DRAFT' }),
      }),
    );
  });

  it('scopes deleteDraft to DRAFT at the query layer', async () => {
    const { repository, prisma } = createHarness();

    await repository.deleteDraft(CLINIC, INVOICE);

    expect(prisma.invoice.deleteMany).toHaveBeenCalledWith({
      where: { id: INVOICE, clinicId: CLINIC, status: 'DRAFT' },
    });
  });
});

describe('InvoiceRepository.finalizeInvoice', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it('takes a FOR UPDATE lock scoped to a DRAFT invoice before anything else', async () => {
    await harness.repository.finalizeInvoice(CLINIC, INVOICE, computation(), [], ACTOR, new Date());

    const lock = harness.rawQueries[0].sql;
    expect(lock).toContain('FOR UPDATE');
    expect(lock).toContain("status = 'DRAFT'");
  });

  it('throws INVOICE_ALREADY_FINALIZED 409 when the DRAFT lock returns no row', async () => {
    const { repository } = createHarness({ lockedRows: [] });

    await expect(
      repository.finalizeInvoice(CLINIC, INVOICE, computation(), [], ACTOR, new Date()),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVOICE_ALREADY_FINALIZED' });
  });

  it('does not call the stock validator at all when the stock plan is empty', async () => {
    await harness.repository.finalizeInvoice(CLINIC, INVOICE, computation(), [], ACTOR, new Date());

    expect(harness.stockValidator.reserveAndDeduct).not.toHaveBeenCalled();
  });

  it('passes the stock plan to the validator verbatim, never re-deriving it', async () => {
    const plan = [
      {
        lineId: 'line-manual',
        inventoryItemId: ITEM,
        stockMovementId: null,
        description: 'Amoxicillin',
        quantity: 2,
        unitPricePaise: 4000,
      },
    ];

    await harness.repository.finalizeInvoice(CLINIC, INVOICE, computation(), plan, ACTOR, new Date());

    expect(harness.stockValidator.reserveAndDeduct).toHaveBeenCalledTimes(1);
    expect(harness.stockValidator.reserveAndDeduct).toHaveBeenCalledWith(
      harness.tx,
      CLINIC,
      plan,
      expect.objectContaining({ invoiceId: INVOICE }),
    );
  });

  it('allocates the invoice number inside the same transaction as the lock', async () => {
    await harness.repository.finalizeInvoice(CLINIC, INVOICE, computation(), [], ACTOR, new Date());

    const numbering = harness.rawQueries.find((sql) =>
      sql.sql.includes('invoice_number_counters'),
    );
    expect(numbering).toBeDefined();
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('freezes the tax snapshot on the invoice using the engine grand total, never re-adding the round-off', async () => {
    const computed = computation({
      taxableValuePaise: 10000,
      cgstPaise: 600,
      sgstPaise: 600,
      igstPaise: 0,
      roundOffPaise: -37,
      grandTotalPaise: 11200,
    });

    await harness.repository.finalizeInvoice(CLINIC, INVOICE, computed, [], ACTOR, new Date());

    const invoiceUpdate = harness.tx.invoice.update.mock.calls[0][0] as any;
    expect(invoiceUpdate.data.grandTotalPaise).toBe(11200);
    expect(invoiceUpdate.data.roundOffPaise).toBe(-37);
    expect(invoiceUpdate.data.balancePaise).toBe(11200);
    expect(invoiceUpdate.data.status).toBe('FINALIZED');
    expect(invoiceUpdate.data.invoiceNumber).toMatch(/^INV-\d{6}-0007$/);
  });

  it('stamps the invoice onto source movements only while they are still unclaimed', async () => {
    const computed = computation({ sourceStockMovementIds: ['mv-1', 'mv-2'] });

    await harness.repository.finalizeInvoice(CLINIC, INVOICE, computed, [], ACTOR, new Date());

    const stamp = harness.rawExecutes.find((sql) => sql.sql.includes('UPDATE stock_movements'));
    expect(stamp).toBeDefined();
    expect(stamp!.sql).toContain('invoice_id IS NULL');
    expect(stamp!.values).toEqual(expect.arrayContaining(['mv-1', 'mv-2']));
  });

  it('writes the INVOICE_FINALIZED audit row inside the transaction', async () => {
    await harness.repository.finalizeInvoice(CLINIC, INVOICE, computation(), [], ACTOR, new Date());

    expect(harness.tx.billingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'INVOICE_FINALIZED', clinicId: CLINIC }),
      }),
    );
  });
});

describe('InvoiceRepository.recomputePaymentState', () => {
  function invoiceState(overrides: Record<string, unknown> = {}) {
    return {
      id: INVOICE,
      clinicId: CLINIC,
      status: 'UNPAID',
      grandTotalPaise: 10000,
      creditedPaise: 0,
      exceptionFlag: null,
      ...overrides,
    };
  }

  it('derives UNPAID when no payment has been captured', async () => {
    const { repository, tx } = createHarness();
    tx.invoice.findFirst = vi.fn(async () => invoiceState()) as any;

    await repository.recomputePaymentState(tx as any, CLINIC, INVOICE);

    const data = (tx.invoice.update.mock.calls[0][0] as any).data;
    expect(data.status).toBe('UNPAID');
    expect(data.amountPaidPaise).toBe(0);
    expect(data.balancePaise).toBe(10000);
  });

  it('derives PARTIALLY_PAID from the captured payment rows, net of processed refunds', async () => {
    const { repository, tx } = createHarness();
    tx.invoice.findFirst = vi.fn(async () => invoiceState()) as any;
    tx.payment.findMany = vi.fn(async () => [{ amountPaise: 6000 }, { amountPaise: 1000 }]) as any;
    tx.refund.findMany = vi.fn(async () => [{ amountPaise: 1000 }]) as any;

    await repository.recomputePaymentState(tx as any, CLINIC, INVOICE);

    const data = (tx.invoice.update.mock.calls[0][0] as any).data;
    expect(data.amountPaidPaise).toBe(6000);
    expect(data.balancePaise).toBe(4000);
    expect(data.status).toBe('PARTIALLY_PAID');
  });

  it('derives PAID and flags an overpayment rather than clamping the balance (D-36)', async () => {
    const { repository, tx } = createHarness();
    tx.invoice.findFirst = vi.fn(async () => invoiceState()) as any;
    tx.payment.findMany = vi.fn(async () => [{ amountPaise: 10000 }, { amountPaise: 2500 }]) as any;

    await repository.recomputePaymentState(tx as any, CLINIC, INVOICE);

    const data = (tx.invoice.update.mock.calls[0][0] as any).data;
    expect(data.status).toBe('PAID');
    // Negative, deliberately: plan 06-03 left balance_paise unconstrained so an
    // overpaid invoice is representable and therefore detectable.
    expect(data.balancePaise).toBe(-2500);
    expect(data.exceptionFlag).toBe('overpayment');
    expect(data.exceptionDetectedAt).toBeInstanceOf(Date);
  });

  it('never reopens a VOIDED invoice when a late payment lands, and flags it instead (D-35)', async () => {
    const { repository, tx } = createHarness();
    tx.invoice.findFirst = vi.fn(async () => invoiceState({ status: 'VOIDED' })) as any;
    tx.payment.findMany = vi.fn(async () => [{ amountPaise: 10000 }]) as any;

    await repository.recomputePaymentState(tx as any, CLINIC, INVOICE);

    const data = (tx.invoice.update.mock.calls[0][0] as any).data;
    expect(data.status).toBe('VOIDED');
    expect(data.exceptionFlag).toBe('payment_after_void');
  });

  it('counts credit notes against the balance without treating them as payment', async () => {
    const { repository, tx } = createHarness();
    tx.invoice.findFirst = vi.fn(async () => invoiceState()) as any;
    tx.creditNote.findMany = vi.fn(async () => [{ totalPaise: 10000 }]) as any;

    await repository.recomputePaymentState(tx as any, CLINIC, INVOICE);

    const data = (tx.invoice.update.mock.calls[0][0] as any).data;
    expect(data.creditedPaise).toBe(10000);
    expect(data.amountPaidPaise).toBe(0);
    expect(data.balancePaise).toBe(0);
    expect(data.status).toBe('PAID');
  });
});

describe('InvoiceRepository.voidInvoice', () => {
  it('locks FOR UPDATE, restores stock and records that it did so', async () => {
    const { repository, tx, stockValidator, rawQueries } = createHarness({
      lockedRows: [{ id: INVOICE, status: 'UNPAID', void_restored_stock: false, exception_flag: null }],
    });
    stockValidator.restoreToStock = vi.fn(async () => 3) as any;

    const result = await repository.voidInvoice(CLINIC, INVOICE, 'wrong pet', true, ACTOR);

    expect(rawQueries[0].sql).toContain('FOR UPDATE');
    expect(stockValidator.restoreToStock).toHaveBeenCalledWith(tx, CLINIC, INVOICE, expect.anything());
    const data = (tx.invoice.update.mock.calls[0][0] as any).data;
    expect(data.status).toBe('VOIDED');
    expect(data.voidRestoredStock).toBe(true);
    expect(data.voidReason).toBe('wrong pet');
    expect(result.restoredMovementCount).toBe(3);
  });

  it('does not restore a second time when the invoice already restored its stock', async () => {
    const { repository, stockValidator } = createHarness({
      lockedRows: [{ id: INVOICE, status: 'UNPAID', void_restored_stock: true, exception_flag: null }],
    });

    await repository.voidInvoice(CLINIC, INVOICE, 'duplicate', true, ACTOR);

    expect(stockValidator.restoreToStock).not.toHaveBeenCalled();
  });

  it('rejects a void from a terminal state with INVALID_STATE_TRANSITION 409', async () => {
    const { repository } = createHarness({
      lockedRows: [{ id: INVOICE, status: 'VOIDED', void_restored_stock: true, exception_flag: null }],
    });

    await expect(repository.voidInvoice(CLINIC, INVOICE, 'again', true, ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('throws INVOICE_NOT_FOUND 404 when the lock returns no row', async () => {
    const { repository } = createHarness({ lockedRows: [] });

    await expect(repository.voidInvoice(CLINIC, INVOICE, 'gone', true, ACTOR)).rejects.toMatchObject({
      statusCode: 404,
      code: 'INVOICE_NOT_FOUND',
    });
  });

  it('cancels any pending Razorpay link and returns its id for gateway-side cancellation (D-35)', async () => {
    const { repository, tx } = createHarness({
      lockedRows: [{ id: INVOICE, status: 'UNPAID', void_restored_stock: false, exception_flag: null }],
    });
    tx.payment.findMany = vi.fn(async () => [
      { id: 'pay-1', razorpayPaymentLinkId: 'plink_abc' },
    ]) as any;

    const result = await repository.voidInvoice(CLINIC, INVOICE, 'wrong pet', true, ACTOR);

    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
    expect(result.cancelledPaymentLinkIds).toEqual(['plink_abc']);
  });
});
