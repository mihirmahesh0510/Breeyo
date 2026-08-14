import { describe, it, expect } from 'vitest';
import type { ServiceCatalog, TaxBreakdown } from '@breeyo/types';
import {
  BUILDER_COPY,
  catalogEntryAvailability,
  gstRowsFor,
  showRoundOffRow,
  sortCatalogEntries,
  type ServiceCatalogEntry,
} from '../lib/builder-copy';
import { parseDiscountInput, parseRupeesToPaise } from '../lib/builder-state';

/**
 * The builder's copy contract and its presentation decisions.
 *
 * Every string below is quoted from `06-UI-SPEC.md`'s "Invoice Builder Screen"
 * copy table or its destructive-actions row. Asserting them here rather than
 * reading them out of JSX is what makes "took the copy from the spec" a
 * falsifiable claim in a repo that cannot render a React Native component under
 * test.
 */

describe('BUILDER_COPY — 06-UI-SPEC Invoice Builder Screen', () => {
  it('carries the screen titles and the patient banner', () => {
    expect(BUILDER_COPY.screenTitleStandalone).toBe('New Invoice');
    expect(BUILDER_COPY.screenTitleForPet('Bruno')).toBe('Invoice for Bruno');
    expect(BUILDER_COPY.patientBanner('Bruno', 'dog', 'Asha Rao')).toBe(
      'Bruno (dog) — Owner: Asha Rao',
    );
  });

  it('carries the service section and catalog copy', () => {
    expect(BUILDER_COPY.sectionServices).toBe('Services');
    expect(BUILDER_COPY.addService).toBe('Add Service');
    expect(BUILDER_COPY.serviceSearchPlaceholder).toBe('Search services');
    expect(BUILDER_COPY.addCustomService).toBe('Add Custom Service');
    expect(BUILDER_COPY.catalogEmpty).toBe('No services match. Add a custom service below.');
    expect(BUILDER_COPY.customServiceNamePlaceholder).toBe('Service name');
    expect(BUILDER_COPY.customServicePricePlaceholder).toBe('Price (₹)');
  });

  it('carries the line-item column labels and the discount copy', () => {
    expect(BUILDER_COPY.qtyLabel).toBe('Qty');
    expect(BUILDER_COPY.rateLabel).toBe('Rate');
    expect(BUILDER_COPY.amountLabel).toBe('Amount');
    expect(BUILDER_COPY.addDiscount).toBe('Add Discount');
    expect(BUILDER_COPY.addInvoiceDiscount).toBe('Add Invoice Discount');
    expect(BUILDER_COPY.discountValuePlaceholder).toBe('Discount');
    expect(BUILDER_COPY.discountTypePercent).toBe('%');
    expect(BUILDER_COPY.discountTypeFlat).toBe('₹');
  });

  it('carries the totals labels', () => {
    expect(BUILDER_COPY.subtotalLabel).toBe('Subtotal');
    expect(BUILDER_COPY.discountLabel).toBe('Discount');
    expect(BUILDER_COPY.grandTotalLabel).toBe('Grand Total');
    expect(BUILDER_COPY.cgstLabel).toBe('CGST');
    expect(BUILDER_COPY.sgstLabel).toBe('SGST');
    expect(BUILDER_COPY.igstLabel).toBe('IGST');
    expect(BUILDER_COPY.roundOffLabel).toBe('Round Off');
  });

  it('carries the due date copy with the clinic default note', () => {
    expect(BUILDER_COPY.dueDateLabel).toBe('Due Date');
    expect(BUILDER_COPY.dueDateDefaultNote(7)).toBe('7 days from today (clinic default)');
    expect(BUILDER_COPY.dueDateDefaultNote(0)).toBe('0 days from today (clinic default)');
  });

  it('carries the inline remove confirmation from the destructive-actions table', () => {
    expect(BUILDER_COPY.removeConfirm('General Consultation')).toBe(
      'Remove General Consultation?',
    );
    expect(BUILDER_COPY.removeConfirmAccept).toBe('Remove');
    expect(BUILDER_COPY.removeConfirmCancel).toBe('Keep');
  });

  it('builds the BIL-02 shortfall sentence from the structured fields', () => {
    expect(
      BUILDER_COPY.stockShortfall({
        inventoryItemId: 'x',
        description: 'Amoxicillin 250mg',
        requested: 10,
        available: 3,
      }),
    ).toBe('Amoxicillin 250mg has insufficient stock (3 available, 10 requested)');
  });

  it('carries the D-45 out-of-stock note', () => {
    expect(BUILDER_COPY.outOfStock).toBe('Out of stock');
  });
});

describe('parseRupeesToPaise (T-06-105)', () => {
  it('converts whole rupees and two decimal places exactly', () => {
    expect(parseRupeesToPaise('500')).toEqual({ ok: true, paise: 50_000 });
    expect(parseRupeesToPaise('500.50')).toEqual({ ok: true, paise: 50_050 });
    expect(parseRupeesToPaise('0.07')).toEqual({ ok: true, paise: 7 });
    expect(parseRupeesToPaise('1234.05')).toEqual({ ok: true, paise: 123_405 });
  });

  it('accepts a single decimal place as tenths of a rupee, not hundredths', () => {
    expect(parseRupeesToPaise('12.5')).toEqual({ ok: true, paise: 1_250 });
  });

  it('rejects more than two decimal places', () => {
    const result = parseRupeesToPaise('10.123');
    expect(result.ok).toBe(false);
  });

  it('rejects an empty, negative or non-numeric entry', () => {
    expect(parseRupeesToPaise('').ok).toBe(false);
    expect(parseRupeesToPaise('   ').ok).toBe(false);
    expect(parseRupeesToPaise('-5').ok).toBe(false);
    expect(parseRupeesToPaise('abc').ok).toBe(false);
    expect(parseRupeesToPaise('1e3').ok).toBe(false);
    expect(parseRupeesToPaise('1.2.3').ok).toBe(false);
  });

  it('never loses a paisa to floating point', () => {
    // 0.29 * 100 is 28.999999999999996 in IEEE 754.
    expect(parseRupeesToPaise('0.29')).toEqual({ ok: true, paise: 29 });
    expect(parseRupeesToPaise('1.15')).toEqual({ ok: true, paise: 115 });
  });
});

describe('parseDiscountInput (T-06-104, D-40)', () => {
  it('accepts a whole percentage from 0 to 100', () => {
    expect(parseDiscountInput('percent', '10')).toEqual({ ok: true, type: 'percent', value: 10 });
    expect(parseDiscountInput('percent', '0')).toEqual({ ok: true, type: 'percent', value: 0 });
  });

  it('accepts 100% — D-40 sets no approval threshold', () => {
    expect(parseDiscountInput('percent', '100')).toEqual({
      ok: true,
      type: 'percent',
      value: 100,
    });
  });

  it('rejects a percentage above 100 with the shared schema’s wording', () => {
    const result = parseDiscountInput('percent', '101');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('A percentage discount cannot exceed 100');
  });

  it('rejects a fractional percentage, which the shared schema cannot carry', () => {
    expect(parseDiscountInput('percent', '10.5').ok).toBe(false);
  });

  it('converts a flat discount from rupees to paise', () => {
    expect(parseDiscountInput('flat', '250')).toEqual({ ok: true, type: 'flat', value: 25_000 });
    expect(parseDiscountInput('flat', '250.75')).toEqual({
      ok: true,
      type: 'flat',
      value: 25_075,
    });
  });

  it('rejects a flat discount with more than two decimal places', () => {
    expect(parseDiscountInput('flat', '10.005').ok).toBe(false);
  });
});

describe('gstRowsFor (D-08/D-17, BIL-07)', () => {
  const breakdown = (over: Partial<TaxBreakdown>): TaxBreakdown => ({
    taxableValuePaise: 100_000,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    roundOffPaise: 0,
    grandTotalPaise: 100_000,
    documentType: 'invoice',
    ...over,
  });

  it('renders no GST row at all for a clinic that is not registered', () => {
    const rows = gstRowsFor(breakdown({ cgstPaise: 900, sgstPaise: 900 }), false);
    expect(rows).toEqual([]);
  });

  it('renders no GST row when every head is zero', () => {
    expect(gstRowsFor(breakdown({}), true)).toEqual([]);
  });

  it('renders CGST and SGST for an intra-state taxable invoice', () => {
    const rows = gstRowsFor(breakdown({ cgstPaise: 900, sgstPaise: 900 }), true);
    expect(rows.map((row) => row.key)).toEqual(['cgst', 'sgst']);
    expect(rows.map((row) => row.paise)).toEqual([900, 900]);
  });

  it('renders a single IGST row for an inter-state invoice and never both', () => {
    const rows = gstRowsFor(breakdown({ igstPaise: 1_800 }), true);
    expect(rows.map((row) => row.key)).toEqual(['igst']);
  });

  it('prefers IGST when a malformed breakdown carries both', () => {
    const rows = gstRowsFor(breakdown({ cgstPaise: 900, sgstPaise: 900, igstPaise: 1_800 }), true);
    expect(rows.map((row) => row.key)).toEqual(['igst']);
  });

  it('omits a head whose value is zero', () => {
    const rows = gstRowsFor(breakdown({ cgstPaise: 900, sgstPaise: 0 }), true);
    expect(rows.map((row) => row.key)).toEqual(['cgst']);
  });

  it('renders nothing for an absent breakdown', () => {
    expect(gstRowsFor(undefined, true)).toEqual([]);
  });
});

describe('showRoundOffRow', () => {
  it('is hidden at zero and shown for either sign', () => {
    expect(showRoundOffRow(0)).toBe(false);
    expect(showRoundOffRow(37)).toBe(true);
    expect(showRoundOffRow(-42)).toBe(true);
  });

  it('is hidden for an absent value', () => {
    expect(showRoundOffRow(undefined)).toBe(false);
  });
});

describe('sortCatalogEntries (D-02)', () => {
  const entry = (over: Partial<ServiceCatalog>): ServiceCatalog =>
    ({
      id: over.name ?? 'id',
      clinicId: 'clinic',
      name: 'Service',
      category: 'other',
      price: 0,
      sacCode: null,
      hsnCode: null,
      gstRateOverride: null,
      isActive: true,
      isPreset: false,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as ServiceCatalog;

  it('lists presets first, then clinic-created services', () => {
    const sorted = sortCatalogEntries([
      entry({ name: 'Nail Trim', isPreset: false, sortOrder: 0 }),
      entry({ name: 'Surgery', isPreset: true, sortOrder: 1 }),
      entry({ name: 'General Consultation', isPreset: true, sortOrder: 0 }),
    ]);

    expect(sorted.map((service) => service.name)).toEqual([
      'General Consultation',
      'Surgery',
      'Nail Trim',
    ]);
  });

  it('breaks a sortOrder tie by name so the list is stable between renders', () => {
    const sorted = sortCatalogEntries([
      entry({ name: 'X-Ray', isPreset: true, sortOrder: 3 }),
      entry({ name: 'Lab Test', isPreset: true, sortOrder: 3 }),
    ]);

    expect(sorted.map((service) => service.name)).toEqual(['Lab Test', 'X-Ray']);
  });

  it('does not mutate the array it was given', () => {
    const input = [
      entry({ name: 'Nail Trim', isPreset: false }),
      entry({ name: 'Surgery', isPreset: true }),
    ];
    sortCatalogEntries(input);

    expect(input.map((service) => service.name)).toEqual(['Nail Trim', 'Surgery']);
  });
});

describe('catalogEntryAvailability (D-45)', () => {
  const entry = (over: Partial<ServiceCatalogEntry>): ServiceCatalogEntry =>
    ({
      id: 'id',
      clinicId: 'clinic',
      name: 'Amoxicillin 250mg',
      category: 'other',
      price: 12_500,
      sacCode: null,
      hsnCode: null,
      gstRateOverride: null,
      isActive: true,
      isPreset: false,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as ServiceCatalogEntry;

  it('is selectable with no note in the ordinary case', () => {
    expect(catalogEntryAvailability(entry({}))).toEqual({ selectable: true, note: null });
  });

  it('shows an out-of-stock entry disabled rather than hiding it', () => {
    expect(catalogEntryAvailability(entry({ outOfStock: true }))).toEqual({
      selectable: false,
      note: 'Out of stock',
    });
  });

  it('disables a deactivated catalog entry', () => {
    const availability = catalogEntryAvailability(entry({ isActive: false }));
    expect(availability.selectable).toBe(false);
    expect(availability.note).toBe('Unavailable');
  });
});
