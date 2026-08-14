import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickSaleService } from '../quick-sale.service.js';

/**
 * The D-04 Quick Sale totals preview.
 *
 * ## Why this endpoint exists at all
 *
 * `POST /billing/invoices/preview-totals` computes from an invoice's PERSISTED
 * line items and takes only an `invoiceId`. A Quick Sale has no invoice until
 * the moment of checkout — creation and finalize are one request — so that
 * endpoint cannot answer "what will this cart cost?", which is the one question
 * the counter screen must answer before the customer hands over money.
 *
 * The alternative was computing the figure on the device. That is precisely
 * what T-06-122 forbids: the grand total is the taxable value plus three heads
 * already rounded once at invoice level under Section 170 / Rule 51, so a
 * client re-derivation would be a second implementation of a statutory rounding
 * rule and the two would disagree on the first sale with a fractional head —
 * with the customer standing there holding cash.
 *
 * ## It must agree with checkout, by construction
 *
 * This preview resolves and prices the cart through the same `resolveLines` the
 * committing path uses, and taxes it through the same `allocateInvoiceDiscount`
 * / `computeInvoiceTax` engine. The engine runs for real here rather than being
 * stubbed, because agreement with the invoice is the behaviour under test.
 *
 * ## It writes nothing
 *
 * The prisma double below has no `$transaction`, no `invoice.create` and no
 * `stockMovement` surface at all. If the preview ever reached for one the test
 * would fail with a TypeError rather than quietly passing — a preview that
 * deducted stock would let a browsing customer empty the shelf.
 */

const CLINIC = '11111111-1111-4111-8111-111111111111';
const FOOD = '22222222-2222-4222-8222-222222222222';
const EXEMPT_ITEM = '33333333-3333-4333-8333-333333333333';

type Row = Record<string, unknown>;

function clinicRow(overrides: Row = {}) {
  return {
    gstEnabled: true,
    stateCode: '27',
    defaultGstRate: 18,
    defaultDueDays: 7,
    gstin: '27AAPFU0939F1ZV',
    ...overrides,
  };
}

/** ₹1,250.00 a tin, 18% — the ordinary counter-sale product. */
function foodRow(overrides: Row = {}) {
  return {
    id: FOOD,
    name: 'Royal Canin Adult 2kg',
    sellingPrice: 1250,
    hsnSacCode: '2309',
    gstRate: 18,
    ...overrides,
  };
}

/** A nil-rated good: rate 0 means the line is exempt, not taxable at zero. */
function exemptRow(overrides: Row = {}) {
  return {
    id: EXEMPT_ITEM,
    name: 'Prescription Diet Sample',
    sellingPrice: 500,
    hsnSacCode: '2309',
    gstRate: 0,
    ...overrides,
  };
}

function buildService(opts: { clinic?: Row | null; items?: Row[] } = {}) {
  const prisma = {
    clinic: {
      findUnique: vi.fn().mockResolvedValue(
        opts.clinic === undefined ? clinicRow() : opts.clinic,
      ),
    },
    inventoryItem: {
      findMany: vi.fn().mockResolvedValue(opts.items ?? [foodRow()]),
    },
  };

  // The repository and stock validator are unreachable from the preview path.
  // Passing empty objects means any reach for one throws rather than passing.
  const service = new QuickSaleService(
    {} as never,
    {} as never,
    prisma as never,
  );

  return { service, prisma };
}

describe('QuickSaleService.previewTotals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prices a cart from the item selling price and the engine tax', async () => {
    const { service } = buildService();

    const preview = await service.previewTotals(CLINIC, {
      items: [{ inventoryItemId: FOOD, quantity: 2 }],
    });

    // 2 x ₹1,250.00 = ₹2,500.00 taxable, 18% -> ₹450.00 split CGST/SGST.
    expect(preview.subtotalPaise).toBe(250_000);
    expect(preview.breakdown.taxableValuePaise).toBe(250_000);
    expect(preview.breakdown.cgstPaise).toBe(22_500);
    expect(preview.breakdown.sgstPaise).toBe(22_500);
    expect(preview.breakdown.grandTotalPaise).toBe(295_000);
  });

  it('treats a counter sale as intra-state, so IGST is never charged', async () => {
    const { service } = buildService();

    const preview = await service.previewTotals(CLINIC, {
      items: [{ inventoryItemId: FOOD, quantity: 1 }],
    });

    // The customer is standing at the counter: the supply happens in the
    // clinic's own state, exactly as the committing path assumes.
    expect(preview.breakdown.igstPaise).toBe(0);
  });

  it('reports gstEnabled false and charges no tax for an unregistered clinic', async () => {
    const { service } = buildService({ clinic: clinicRow({ gstEnabled: false, gstin: null }) });

    const preview = await service.previewTotals(CLINIC, {
      items: [{ inventoryItemId: FOOD, quantity: 2 }],
    });

    // D-17 / Section 122: a clinic below the registration threshold must not be
    // shown a GST row at all, let alone collect against one.
    expect(preview.gstEnabled).toBe(false);
    expect(preview.breakdown.cgstPaise).toBe(0);
    expect(preview.breakdown.sgstPaise).toBe(0);
    expect(preview.breakdown.grandTotalPaise).toBe(250_000);
  });

  it('carries a nil-rated item as exempt rather than taxable at zero', async () => {
    const { service } = buildService({ items: [exemptRow()] });

    const preview = await service.previewTotals(CLINIC, {
      items: [{ inventoryItemId: EXEMPT_ITEM, quantity: 1 }],
    });

    expect(preview.subtotalPaise).toBe(50_000);
    expect(preview.breakdown.cgstPaise).toBe(0);
    expect(preview.breakdown.grandTotalPaise).toBe(50_000);
  });

  it('agrees with the committing path on a mixed exempt and taxable cart', async () => {
    const { service } = buildService({ items: [foodRow(), exemptRow()] });

    const preview = await service.previewTotals(CLINIC, {
      items: [
        { inventoryItemId: FOOD, quantity: 1 },
        { inventoryItemId: EXEMPT_ITEM, quantity: 2 },
      ],
    });

    // ₹1,250.00 taxable + ₹1,000.00 exempt = ₹2,250.00 subtotal; tax only on
    // the taxable line.
    expect(preview.subtotalPaise).toBe(225_000);

    // 9% of ₹1,250.00 is ₹112.50 exactly, and each head is rounded to a whole
    // rupee ONCE at invoice level (Section 170 / Rule 51) — so ₹113.00, not
    // ₹112.50. This is the precise case a client-side re-derivation gets wrong:
    // a device summing 9% per head would show ₹2,475.00 while the invoice said
    // ₹2,476.00, at the counter, out loud.
    expect(preview.breakdown.cgstPaise).toBe(11_300);
    expect(preview.breakdown.sgstPaise).toBe(11_300);
    expect(preview.breakdown.grandTotalPaise).toBe(247_600);

    // The residue is disclosed rather than folded into the total.
    expect(preview.breakdown.roundOffPaise).toBe(100);
  });

  it('rejects an unknown or cross-tenant item as not found', async () => {
    const { service } = buildService({ items: [] });

    await expect(
      service.previewTotals(CLINIC, { items: [{ inventoryItemId: FOOD, quantity: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'INVENTORY_ITEM_NOT_FOUND' });
  });

  it('rejects a cart the checkout schema would reject', async () => {
    const { service } = buildService();

    await expect(service.previewTotals(CLINIC, { items: [] })).rejects.toThrow();
  });

  it('scopes the inventory read to the calling clinic', async () => {
    const { service, prisma } = buildService();

    await service.previewTotals(CLINIC, {
      items: [{ inventoryItemId: FOOD, quantity: 1 }],
    });

    // T-06-89: an item belonging to another clinic must read as absent, not as
    // forbidden — a 403 would confirm that some other clinic stocks it.
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clinicId: CLINIC }) }),
    );
  });

  it('writes nothing — no transaction is ever opened', async () => {
    const { service, prisma } = buildService();

    await service.previewTotals(CLINIC, {
      items: [{ inventoryItemId: FOOD, quantity: 3 }],
    });

    expect(prisma).not.toHaveProperty('$transaction');
  });
});
