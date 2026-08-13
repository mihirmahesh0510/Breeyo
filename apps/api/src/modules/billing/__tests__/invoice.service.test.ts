import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { InvoiceService } from '../invoice.service.js';

/**
 * Draft assembly, the money boundary, and the finalize orchestration, against
 * mocked collaborators — the `emr.service.test.ts` style.
 *
 * The two assertions this file exists for are the two that silently corrupt
 * data when they regress:
 *
 *   * a dispensed line's quantity comes from the stock movement, never a
 *     default of 1 (the clinical record carries no quantity at all), and
 *   * a consultation-sourced line is stamped, never deducted a second time.
 */

const CLINIC = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const CONSULT = '33333333-3333-4333-8333-333333333333';
const PET = '44444444-4444-4444-8444-444444444444';
const OWNER = '55555555-5555-4555-8555-555555555555';
const ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ACTOR = { userId: 'user-1', userName: 'Front Desk' };

function movement(overrides: Record<string, unknown> = {}) {
  return {
    movementId: 'mv-1',
    inventoryItemId: ITEM,
    description: 'Meloxicam 5mg',
    quantity: 12,
    unitPrice: new Prisma.Decimal('45.50'),
    hsnSacCode: '3004',
    gstRate: new Prisma.Decimal('12'),
    ...overrides,
  };
}

function clinic(overrides: Record<string, unknown> = {}) {
  return {
    id: CLINIC,
    gstEnabled: true,
    stateCode: '29',
    defaultGstRate: null as Prisma.Decimal | null,
    defaultDueDays: 7,
    gstin: '29ABCDE1234F1Z5',
    ...overrides,
  };
}

function lineItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    lineType: 'product',
    sortOrder: 0,
    serviceCatalogId: null,
    inventoryItemId: ITEM,
    stockMovementId: null,
    description: 'Meloxicam 5mg',
    hsnSacCode: '3004',
    quantity: 2,
    unitPricePaise: 5000,
    lineDiscountPaise: 0,
    taxTreatment: 'taxable',
    gstRatePercent: new Prisma.Decimal('12'),
    ...overrides,
  };
}

function build(options: {
  movements?: ReturnType<typeof movement>[];
  clinic?: ReturnType<typeof clinic>;
  invoice?: Record<string, unknown> | null;
  lineItems?: ReturnType<typeof lineItem>[];
  existingDraft?: Record<string, unknown> | null;
} = {}) {
  const repository = {
    findUninvoicedDispensedMovements: vi.fn(async () => options.movements ?? []),
    createDraft: vi.fn(async () => ({ id: INVOICE })),
    getDraft: vi.fn(async () => ({ id: INVOICE, lineItems: [] })),
    updateDraft: vi.fn(async () => true),
    deleteDraft: vi.fn(async () => true),
    finalizeInvoice: vi.fn(async () => ({
      invoice: { id: INVOICE },
      invoiceNumber: 'INV-202608-0001',
      deductions: [],
    })),
    voidInvoice: vi.fn(async () => ({
      invoiceId: INVOICE,
      restoredMovementCount: 0,
      cancelledPaymentLinkIds: [],
    })),
    recomputePaymentState: vi.fn(async () => undefined),
    getInvoiceDetail: vi.fn(async () => ({ id: INVOICE })),
    listInvoices: vi.fn(async () => ({ items: [], nextCursor: null })),
    getInvoicesForPet: vi.fn(async () => ({ items: [], nextCursor: null })),
    getLineItems: vi.fn(async () => options.lineItems ?? []),
    findDraftByConsultation: vi.fn(async () => options.existingDraft ?? null),
    getInvoice: vi.fn(async () => options.invoice ?? null),
  };

  const tx = {
    payment: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    billingAuditLog: { create: vi.fn(async () => ({})) },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    clinic: { findUnique: vi.fn(async () => options.clinic ?? clinic()) },
    consultation: {
      findFirst: vi.fn(async () => ({ id: CONSULT, petId: PET, pet: { ownerId: OWNER } })),
    },
    serviceCatalog: { findMany: vi.fn(async () => []) },
    inventoryItem: { findMany: vi.fn(async () => []) },
    billingAuditLog: { create: vi.fn(async () => ({})) },
  };

  const stockValidator = { checkAvailability: vi.fn(async () => []) };

  const service = new InvoiceService(repository as any, stockValidator as any, prisma as any);
  return { service, repository, prisma, stockValidator, tx };
}

describe('InvoiceService.createDraftFromConsultation — BIL-01 sourcing', () => {
  it('uses the movement quantity rather than defaulting to a quantity of 1', async () => {
    const { service, repository } = build({ movements: [movement({ quantity: 12 })] });

    await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    const draft = (repository.createDraft.mock.calls[0] as any[])[1];
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0].quantity).toBe(12);
  });

  it('prices the line from the dispense-time snapshot, converted once at the money boundary', async () => {
    const { service, repository } = build({
      movements: [movement({ unitPrice: new Prisma.Decimal('45.50'), quantity: 2 })],
    });

    await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    const draft = (repository.createDraft.mock.calls[0] as any[])[1];
    // 45.50 rupees is 4550 paise, not 45.5 and not 455000.
    expect(draft.lineItems[0].unitPricePaise).toBe(4550);
    expect(draft.lineItems[0].lineTotalPaise).toBe(9100);
  });

  it('carries the stockMovementId onto the line so finalize knows the stock already moved', async () => {
    const { service, repository } = build({ movements: [movement({ movementId: 'mv-42' })] });

    await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    const draft = (repository.createDraft.mock.calls[0] as any[])[1];
    expect(draft.lineItems[0].stockMovementId).toBe('mv-42');
    expect(draft.source).toBe('consultation');
  });

  it('takes the GST rate from the item when it has one', async () => {
    const { service, repository } = build({
      movements: [movement({ gstRate: new Prisma.Decimal('12') })],
    });

    await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    const draft = (repository.createDraft.mock.calls[0] as any[])[1];
    expect(draft.lineItems[0].gstRatePercent).toBe(12);
    expect(draft.lineItems[0].taxTreatment).toBe('taxable');
  });

  it('falls back to the clinic default rate when the item has none', async () => {
    const { service, repository } = build({
      movements: [movement({ gstRate: null })],
      clinic: clinic({ defaultGstRate: new Prisma.Decimal('5') }),
    });

    await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    const draft = (repository.createDraft.mock.calls[0] as any[])[1];
    expect(draft.lineItems[0].gstRatePercent).toBe(5);
  });

  it('falls back to 18 when neither the item nor the clinic sets a rate', async () => {
    const { service, repository } = build({
      movements: [movement({ gstRate: null })],
      clinic: clinic({ defaultGstRate: null }),
    });

    await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    const draft = (repository.createDraft.mock.calls[0] as any[])[1];
    expect(draft.lineItems[0].gstRatePercent).toBe(18);
  });

  it('treats a zero rate as exempt rather than as taxable-at-zero', async () => {
    const { service, repository } = build({
      movements: [movement({ gstRate: new Prisma.Decimal('0') })],
    });

    await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    const draft = (repository.createDraft.mock.calls[0] as any[])[1];
    expect(draft.lineItems[0].gstRatePercent).toBe(0);
    expect(draft.lineItems[0].taxTreatment).toBe('exempt');
  });

  it('is idempotent: a second call returns the existing draft instead of creating another', async () => {
    const { service, repository } = build({
      movements: [movement()],
      existingDraft: { id: 'existing-draft', lineItems: [] },
    });

    const result = await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    expect(result).toMatchObject({ id: 'existing-draft' });
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it('converts a P2002 unique violation on the one-draft index into a fetch of the existing draft', async () => {
    const { service, repository } = build({ movements: [movement()] });
    repository.createDraft = vi.fn(async () => {
      throw new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
    }) as any;
    repository.findDraftByConsultation = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'raced-draft', lineItems: [] }) as any;

    const result = await service.createDraftFromConsultation(CLINIC, CONSULT, ACTOR);

    expect(result).toMatchObject({ id: 'raced-draft' });
  });
});

describe('InvoiceService.buildProductLineStockPlan — the deduct/skip discriminator', () => {
  it('returns only the manual line from a three-line stock plan fixture', () => {
    const { service } = build();

    const plan = service.buildProductLineStockPlan([
      lineItem({ id: 'svc', lineType: 'service', inventoryItemId: null, stockMovementId: null }),
      lineItem({ id: 'dispensed', inventoryItemId: ITEM, stockMovementId: 'mv-1' }),
      lineItem({ id: 'manual', inventoryItemId: ITEM, stockMovementId: null }),
    ] as any);

    expect(plan).toHaveLength(1);
    expect(plan[0].lineId).toBe('manual');
    expect(plan[0].stockMovementId).toBeNull();
  });

  it('returns an empty stock plan for a wholly consultation-sourced invoice', () => {
    const { service } = build();

    const plan = service.buildProductLineStockPlan([
      lineItem({ id: 'a', stockMovementId: 'mv-1' }),
      lineItem({ id: 'b', stockMovementId: 'mv-2' }),
    ] as any);

    expect(plan).toEqual([]);
  });
});

describe('InvoiceService.finalize', () => {
  const draftInvoice = { id: INVOICE, status: 'DRAFT', exceptionFlag: null };

  it('passes an empty plan so there is no double deduction on a consultation-sourced invoice', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      lineItems: [lineItem({ id: 'l1', stockMovementId: 'mv-1' })],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const stockPlan = (repository.finalizeInvoice.mock.calls[0] as any[])[3];
    expect(stockPlan).toEqual([]);
  });

  it('deducts exactly the manual lines and leaves the dispensed lines untouched', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      lineItems: [
        lineItem({ id: 'dispensed', stockMovementId: 'mv-1', quantity: 5 }),
        lineItem({ id: 'manual', stockMovementId: null, quantity: 3 }),
      ],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const stockPlan = (repository.finalizeInvoice.mock.calls[0] as any[])[3];
    expect(stockPlan).toHaveLength(1);
    expect(stockPlan[0]).toMatchObject({ lineId: 'manual', quantity: 3 });
  });

  it('hands the ids of the consultation movements over for stamping', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      lineItems: [
        lineItem({ id: 'l1', stockMovementId: 'mv-1' }),
        lineItem({ id: 'l2', stockMovementId: 'mv-2' }),
        lineItem({ id: 'l3', stockMovementId: null }),
      ],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const computed = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    expect(computed.sourceStockMovementIds).toEqual(['mv-1', 'mv-2']);
  });

  it('ignores client totals entirely and recomputes from the persisted line items', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      lineItems: [lineItem({ quantity: 2, unitPricePaise: 5000, gstRatePercent: new Prisma.Decimal('12') })],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {
      grandTotalPaise: 1,
      taxableValuePaise: 1,
      cgstPaise: 999999,
    } as any);

    const computed = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    // 2 x 5000 = 10000 taxable, 12% = 1200 split 600/600, total 11200.
    expect(computed.taxableValuePaise).toBe(10000);
    expect(computed.cgstPaise).toBe(600);
    expect(computed.grandTotalPaise).toBe(11200);
  });

  it('never adds the round-off back into the grand total', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      lineItems: [lineItem({ quantity: 1, unitPricePaise: 9999, gstRatePercent: new Prisma.Decimal('18') })],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const c = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    expect(c.grandTotalPaise).toBe(c.taxableValuePaise + c.cgstPaise + c.sgstPaise + c.igstPaise);
  });

  it('produces zero tax and a plain invoice when the clinic has GST disabled', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      clinic: clinic({ gstEnabled: false, gstin: null }),
      lineItems: [lineItem({ quantity: 2, unitPricePaise: 5000 })],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const c = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    expect(c.cgstPaise).toBe(0);
    expect(c.sgstPaise).toBe(0);
    expect(c.igstPaise).toBe(0);
    expect(c.documentType).toBe('invoice');
    expect(c.gstEnabledSnapshot).toBe(false);
    expect(c.clinicGstinSnapshot).toBeNull();
  });

  it('defaults the place of supply to the clinic state, making a walk-in intra-state', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      lineItems: [lineItem()],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const c = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    expect(c.placeOfSupplyStateCode).toBe('29');
    expect(c.isInterState).toBe(false);
    expect(c.igstPaise).toBe(0);
  });

  it('charges IGST when the place of supply is another state', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      lineItems: [lineItem({ quantity: 2, unitPricePaise: 5000 })],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, { placeOfSupplyStateCode: '27' });

    const c = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    expect(c.isInterState).toBe(true);
    expect(c.igstPaise).toBe(1200);
    expect(c.cgstPaise).toBe(0);
  });

  it('computes the due date from the clinic default when the request supplies none (D-23)', async () => {
    const { service, repository } = build({
      invoice: draftInvoice,
      clinic: clinic({ defaultDueDays: 7 }),
      lineItems: [lineItem()],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const c = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    expect(c.dueDate).toBeInstanceOf(Date);
    const days = Math.round((c.dueDate.getTime() - Date.now()) / 86_400_000);
    expect(days).toBe(7);
  });

  it('pushes an invoice-level discount down onto the lines before tax (Section 15(3)(a))', async () => {
    const { service, repository } = build({
      invoice: { ...draftInvoice, invoiceDiscountType: 'flat', invoiceDiscountValue: 2000 },
      lineItems: [lineItem({ quantity: 2, unitPricePaise: 5000 })],
    });

    await service.finalize(CLINIC, INVOICE, ACTOR, {});

    const c = (repository.finalizeInvoice.mock.calls[0] as any[])[2];
    expect(c.invoiceDiscountPaise).toBe(2000);
    expect(c.taxableValuePaise).toBe(8000);
    // Tax on the discounted base, not on the pre-discount amount.
    expect(c.cgstPaise + c.sgstPaise).toBe(960);
  });
});

describe('InvoiceService.previewTotals', () => {
  it('computes totals without persisting anything', async () => {
    const { service, repository } = build({
      invoice: { id: INVOICE, status: 'DRAFT', exceptionFlag: null },
      lineItems: [lineItem({ quantity: 2, unitPricePaise: 5000 })],
    });

    const preview = await service.previewTotals(CLINIC, INVOICE);

    expect(preview.grandTotalPaise).toBe(11200);
    expect(repository.finalizeInvoice).not.toHaveBeenCalled();
    expect(repository.updateDraft).not.toHaveBeenCalled();
  });
});
