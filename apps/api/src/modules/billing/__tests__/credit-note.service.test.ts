import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreditNoteService } from '../credit-note.service.js';

/**
 * Credit notes against mocked collaborators (D-19, D-21, D-22).
 *
 * The two assertions this file exists for:
 *
 *  1. **The invoice is never edited.** D-21 makes a finalized invoice
 *     immutable, so a correction is a separate negative document that
 *     references it. The double therefore has NO `invoiceLineItem.update` and
 *     no `invoice.update`; if the service ever reached for one the test would
 *     fail with a TypeError rather than quietly passing (T-06-69).
 *  2. **Tax comes from the invoice's own frozen snapshot.** `gstEnabledSnapshot`
 *     and `isInterState` are read off the locked invoice row, and the rate off
 *     each original line. A credit note recomputed from current clinic settings
 *     would not reconcile with the document it credits (T-06-72), and slabs
 *     change by notification.
 *
 * `computeInvoiceTax` and `nextDocumentNumber` run for real — the round-off
 * invariant and the gap-free counter are behaviours under test, not
 * collaborators to stub.
 */

const CLINIC = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const LINE_TAXABLE = '33333333-3333-4333-8333-333333333333';
const LINE_EXEMPT = '44444444-4444-4444-8444-444444444444';

const ACTOR = { userId: 'user-1', userName: 'Front Desk' };

type Row = Record<string, unknown>;

function lockedInvoice(overrides: Row = {}) {
  return {
    id: INVOICE,
    status: 'PAID',
    // 100000 taxable at 18% -> 18000 tax -> 118000, plus a 50000 exempt line.
    grand_total_paise: 168000,
    balance_paise: 0,
    exception_flag: null,
    invoice_number: 'INV-202608-0001',
    gst_enabled_snapshot: true,
    is_inter_state: false,
    ...overrides,
  };
}

/** A taxable product line: 100000 taxable + 9000 CGST + 9000 SGST. */
function taxableLineRow(overrides: Row = {}) {
  return {
    id: LINE_TAXABLE,
    invoiceId: INVOICE,
    description: 'Amoxicillin 250mg',
    hsnSacCode: '3004',
    quantity: 10,
    taxTreatment: 'taxable',
    gstRatePercent: 18,
    taxableValuePaise: 100000,
    cgstPaise: 9000,
    sgstPaise: 9000,
    igstPaise: 0,
    lineTotalPaise: 118000,
    ...overrides,
  };
}

/** An exempt consultation line: veterinary healthcare carries no GST. */
function exemptLineRow(overrides: Row = {}) {
  return {
    id: LINE_EXEMPT,
    invoiceId: INVOICE,
    description: 'Consultation',
    hsnSacCode: null,
    quantity: 1,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
    taxableValuePaise: 50000,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    lineTotalPaise: 50000,
    ...overrides,
  };
}

function build(
  options: {
    invoice?: Row | null;
    lineItems?: Row[];
    creditNotes?: Row[];
    creditNoteLines?: Row[];
  } = {},
) {
  const invoice = options.invoice === null ? null : lockedInvoice(options.invoice ?? {});
  const lineItems = options.lineItems ?? [taxableLineRow(), exemptLineRow()];
  const creditNotes = options.creditNotes ?? [];
  const creditNoteLines = options.creditNoteLines ?? [];

  let counter = 0;

  const tx = {
    $queryRaw: vi.fn(async (query: unknown) => {
      // `nextDocumentNumber` shares this handle with the invoice lock; dispatch
      // on the statement so the counter allocator gets a counter row back.
      const text = String((query as { strings?: string[] })?.strings?.join(' ') ?? query);
      if (text.includes('invoice_number_counters')) {
        counter += 1;
        return [{ last_number: counter }];
      }
      return invoice ? [invoice] : [];
    }),
    invoiceLineItem: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
        lineItems.filter((line) => args.where.id.in.includes(line.id as string)),
      ),
    },
    creditNote: {
      findMany: vi.fn(async () => creditNotes),
      create: vi.fn(async ({ data }: { data: Row }) => ({ id: 'cn-1', ...data })),
    },
    creditNoteLineItem: {
      findMany: vi.fn(async () => creditNoteLines),
      createMany: vi.fn(async (_args: { data: Row[] }) => ({ count: _args.data.length })),
    },
    billingAuditLog: { create: vi.fn(async (_args: { data: Row }) => ({})) },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    creditNote: {
      findMany: vi.fn(async () => creditNotes),
      findFirst: vi.fn(async () => (creditNotes[0] ?? null)),
    },
  };

  const repository = {
    recomputePaymentState: vi.fn(async () => undefined),
    getInvoiceDetail: vi.fn(async () => ({ id: INVOICE, status: 'PARTIALLY_PAID' })),
  };

  const service = new CreditNoteService(repository as never, prisma as never);
  return { service, repository, prisma, tx };
}

const creditTaxableLine = (creditAmountPaise: number) => ({
  reason: 'product_returned' as const,
  items: [{ invoiceLineItemId: LINE_TAXABLE, creditAmountPaise }],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreditNoteService.issueCreditNote — numbering (D-19)', () => {
  it('allocates a CN-YYYYMM-XXXX number from the CN counter inside the transaction', async () => {
    const { service, tx } = build();

    const result = await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118000));

    expect(result.creditNoteNumber).toMatch(/^CN-\d{6}-\d{4,}$/);
    expect(tx.creditNote.create.mock.calls[0][0].data.creditNoteNumber).toBe(
      result.creditNoteNumber,
    );

    // Allocated on the transaction handle, so a failed issuance rolls the
    // counter back rather than burning a number (Rule 46(b) consecutiveness).
    const counterCall = tx.$queryRaw.mock.calls.find((call) =>
      String((call[0] as { strings?: string[] })?.strings?.join(' ') ?? call[0]).includes(
        'invoice_number_counters',
      ),
    );
    expect(counterCall).toBeTruthy();
  });
});

describe('CreditNoteService.issueCreditNote — tax from the frozen snapshot (T-06-72)', () => {
  it('reproduces the original line tax exactly when the whole line is credited', async () => {
    const { service, tx } = build();

    const result = await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118000));

    const header = tx.creditNote.create.mock.calls[0][0].data;
    expect(header).toMatchObject({
      taxableValuePaise: 100000,
      cgstPaise: 9000,
      sgstPaise: 9000,
      igstPaise: 0,
      totalPaise: 118000,
    });
    // The heads are already rounded, so the disclosure delta is never added
    // back into the total (the 06-05 invariant).
    expect(header.taxableValuePaise as number).toBe(100000);
    expect(
      (header.taxableValuePaise as number) +
        (header.cgstPaise as number) +
        (header.sgstPaise as number) +
        (header.igstPaise as number),
    ).toBe(header.totalPaise);

    expect(result.totalPaise).toBe(118000);
  });

  it('uses the line’s frozen rate, not whatever the clinic is set to now', async () => {
    // The clinic has since moved to 5%. The double exposes no clinic row at
    // all, so a service that read one would throw — which is the point.
    const { service, tx } = build();

    await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(59000));

    const lines = tx.creditNoteLineItem.createMany.mock.calls[0][0].data;
    expect(lines[0]).toMatchObject({ gstRatePercent: 18, taxTreatment: 'taxable' });
    expect(tx).not.toHaveProperty('clinic');
  });

  it('credits an exempt line with zero tax and classifies the document as a bill of supply', async () => {
    const { service, tx } = build();

    const result = await service.issueCreditNote(CLINIC, INVOICE, ACTOR, {
      reason: 'service_not_provided',
      items: [{ invoiceLineItemId: LINE_EXEMPT, creditAmountPaise: 50000 }],
    });

    const header = tx.creditNote.create.mock.calls[0][0].data;
    expect(header).toMatchObject({
      taxableValuePaise: 50000,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalPaise: 50000,
    });
    expect(result.documentType).toBe('bill_of_supply');
  });

  it('charges IGST when the original invoice was inter-state', async () => {
    const { service, tx } = build({ invoice: { is_inter_state: true } });

    await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118000));

    const header = tx.creditNote.create.mock.calls[0][0].data;
    expect(header).toMatchObject({ igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 });
  });

  it('credits no tax when the invoice was issued by an unregistered clinic', async () => {
    const { service, tx } = build({ invoice: { gst_enabled_snapshot: false } });

    await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(100000));

    const header = tx.creditNote.create.mock.calls[0][0].data;
    expect(header).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 0 });
  });

  it('splits a partial credit between the line’s taxable and tax components', async () => {
    const { service, tx } = build();

    // Half of a 118000 tax-inclusive line: 50000 taxable + 9000 GST.
    await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(59000));

    const header = tx.creditNote.create.mock.calls[0][0].data;
    expect(header.taxableValuePaise).toBe(50000);
    expect((header.cgstPaise as number) + (header.sgstPaise as number)).toBe(9000);
    expect(header.totalPaise).toBe(59000);
  });
});

describe('CreditNoteService.issueCreditNote — bounds (T-06-70, T-06-71)', () => {
  it('rejects a line credit larger than the original line total', async () => {
    const { service, tx } = build();

    await expect(
      service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118001)),
    ).rejects.toMatchObject({ statusCode: 400, code: 'CREDIT_EXCEEDS_LINE_TOTAL' });

    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it('counts what an earlier credit note already took off the same line', async () => {
    const { service } = build({
      creditNoteLines: [{ invoiceLineItemId: LINE_TAXABLE, totalPaise: 100000 }],
      creditNotes: [{ id: 'cn-0', totalPaise: 100000 }],
    });

    await expect(
      service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(50000)),
    ).rejects.toMatchObject({ statusCode: 400, code: 'CREDIT_EXCEEDS_LINE_TOTAL' });
  });

  it('rejects a credit that would take the invoice past its grand total', async () => {
    const { service } = build({
      creditNotes: [{ id: 'cn-0', totalPaise: 160000 }],
    });

    await expect(
      service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118000)),
    ).rejects.toMatchObject({ statusCode: 400, code: 'CREDIT_EXCEEDS_INVOICE_TOTAL' });
  });

  it('404s a line item that is not on this invoice (cross-invoice, cross-tenant)', async () => {
    const { service, tx } = build();

    await expect(
      service.issueCreditNote(CLINIC, INVOICE, ACTOR, {
        reason: 'incorrect_charge',
        items: [
          { invoiceLineItemId: '99999999-9999-4999-8999-999999999999', creditAmountPaise: 1000 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'CREDIT_LINE_NOT_FOUND' });

    // The lookup was scoped by clinic AND invoice, so a valid id from another
    // tenant reads as absent rather than forbidden.
    const where = tx.invoiceLineItem.findMany.mock.calls[0][0].where as Row;
    expect(where).toMatchObject({ clinicId: CLINIC, invoiceId: INVOICE });
  });

  it('refuses a DRAFT invoice (edit it) and a VOIDED one (no balance left)', async () => {
    for (const status of ['DRAFT', 'VOIDED']) {
      const { service } = build({ invoice: { status } });

      await expect(
        service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(1000)),
      ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATE_TRANSITION' });
    }
  });

  it('404s an invoice that does not exist for this clinic', async () => {
    const { service } = build({ invoice: null });

    await expect(
      service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(1000)),
    ).rejects.toMatchObject({ statusCode: 404, code: 'INVOICE_NOT_FOUND' });
  });

  it('rejects a reason of "other" with no explanation', async () => {
    const { service } = build();

    await expect(
      service.issueCreditNote(CLINIC, INVOICE, ACTOR, {
        reason: 'other',
        items: [{ invoiceLineItemId: LINE_TAXABLE, creditAmountPaise: 1000 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });
});

describe('CreditNoteService.issueCreditNote — immutability and derivation (T-06-69, T-06-74)', () => {
  it('never touches the invoice or its line items', async () => {
    const { service, tx, repository } = build();

    await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118000));

    // The double offers no mutation surface on either. Reaching for one would
    // throw; the balance is instead derived from the credit-note rows.
    expect(tx.invoiceLineItem).not.toHaveProperty('update');
    expect(tx).not.toHaveProperty('invoice');
    expect(repository.recomputePaymentState).toHaveBeenCalledWith(tx, CLINIC, INVOICE);
  });

  it('writes the CREDIT_NOTE_ISSUED audit row inside the same transaction', async () => {
    const { service, tx, prisma } = build();

    const result = await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118000));

    expect(tx.billingAuditLog.create).toHaveBeenCalledTimes(1);
    const data = tx.billingAuditLog.create.mock.calls[0][0].data as Row;
    expect(data).toMatchObject({ clinicId: CLINIC, invoiceId: INVOICE, event: 'CREDIT_NOTE_ISSUED' });
    expect(data.metadata).toMatchObject({
      creditNoteNumber: result.creditNoteNumber,
      totalPaise: 118000,
      invoiceNumber: 'INV-202608-0001',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('carries the original description, HSN and a proportional quantity onto the credit line', async () => {
    const { service, tx } = build();

    await service.issueCreditNote(CLINIC, INVOICE, ACTOR, creditTaxableLine(118000));

    const lines = tx.creditNoteLineItem.createMany.mock.calls[0][0].data;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      clinicId: CLINIC,
      invoiceLineItemId: LINE_TAXABLE,
      description: 'Amoxicillin 250mg',
      hsnSacCode: '3004',
      // The whole line was credited, so the whole quantity comes back.
      quantity: 10,
      totalPaise: 118000,
    });
  });
});
