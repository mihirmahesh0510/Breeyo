/**
 * The invoice builder screen's behaviour, tested at its decision layer.
 *
 * ## Why this file imports a `lib/` module rather than rendering the screen
 *
 * `apps/mobile` cannot render a React Native component under test: vitest runs
 * the `node` environment with no Metro/Babel transform, so `import
 * 'react-native'` fails at parse time, and `react-test-renderer` is not
 * installed. This is a pre-existing, app-wide constraint that 06-14, 06-15,
 * 06-16 and 06-23 each hit and each resolved the same way — the decisions move
 * into a React-Native-free module and the `.tsx` becomes a thin renderer over
 * it.
 *
 * So every behaviour the plan specifies for `InvoiceBuilderScreen` is asserted
 * here against `lib/builder-screen.ts`, which is the module the screen delegates
 * every one of those decisions to. The screen contributes layout and nothing
 * else. A test that rendered the screen and asserted on a rendered string would
 * be strictly weaker than these — it could not reach the finalize request body
 * at all, which is the assertion this file exists for.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { StockShortfall, TaxBreakdown } from '@breeyo/types';
import { ApiClientError } from '../../../lib/api';
import {
  useInvoiceBuilderStore,
  toInvoiceLineItemInputs,
  type InvoiceBuilderLine,
} from '../stores/invoiceBuilderStore';
import {
  BUILDER_SCREEN_COPY,
  buildDraftPayload,
  buildFinalizeInput,
  classifyFinalizeError,
  draftFromInvoiceDetail,
  inventoryLineFrom,
  inventorySellingPriceToPaise,
  isFinalizeBlocked,
  linesSignature,
  partitionLines,
  screenTitle,
  serviceLineFrom,
  shortfallLocalIds,
  totalsToRender,
  type FinalizeBlock,
} from '../lib/builder-screen';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const SERVICE_LINE: InvoiceBuilderLine = {
  localId: 'line-1',
  lineType: 'service',
  serviceCatalogId: '11111111-1111-4111-8111-111111111111',
  description: 'General Consultation',
  quantity: 1,
  unitPricePaise: 50_000,
  taxTreatment: 'taxable',
  gstRatePercent: 18,
};

/** A product line carrying stock provenance — the D-01 dispensed case. */
const DISPENSED_PRODUCT_LINE: InvoiceBuilderLine = {
  localId: 'line-2',
  lineType: 'product',
  inventoryItemId: '22222222-2222-4222-8222-222222222222',
  stockMovementId: '33333333-3333-4333-8333-333333333333',
  description: 'Amoxicillin 250mg',
  quantity: 6,
  unitPricePaise: 4_500,
  taxTreatment: 'taxable',
  gstRatePercent: 5,
};

function insufficientStockError(shortfalls: unknown): ApiClientError {
  return new ApiClientError('Insufficient stock', 'INSUFFICIENT_STOCK', 409, { shortfalls });
}

function notDraftError(): ApiClientError {
  return new ApiClientError('Invoice is not a draft', 'INVOICE_NOT_DRAFT', 409, {});
}

const BREAKDOWN: TaxBreakdown = {
  taxableValuePaise: 90_000,
  cgstPaise: 8_100,
  sgstPaise: 8_100,
  igstPaise: 0,
  roundOffPaise: 0,
  grandTotalPaise: 106_200,
  documentType: 'tax_invoice',
} as TaxBreakdown;

const AMOUNTS = { subtotalPaise: 100_000, invoiceDiscountPaise: 10_000 };

beforeEach(() => {
  useInvoiceBuilderStore.getState().reset();
});

// ─── 1. Opening from a consultation ─────────────────────────────────────────

describe('opening the builder for an existing draft', () => {
  it('shows the dispensed products with their real quantities after hydrate', () => {
    useInvoiceBuilderStore.getState().hydrate({
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
      dueDate: null,
      notes: null,
      lineItems: [
        {
          lineType: 'product',
          serviceCatalogId: null,
          inventoryItemId: '22222222-2222-4222-8222-222222222222',
          stockMovementId: '33333333-3333-4333-8333-333333333333',
          description: 'Amoxicillin 250mg',
          hsnSacCode: '3004',
          quantity: 6,
          unitPricePaise: 4_500,
          discountType: null,
          discountValue: null,
          taxTreatment: 'taxable',
          gstRatePercent: 5,
        },
      ],
    });

    const { lines } = useInvoiceBuilderStore.getState();
    expect(lines).toHaveLength(1);
    // The real dispensed quantity, not a default of 1.
    expect(lines[0].quantity).toBe(6);
    expect(lines[0].description).toBe('Amoxicillin 250mg');
    expect(lines[0].stockMovementId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('titles the screen for the pet when one is known', () => {
    expect(screenTitle('Bruno')).toBe('Invoice for Bruno');
  });

  it('normalises the fetched due date to an ISO string before hydrating', () => {
    // `InvoiceDetail.dueDate` is declared `Date | null` but arrives from JSON as
    // a string. Both must survive; the store and the save schema want a string.
    const fromWire = draftFromInvoiceDetail({
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
      dueDate: '2026-09-01T00:00:00.000Z',
      notes: null,
      lineItems: [],
    });
    expect(fromWire.dueDate).toBe('2026-09-01T00:00:00.000Z');

    const fromDate = draftFromInvoiceDetail({
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
      notes: null,
      lineItems: [],
    });
    expect(fromDate.dueDate).toBe('2026-09-01T00:00:00.000Z');

    const missing = draftFromInvoiceDetail({
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
      dueDate: null,
      notes: null,
      lineItems: [],
    });
    expect(missing.dueDate).toBeNull();
  });

  it('orders the hydrated lines by sortOrder rather than by array position', () => {
    const draft = draftFromInvoiceDetail({
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
      dueDate: null,
      notes: null,
      lineItems: [
        { ...DISPENSED_PRODUCT_LINE, sortOrder: 2, description: 'second' } as never,
        { ...SERVICE_LINE, sortOrder: 1, description: 'first' } as never,
      ],
    });

    expect(draft.lineItems.map((line) => line.description)).toEqual(['first', 'second']);
  });
});

// ─── 2. Opening standalone ──────────────────────────────────────────────────

describe('opening the builder standalone', () => {
  it('titles the screen New Invoice and starts with no lines', () => {
    expect(screenTitle(null)).toBe('New Invoice');
    expect(screenTitle(undefined)).toBe('New Invoice');
    expect(screenTitle('   ')).toBe('New Invoice');
    expect(useInvoiceBuilderStore.getState().lines).toEqual([]);
  });
});

// ─── 3. Sections and the dispensed caption ──────────────────────────────────

describe('the Services and Products sections', () => {
  it('splits lines by type and flags the dispensed caption only when a line carries stock provenance', () => {
    const withDispensed = partitionLines([SERVICE_LINE, DISPENSED_PRODUCT_LINE]);
    expect(withDispensed.services).toHaveLength(1);
    expect(withDispensed.products).toHaveLength(1);
    expect(withDispensed.hasDispensedProducts).toBe(true);

    // A product added by hand from the catalog has no stockMovementId, so the
    // caption would be a false claim about where the line came from.
    const manualProduct: InvoiceBuilderLine = { ...DISPENSED_PRODUCT_LINE, stockMovementId: undefined };
    expect(partitionLines([manualProduct]).hasDispensedProducts).toBe(false);
  });
});

// ─── 4. The debounced preview and what changes trigger it ───────────────────

describe('the change signature that drives the debounced preview', () => {
  it('changes when a line is added', () => {
    const before = linesSignature([SERVICE_LINE], null, null);
    const after = linesSignature([SERVICE_LINE, DISPENSED_PRODUCT_LINE], null, null);
    expect(after).not.toBe(before);
  });

  it('changes when a quantity changes', () => {
    const before = linesSignature([SERVICE_LINE], null, null);
    const after = linesSignature([{ ...SERVICE_LINE, quantity: 3 }], null, null);
    expect(after).not.toBe(before);
  });

  it('changes when the invoice-level discount changes', () => {
    const before = linesSignature([SERVICE_LINE], null, null);
    const after = linesSignature([SERVICE_LINE], 'percent', 10);
    expect(after).not.toBe(before);
  });

  it('does not change when only an unbilled field moves', () => {
    // `localId` never reaches the server and must not cost a round trip.
    const before = linesSignature([SERVICE_LINE], null, null);
    const after = linesSignature([{ ...SERVICE_LINE, localId: 'line-99' }], null, null);
    expect(after).toBe(before);
  });
});

// ─── 5. Save Draft carries no money ─────────────────────────────────────────

describe('the Save Draft request body', () => {
  it('carries the line items, the discount and the notes, and no total of any kind', () => {
    const body = buildDraftPayload({
      lines: [SERVICE_LINE, DISPENSED_PRODUCT_LINE],
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 10,
      dueDate: null,
      notes: 'Recheck in a week',
      petId: '44444444-4444-4444-8444-444444444444',
      ownerId: '55555555-5555-4555-8555-555555555555',
      consultationId: null,
      source: 'manual',
    });

    expect(body.lineItems).toHaveLength(2);
    expect(body.invoiceDiscountValue).toBe(10);
    expect(body.notes).toBe('Recheck in a week');

    for (const key of Object.keys(body)) {
      expect(key).not.toMatch(/total|cgst|sgst|igst|taxable/i);
    }
    for (const line of body.lineItems) {
      for (const key of Object.keys(line)) {
        expect(key).not.toMatch(/total|cgst|sgst|igst|taxable/i);
      }
    }
  });

  it('omits an absent due date so the server applies the clinic default', () => {
    const body = buildDraftPayload({
      lines: [SERVICE_LINE],
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
      dueDate: null,
      notes: '',
      petId: null,
      ownerId: null,
      consultationId: null,
      source: 'manual',
    });

    expect('dueDate' in body).toBe(false);
    expect('notes' in body).toBe(false);
  });

  /**
   * CR-01. The builder sends the whole draft, so "no discount in the store" is a
   * statement about what this invoice should be, not an absence of information.
   * Omitting the pair meant "leave the stored discount alone", and a discount
   * cleared on this screen therefore survived onto the finalized document.
   */
  it('sends an explicit null discount pair so clearing a discount actually clears it', () => {
    const body = buildDraftPayload({
      lines: [SERVICE_LINE],
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
      dueDate: null,
      notes: '',
      petId: null,
      ownerId: null,
      consultationId: null,
      source: 'manual',
    });

    expect('invoiceDiscountType' in body).toBe(true);
    expect(body.invoiceDiscountType).toBeNull();
    expect('invoiceDiscountValue' in body).toBe(true);
    expect(body.invoiceDiscountValue).toBeNull();
  });

  it('still carries a set discount as a type/value pair', () => {
    const body = buildDraftPayload({
      lines: [SERVICE_LINE],
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 10,
      dueDate: null,
      notes: '',
      petId: null,
      ownerId: null,
      consultationId: null,
      source: 'manual',
    });

    expect(body.invoiceDiscountType).toBe('percent');
    expect(body.invoiceDiscountValue).toBe(10);
  });
});

// ─── 6. T-06-102: the finalize body has no total-shaped key ─────────────────

describe('the finalize request body (T-06-102)', () => {
  it('contains no key matching /total|cgst|sgst|igst|taxable/i', () => {
    const body = buildFinalizeInput({
      dueDate: '2026-09-01T00:00:00.000Z',
      notes: 'Paid at counter',
      placeOfSupplyStateCode: '29',
    });

    for (const key of Object.keys(body)) {
      expect(key).not.toMatch(/total|cgst|sgst|igst|taxable/i);
    }
    // Positively: these three keys are the whole contract.
    expect(Object.keys(body).sort()).toEqual(['dueDate', 'notes', 'placeOfSupplyStateCode']);
  });

  it('cannot be made to carry a total by a caller passing one', () => {
    const body = buildFinalizeInput({
      dueDate: null,
      notes: null,
      placeOfSupplyStateCode: null,
      // A tampered caller's extra keys — the shared schema strips them.
      grandTotalPaise: 1,
      cgstPaise: 0,
    } as never);

    expect(body).toEqual({});
    expect(JSON.stringify(body)).not.toMatch(/total|cgst/i);
  });
});

// ─── 7. The INSUFFICIENT_STOCK 409 ──────────────────────────────────────────

describe('a 409 INSUFFICIENT_STOCK', () => {
  const shortfalls: StockShortfall[] = [
    { description: 'Amoxicillin 250mg', requested: 6, available: 2 } as StockShortfall,
  ];

  it('yields the shortfall numbers for the banner and blocks finalize', () => {
    const outcome = classifyFinalizeError(insufficientStockError(shortfalls));

    expect(outcome.kind).toBe('insufficient_stock');
    expect(outcome.shortfalls).toHaveLength(1);
    expect(outcome.shortfalls[0].available).toBe(2);
    expect(outcome.shortfalls[0].requested).toBe(6);
    expect(outcome.blocksFinalize).toBe(true);
    // The draft stays editable — nothing about this outcome navigates away.
    expect(outcome.navigateToDetail).toBe(false);
  });

  it('highlights exactly the offending line rows', () => {
    const ids = shortfallLocalIds([SERVICE_LINE, DISPENSED_PRODUCT_LINE], shortfalls);
    expect(ids).toEqual(['line-2']);
  });

  it('drops a malformed shortfall rather than rendering undefined in the sentence', () => {
    const outcome = classifyFinalizeError(
      insufficientStockError([{ description: 'Mystery item' }]),
    );
    expect(outcome.shortfalls).toEqual([]);
  });
});

// ─── 8. Editing unblocks finalize ───────────────────────────────────────────

describe('the finalize block clearing on edit', () => {
  const lines = [SERVICE_LINE, DISPENSED_PRODUCT_LINE];
  const block: FinalizeBlock = {
    signature: linesSignature(lines, null, null),
    shortfalls: [{ description: 'Amoxicillin 250mg', requested: 6, available: 2 } as StockShortfall],
  };

  it('keeps finalize disabled while the lines are untouched', () => {
    expect(isFinalizeBlocked(block, lines, null, null)).toBe(true);
  });

  it('re-enables finalize once the offending quantity changes', () => {
    const adjusted = [SERVICE_LINE, { ...DISPENSED_PRODUCT_LINE, quantity: 2 }];
    expect(isFinalizeBlocked(block, adjusted, null, null)).toBe(false);
  });

  it('re-enables finalize once the offending line is removed', () => {
    expect(isFinalizeBlocked(block, [SERVICE_LINE], null, null)).toBe(false);
  });

  it('is never blocked when no shortfall has been seen', () => {
    expect(isFinalizeBlocked(null, lines, null, null)).toBe(false);
  });
});

// ─── 9. The INVOICE_NOT_DRAFT 409 ───────────────────────────────────────────

describe('a 409 INVOICE_NOT_DRAFT', () => {
  it('explains what happened and navigates to the detail view rather than discarding edits', () => {
    const outcome = classifyFinalizeError(notDraftError());

    expect(outcome.kind).toBe('not_draft');
    expect(outcome.navigateToDetail).toBe(true);
    expect(outcome.message).toBe(BUILDER_SCREEN_COPY.alreadyFinalized);
    // D-21 makes the invoice immutable, so retrying is not offered.
    expect(outcome.blocksFinalize).toBe(true);
    expect(outcome.shortfalls).toEqual([]);
  });

  it('treats any other failure as a retryable save error that keeps the user on the screen', () => {
    const outcome = classifyFinalizeError(new ApiClientError('boom', 'INTERNAL_ERROR', 500));

    expect(outcome.kind).toBe('other');
    expect(outcome.navigateToDetail).toBe(false);
    expect(outcome.blocksFinalize).toBe(false);
    expect(outcome.message).toBe(BUILDER_SCREEN_COPY.saveErrorBanner);
  });
});

// ─── 10. T-06-107: no leakage between patients ──────────────────────────────

describe('leaving the builder and returning for a different patient', () => {
  it('shows no lines from the previous patient', () => {
    const store = useInvoiceBuilderStore.getState();
    store.addLine({ ...SERVICE_LINE, localId: undefined } as never);
    store.setNotes('First patient');
    store.setInvoiceDiscount('percent', 10);
    expect(useInvoiceBuilderStore.getState().lines).toHaveLength(1);

    // What the screen's unmount cleanup does.
    useInvoiceBuilderStore.getState().reset();

    const after = useInvoiceBuilderStore.getState();
    expect(after.lines).toEqual([]);
    expect(after.notes).toBe('');
    expect(after.invoiceDiscountType).toBeNull();
    expect(after.invoiceDiscountValue).toBeNull();
    expect(after.dueDate).toBeNull();
    // And the body built from that empty store carries nothing of the first patient.
    expect(toInvoiceLineItemInputs(after.lines)).toEqual([]);
  });
});

// ─── 11. T-06-139: totals never blank and are never re-derived ──────────────

describe('the totals section during a preview refresh', () => {
  it('keeps the last successful figures dimmed rather than blanking', () => {
    const rendered = totalsToRender(
      { breakdown: BREAKDOWN, amounts: AMOUNTS },
      /* isRefreshing */ true,
    );

    expect(rendered.breakdown).toBe(BREAKDOWN);
    expect(rendered.amounts).toBe(AMOUNTS);
    expect(rendered.dimmed).toBe(true);
  });

  it('renders undimmed once the refresh settles', () => {
    const rendered = totalsToRender({ breakdown: BREAKDOWN, amounts: AMOUNTS }, false);
    expect(rendered.dimmed).toBe(false);
    expect(rendered.breakdown?.grandTotalPaise).toBe(106_200);
  });

  it('renders nothing at all before the first successful preview', () => {
    const rendered = totalsToRender(null, true);
    expect(rendered.breakdown).toBeUndefined();
    expect(rendered.amounts).toBeUndefined();
  });
});

// ─── Catalog and inventory selections become lines ──────────────────────────

describe('turning a catalog or inventory selection into a line', () => {
  it('builds a service line at the catalog price with its own GST rate', () => {
    const line = serviceLineFrom(
      {
        id: '11111111-1111-4111-8111-111111111111',
        clinicId: 'c',
        name: 'General Consultation',
        category: 'consultation',
        price: 50_000,
        sacCode: '9983',
        hsnCode: null,
        gstRateOverride: 18,
        isActive: true,
        isPreset: true,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
      5,
    );

    expect(line.lineType).toBe('service');
    expect(line.unitPricePaise).toBe(50_000);
    expect(line.gstRatePercent).toBe(18);
    expect(line.quantity).toBe(1);
    expect(line.hsnSacCode).toBe('9983');
  });

  it('falls back to the clinic default rate when the catalog entry has no override', () => {
    const line = serviceLineFrom(
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Nail Trim',
        price: 20_000,
        sacCode: null,
        hsnCode: null,
        gstRateOverride: null,
        isActive: true,
        isPreset: false,
        sortOrder: 9,
      } as never,
      5,
    );
    expect(line.gstRatePercent).toBe(5);
  });

  it('converts an inventory selling price in rupees to paise without a float multiply', () => {
    // 0.29 and 1.15 are the classic IEEE-754 traps: 0.29 * 100 is 28.999999999999996.
    expect(inventorySellingPriceToPaise(0.29)).toBe(29);
    expect(inventorySellingPriceToPaise(1.15)).toBe(115);
    expect(inventorySellingPriceToPaise(250)).toBe(25_000);
    expect(inventorySellingPriceToPaise(250.5)).toBe(25_050);
  });

  it('builds a product line with no stock provenance, since nothing was dispensed', () => {
    const line = inventoryLineFrom(
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Amoxicillin 250mg',
        sellingPrice: 45,
        hsnSacCode: '3004',
        gstRate: 5,
        currentStock: 40,
        isActive: true,
      } as never,
      5,
    );

    expect(line.lineType).toBe('product');
    expect(line.inventoryItemId).toBe('22222222-2222-4222-8222-222222222222');
    expect(line.unitPricePaise).toBe(4_500);
    expect(line.gstRatePercent).toBe(5);
    // Adding a product by hand does not decrement stock — finalize does that.
    expect(line.stockMovementId).toBeUndefined();
  });
});

// ─── The copy contract ──────────────────────────────────────────────────────

describe('the screen copy', () => {
  it('matches 06-UI-SPEC verbatim', () => {
    expect(BUILDER_SCREEN_COPY.finalizeButton).toBe('Finalize Invoice');
    expect(BUILDER_SCREEN_COPY.saveDraftButton).toBe('Save Draft');
    expect(BUILDER_SCREEN_COPY.cancelButton).toBe('Cancel');
    expect(BUILDER_SCREEN_COPY.finalizeSuccessToast).toBe('Invoice finalized');
    expect(BUILDER_SCREEN_COPY.draftSavedToast).toBe('Invoice draft saved');
    expect(BUILDER_SCREEN_COPY.saveErrorBanner).toBe('Could not save invoice. Please try again.');
    expect(BUILDER_SCREEN_COPY.productSearchPlaceholder).toBe('Search inventory');
  });
});
