import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoiceService } from '../invoice.service.js';

/**
 * The D-20 / D-21 state machine as the service enforces it.
 *
 * The transition TABLE itself is unit-tested in `@breeyo/types`
 * (`invoice-status.test.ts`). What is tested here is that the service actually
 * consults it on every status-changing path and answers a disallowed move with
 * a 409 rather than writing the row — which is the part a client can reach.
 */

const CLINIC = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const ACTOR = { userId: 'user-1', userName: 'Front Desk' };

function createMockRepository() {
  return {
    findUninvoicedDispensedMovements: vi.fn(async () => []),
    createDraft: vi.fn(async () => ({ id: INVOICE })),
    getDraft: vi.fn(async () => null),
    updateDraft: vi.fn(async () => true),
    deleteDraft: vi.fn(async () => true),
    finalizeInvoice: vi.fn(async () => ({ invoice: { id: INVOICE }, invoiceNumber: 'INV-202608-0001', deductions: [] })),
    voidInvoice: vi.fn(async () => ({ invoiceId: INVOICE, restoredMovementCount: 0, cancelledPaymentLinkIds: [] })),
    recomputePaymentState: vi.fn(async () => undefined),
    getInvoiceDetail: vi.fn(async () => ({ id: INVOICE })),
    listInvoices: vi.fn(async () => ({ items: [], nextCursor: null })),
    getInvoicesForPet: vi.fn(async () => ({ items: [], nextCursor: null })),
    getLineItems: vi.fn(async () => []),
    findDraftByConsultation: vi.fn(async () => null),
    getInvoice: vi.fn(async () => null),
  };
}

/**
 * The `FOR UPDATE` row the collection paths lock before they write (CR-04).
 * Snake_case because it comes back from `$queryRaw`, not from a Prisma delegate.
 */
function lockedRowFor(invoice: Record<string, unknown> | null) {
  if (!invoice) return [];
  const grandTotal = (invoice.grandTotalPaise as number) ?? 0;
  const paid = (invoice.amountPaidPaise as number) ?? 0;
  return [
    {
      id: invoice.id,
      status: invoice.status,
      grand_total_paise: grandTotal,
      balance_paise: (invoice.balancePaise as number) ?? grandTotal - paid,
      exception_flag: invoice.exceptionFlag ?? null,
      invoice_number: invoice.invoiceNumber ?? null,
    },
  ];
}

function createMockPrisma(invoice: Record<string, unknown> | null) {
  const tx = {
    $queryRaw: vi.fn(async () => lockedRowFor(invoice)),
    payment: {
      create: vi.fn(async () => ({ id: 'pay-1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
    },
    billingAuditLog: { create: vi.fn(async () => ({})) },
    invoice: { findFirst: vi.fn(async () => invoice), update: vi.fn(async () => ({})) },
  };
  return {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    clinic: { findUnique: vi.fn(async () => ({ id: CLINIC, gstEnabled: false, stateCode: '29', defaultGstRate: null, defaultDueDays: 0, gstin: null })) },
    consultation: { findFirst: vi.fn(async () => null) },
    serviceCatalog: { findMany: vi.fn(async () => []) },
    inventoryItem: { findMany: vi.fn(async () => []) },
    tx,
  };
}

function build(invoice: Record<string, unknown> | null) {
  const repository = createMockRepository();
  const prisma = createMockPrisma(invoice);
  const stockValidator = { checkAvailability: vi.fn(async () => []) };
  if (invoice) repository.getInvoice = vi.fn(async () => invoice) as any;
  const service = new InvoiceService(repository as any, stockValidator as any, prisma as any);
  return { service, repository, prisma };
}

describe('InvoiceService state guards — finalize', () => {
  it('rejects finalizing an already-FINALIZED invoice with 409', async () => {
    const { service, repository } = build({ id: INVOICE, status: 'FINALIZED', exceptionFlag: null });

    await expect(service.finalize(CLINIC, INVOICE, ACTOR, {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVOICE_ALREADY_FINALIZED',
    });
    expect(repository.finalizeInvoice).not.toHaveBeenCalled();
  });

  it('rejects finalizing a VOIDED invoice with 409', async () => {
    const { service, repository } = build({ id: INVOICE, status: 'VOIDED', exceptionFlag: null });

    await expect(service.finalize(CLINIC, INVOICE, ACTOR, {})).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.finalizeInvoice).not.toHaveBeenCalled();
  });

  it('throws INVOICE_NOT_FOUND 404 when the invoice does not exist', async () => {
    const { service } = build(null);

    await expect(service.finalize(CLINIC, INVOICE, ACTOR, {})).rejects.toMatchObject({
      statusCode: 404,
      code: 'INVOICE_NOT_FOUND',
    });
  });
});

describe('InvoiceService state guards — draft editing (D-21)', () => {
  it('throws INVOICE_NOT_DRAFT 409 when the status-scoped update affects zero rows', async () => {
    const { service, repository } = build({ id: INVOICE, status: 'FINALIZED', exceptionFlag: null });
    repository.updateDraft = vi.fn(async () => false) as any;

    await expect(service.updateDraft(CLINIC, INVOICE, ACTOR, { notes: 'edit' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVOICE_NOT_DRAFT',
    });
  });

  it('throws INVOICE_NOT_DRAFT 409 when deleting a finalized invoice', async () => {
    const { service, repository } = build({ id: INVOICE, status: 'FINALIZED', exceptionFlag: null });
    repository.deleteDraft = vi.fn(async () => false) as any;

    await expect(service.deleteDraft(CLINIC, INVOICE, ACTOR)).rejects.toMatchObject({
      code: 'INVOICE_NOT_DRAFT',
    });
  });
});

describe('InvoiceService state guards — void (D-21, D-26, D-34)', () => {
  it('permits voiding an UNPAID invoice and always asks for stock restoration', async () => {
    const { service, repository } = build({ id: INVOICE, status: 'UNPAID', exceptionFlag: null });

    await service.voidInvoice(CLINIC, INVOICE, ACTOR, { reason: 'wrong pet', restoreStock: true });

    expect(repository.voidInvoice).toHaveBeenCalledWith(CLINIC, INVOICE, 'wrong pet', true, ACTOR, undefined);
  });

  it('rejects voiding an already-VOIDED invoice — VOIDED is terminal', async () => {
    const { service, repository } = build({ id: INVOICE, status: 'VOIDED', exceptionFlag: null });

    await expect(
      service.voidInvoice(CLINIC, INVOICE, ACTOR, { reason: 'again', restoreStock: true }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION' });
    expect(repository.voidInvoice).not.toHaveBeenCalled();
  });

  it('rejects voiding a DRAFT — a draft is deleted, not voided', async () => {
    const { service, repository } = build({ id: INVOICE, status: 'DRAFT', exceptionFlag: null });

    await expect(
      service.voidInvoice(CLINIC, INVOICE, ACTOR, { reason: 'oops', restoreStock: true }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    expect(repository.voidInvoice).not.toHaveBeenCalled();
  });

  it('restores stock however old the dispense is — there is no age gate (D-34)', async () => {
    // D-34 amends D-26: the 24-hour window governs Phase 5's manual
    // per-dispense return, never an invoice void. A years-old invoice voids and
    // restores exactly like a fresh one. WHICH movements are in scope is a
    // separate question, settled in stock-validator.test.ts — only the ones the
    // invoice itself created, never a drug administered during a consultation.
    const { service, repository } = build({
      id: INVOICE,
      status: 'OVERDUE',
      exceptionFlag: null,
      finalizedAt: new Date('2020-01-01'),
    });

    await service.voidInvoice(CLINIC, INVOICE, ACTOR, { reason: 'recall', restoreStock: true });

    expect(repository.voidInvoice).toHaveBeenCalledWith(CLINIC, INVOICE, 'recall', true, ACTOR, undefined);
  });
});

describe('InvoiceService state guards — manual payment status (BIL-03)', () => {
  it('marks an UNPAID invoice paid', async () => {
    const { service, repository } = build({
      id: INVOICE,
      status: 'UNPAID',
      grandTotalPaise: 10000,
      amountPaidPaise: 0,
      exceptionFlag: null,
    });

    await service.markPaid(CLINIC, INVOICE, ACTOR, { method: 'cash' });

    expect(repository.recomputePaymentState).toHaveBeenCalled();
  });

  it('treats marking an already-PAID invoice paid as a no-op rather than a 409', async () => {
    const { service } = build({
      id: INVOICE,
      status: 'PAID',
      grandTotalPaise: 10000,
      amountPaidPaise: 10000,
      exceptionFlag: null,
    });

    await expect(service.markPaid(CLINIC, INVOICE, ACTOR, { method: 'cash' })).resolves.toBeDefined();
  });

  it('rejects marking a DRAFT paid — a draft is not a record of account', async () => {
    const { service } = build({
      id: INVOICE,
      status: 'DRAFT',
      grandTotalPaise: 10000,
      amountPaidPaise: 0,
      exceptionFlag: null,
    });

    await expect(service.markPaid(CLINIC, INVOICE, ACTOR, { method: 'cash' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('rejects marking a VOIDED invoice paid — a late payment must not reopen it (D-35)', async () => {
    const { service } = build({
      id: INVOICE,
      status: 'VOIDED',
      grandTotalPaise: 10000,
      amountPaidPaise: 0,
      exceptionFlag: null,
    });

    await expect(service.markPaid(CLINIC, INVOICE, ACTOR, { method: 'cash' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  /**
   * CR-04. `payment.service.ts` documents this invariant at
   * `paymentExceedsBalance` and enforces it on every other collection path:
   * D-36's exception list is for the overpayment we cannot prevent (two legs
   * racing), not for a figure someone typed at the counter. An unbounded
   * mark-paid drives the invoice into a state with no resolve endpoint
   * (deferred-items.md #15), which blocks void, refund, credit note and payment
   * on it permanently.
   */
  it('rejects a mark-paid amount larger than the outstanding balance', async () => {
    const { service, prisma } = build({
      id: INVOICE,
      status: 'UNPAID',
      grandTotalPaise: 10000,
      amountPaidPaise: 0,
      balancePaise: 10000,
      exceptionFlag: null,
    });

    await expect(
      service.markPaid(CLINIC, INVOICE, ACTOR, { method: 'cash', amountPaise: 12500 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'PAYMENT_EXCEEDS_BALANCE' });

    expect(prisma.tx.payment.create).not.toHaveBeenCalled();
  });

  it('takes a FOR UPDATE lock on the invoice before writing the payment row', async () => {
    const { service, prisma } = build({
      id: INVOICE,
      status: 'UNPAID',
      grandTotalPaise: 10000,
      amountPaidPaise: 0,
      balancePaise: 10000,
      exceptionFlag: null,
    });

    await service.markPaid(CLINIC, INVOICE, ACTOR, { method: 'cash' });

    expect(prisma.tx.$queryRaw).toHaveBeenCalled();
    const sql = (prisma.tx.$queryRaw.mock.calls[0] as unknown as [{ sql: string }])[0].sql;
    expect(sql).toContain('FROM invoices');
    expect(sql).toContain('FOR UPDATE');
  });

  it('derives the amount from the LOCKED balance, not from a figure read before the lock', async () => {
    const { service, prisma } = build({
      id: INVOICE,
      status: 'PARTIALLY_PAID',
      grandTotalPaise: 10000,
      amountPaidPaise: 4000,
      balancePaise: 6000,
      exceptionFlag: null,
    });

    await service.markPaid(CLINIC, INVOICE, ACTOR, { method: 'cash' });

    const created = (
      prisma.tx.payment.create.mock.calls[0] as unknown as [{ data: { amountPaise: number } }]
    )[0];
    expect(created.data.amountPaise).toBe(6000);
  });

  it('rejects marking PARTIALLY_PAID back to UNPAID — the cash leg is real (D-37)', async () => {
    const { service } = build({
      id: INVOICE,
      status: 'PARTIALLY_PAID',
      grandTotalPaise: 10000,
      amountPaidPaise: 4000,
      exceptionFlag: null,
    });

    await expect(service.markUnpaid(CLINIC, INVOICE, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });
});

describe('InvoiceService state guards — billing exceptions (D-35, D-36)', () => {
  it('blocks every status-changing action while an unresolved exception is flagged', async () => {
    const { service, repository } = build({
      id: INVOICE,
      status: 'PAID',
      grandTotalPaise: 10000,
      amountPaidPaise: 12500,
      exceptionFlag: 'overpayment',
    });

    await expect(
      service.voidInvoice(CLINIC, INVOICE, ACTOR, { reason: 'fix it', restoreStock: true }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVOICE_EXCEPTION_UNRESOLVED' });
    expect(repository.voidInvoice).not.toHaveBeenCalled();
  });
});
