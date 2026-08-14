import { describe, it, expect } from 'vitest';
import type {
  ClinicInvoiceHeader,
  InvoiceDetail,
  InvoiceLineItem,
} from '@breeyo/types';
import { B2C_ADDRESS_REQUIRED_ABOVE_PAISE } from '@breeyo/types';
import { buildInvoiceHtml } from '../templates/invoice';

/**
 * BIL-04 / CGST Rule 46 field-coverage suite.
 *
 * Every assertion here is a substring check against the returned HTML. The
 * template is a pure function of its arguments — nothing is fetched inside it —
 * so the whole Rule 46 matrix is falsifiable without a renderer, which matters
 * because `apps/mobile` cannot render a React Native component under test
 * (06-14-SUMMARY.md, deviation 1).
 *
 * Three properties this file exists to protect:
 *
 *  1. **Rule 46A heading.** Four branches, one test each. Printing the wrong
 *     heading is a compliance failure, not a cosmetic one.
 *  2. **Section 122.** An unregistered clinic printing `GSTIN` or a `CGST` row
 *     is an offence. The negative assertions below are the gate.
 *  3. **The money adds up.** The printed subtotal, tax rows and grand total are
 *     asserted to reconcile arithmetically, because the one thing an owner does
 *     with a printed invoice is add the column up by hand.
 */

// ─── Fixtures ───────────────────────────────────────────────────────────────

const UNREGISTERED_CLINIC: ClinicInvoiceHeader = {
  name: 'Paws & Claws Veterinary Clinic',
  address: '12 MG Road, Bengaluru 560001',
  contactPhone: '+91 98765 43210',
  gstin: null,
  logoUrl: null,
  stateCode: null,
  gstEnabled: false,
  bankDetails: null,
  invoiceFooterText: null,
};

const REGISTERED_CLINIC: ClinicInvoiceHeader = {
  ...UNREGISTERED_CLINIC,
  gstin: '29AAPFU0939F1ZV',
  stateCode: '29',
  gstEnabled: true,
  bankDetails: 'HDFC Bank • A/C 50200012345678 • IFSC HDFC0001234',
  invoiceFooterText: 'Thank you for trusting us with your pet.',
};

let lineSeq = 0;

function makeLine(overrides: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  lineSeq += 1;
  return {
    id: `line-${lineSeq}`,
    clinicId: 'clinic-1',
    invoiceId: 'inv-1',
    lineType: 'service',
    sortOrder: lineSeq,
    serviceCatalogId: null,
    inventoryItemId: null,
    stockMovementId: null,
    description: 'General Consultation',
    hsnSacCode: '998351',
    quantity: 1,
    unitPricePaise: 50000,
    discountType: null,
    discountValue: null,
    lineDiscountPaise: 0,
    allocatedInvoiceDiscountPaise: 0,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
    taxableValuePaise: 50000,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    lineTotalPaise: 50000,
    createdAt: new Date('2026-08-13T09:30:00.000Z'),
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const base: InvoiceDetail = {
    id: 'inv-1',
    clinicId: 'clinic-1',
    invoiceNumber: 'INV-202608-0001',
    status: 'UNPAID',
    source: 'consultation',

    consultationId: 'cons-1',
    petId: 'pet-1',
    ownerId: 'owner-1',
    createdById: 'user-1',

    documentType: 'invoice',
    placeOfSupplyStateCode: null,
    isInterState: false,
    gstEnabledSnapshot: false,
    clinicGstinSnapshot: null,

    subtotalPaise: 50000,
    lineDiscountPaise: 0,
    invoiceDiscountType: null,
    invoiceDiscountValue: null,
    invoiceDiscountPaise: 0,
    taxableValuePaise: 50000,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    roundOffPaise: 0,
    grandTotalPaise: 50000,
    amountPaidPaise: 0,
    creditedPaise: 0,
    balancePaise: 50000,

    dueDate: new Date('2026-08-20T00:00:00.000Z'),
    notes: null,

    finalizedAt: new Date('2026-08-13T10:00:00.000Z'),
    voidedAt: null,
    voidReason: null,
    voidRestoredStock: false,

    exceptionFlag: null,
    exceptionDetectedAt: null,
    exceptionResolvedAt: null,
    exceptionResolvedById: null,
    exceptionNotes: null,

    createdAt: new Date('2026-08-13T09:30:00.000Z'),
    updatedAt: new Date('2026-08-13T10:00:00.000Z'),

    lineItems: [makeLine()],
    payments: [],
    refunds: [],
    creditNotes: [],
    pet: { id: 'pet-1', name: 'Bruno', species: 'DOG' },
    owner: { id: 'owner-1', name: 'Asha Menon', mobile: '+91 91234 56789' },
    clinic: UNREGISTERED_CLINIC,
  };

  return { ...base, ...overrides };
}

/** A registered, intra-state invoice: one exempt service + one taxable product. */
function makeMixedRegisteredInvoice(): InvoiceDetail {
  const service = makeLine({
    description: 'General Consultation',
    hsnSacCode: '998351',
    taxTreatment: 'exempt',
    gstRatePercent: 0,
    unitPricePaise: 50000,
    taxableValuePaise: 50000,
    lineTotalPaise: 50000,
  });

  // ₹200.00 taxable at 18% → ₹36.00 tax, split ₹18.00 CGST + ₹18.00 SGST.
  const product = makeLine({
    lineType: 'product',
    description: 'Amoxicillin 250mg (10 tabs)',
    hsnSacCode: '3004',
    taxTreatment: 'taxable',
    gstRatePercent: 18,
    quantity: 1,
    unitPricePaise: 20000,
    taxableValuePaise: 20000,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    lineTotalPaise: 23600,
  });

  return makeInvoice({
    documentType: 'invoice_cum_bill_of_supply',
    gstEnabledSnapshot: true,
    clinicGstinSnapshot: '29AAPFU0939F1ZV',
    placeOfSupplyStateCode: '29',
    clinic: REGISTERED_CLINIC,
    lineItems: [service, product],
    subtotalPaise: 70000,
    taxableValuePaise: 70000,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    roundOffPaise: 0,
    grandTotalPaise: 73600,
    balancePaise: 73600,
  });
}

// ─── Rule 46A document heading ──────────────────────────────────────────────

describe('buildInvoiceHtml — Rule 46A document heading', () => {
  it('renders INVOICE for an unregistered clinic and no tax artefact of any kind', () => {
    const invoice = makeInvoice();
    const html = buildInvoiceHtml(UNREGISTERED_CLINIC, invoice);

    expect(html).toContain('INVOICE');
    expect(html).not.toContain('TAX INVOICE');
    expect(html).not.toContain('BILL OF SUPPLY');

    // Section 122: an unregistered clinic must not assert any tax on a document.
    expect(html).not.toContain('GSTIN');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).not.toContain('IGST');
    expect(html).not.toContain('HSN');

    expect(html).toContain('₹500.00');
  });

  it('renders BILL OF SUPPLY and the GSTIN for a registered clinic with only exempt lines', () => {
    const invoice = makeInvoice({
      documentType: 'bill_of_supply',
      gstEnabledSnapshot: true,
      clinicGstinSnapshot: '29AAPFU0939F1ZV',
      placeOfSupplyStateCode: '29',
      clinic: REGISTERED_CLINIC,
    });
    const html = buildInvoiceHtml(REGISTERED_CLINIC, invoice);

    expect(html).toContain('BILL OF SUPPLY');
    expect(html).not.toContain('INVOICE-CUM-BILL OF SUPPLY');
    expect(html).toContain('GSTIN');
    expect(html).toContain('29AAPFU0939F1ZV');

    // Registered but all-exempt: nothing was charged, so no ₹0.00 tax rows.
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
  });

  it('renders TAX INVOICE with per-line HSN and both intra-state tax heads', () => {
    const product = makeLine({
      lineType: 'product',
      description: 'Amoxicillin 250mg (10 tabs)',
      hsnSacCode: '3004',
      taxTreatment: 'taxable',
      gstRatePercent: 18,
      unitPricePaise: 20000,
      taxableValuePaise: 20000,
      cgstPaise: 1800,
      sgstPaise: 1800,
      lineTotalPaise: 23600,
    });

    const invoice = makeInvoice({
      documentType: 'tax_invoice',
      gstEnabledSnapshot: true,
      clinicGstinSnapshot: '29AAPFU0939F1ZV',
      placeOfSupplyStateCode: '29',
      clinic: REGISTERED_CLINIC,
      lineItems: [product],
      subtotalPaise: 20000,
      taxableValuePaise: 20000,
      cgstPaise: 1800,
      sgstPaise: 1800,
      grandTotalPaise: 23600,
      balancePaise: 23600,
    });

    const html = buildInvoiceHtml(REGISTERED_CLINIC, invoice);

    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('HSN/SAC');
    expect(html).toContain('3004');
    expect(html).toContain('CGST');
    expect(html).toContain('SGST');
    expect(html).not.toContain('IGST');
    expect(html).toContain('₹18.00');
  });

  it('renders INVOICE-CUM-BILL OF SUPPLY for a mixed exempt/taxable invoice', () => {
    const invoice = makeMixedRegisteredInvoice();
    const html = buildInvoiceHtml(REGISTERED_CLINIC, invoice);

    expect(html).toContain('INVOICE-CUM-BILL OF SUPPLY');
  });

  it('renders a single IGST row and no CGST/SGST rows for an inter-state supply', () => {
    const product = makeLine({
      lineType: 'product',
      description: 'Amoxicillin 250mg (10 tabs)',
      hsnSacCode: '3004',
      taxTreatment: 'taxable',
      gstRatePercent: 18,
      unitPricePaise: 20000,
      taxableValuePaise: 20000,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 3600,
      lineTotalPaise: 23600,
    });

    const invoice = makeInvoice({
      documentType: 'tax_invoice',
      gstEnabledSnapshot: true,
      isInterState: true,
      clinicGstinSnapshot: '29AAPFU0939F1ZV',
      placeOfSupplyStateCode: '27',
      clinic: REGISTERED_CLINIC,
      lineItems: [product],
      subtotalPaise: 20000,
      taxableValuePaise: 20000,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 3600,
      grandTotalPaise: 23600,
      balancePaise: 23600,
    });

    const html = buildInvoiceHtml(REGISTERED_CLINIC, invoice);

    expect(html).toContain('IGST');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).toContain('₹36.00');
    // Rule 46: place of supply is mandatory on a registered document.
    expect(html).toContain('Place of Supply');
    expect(html).toContain('27');
  });

  it('never recomputes the document type from the line mix — the frozen value wins', () => {
    // Deliberately inconsistent: mixed lines, but the server froze `tax_invoice`.
    // The PDF is a rendering of the record, not a second opinion about it (T-06-101).
    const invoice = { ...makeMixedRegisteredInvoice(), documentType: 'tax_invoice' as const };
    const html = buildInvoiceHtml(REGISTERED_CLINIC, invoice);

    expect(html).toContain('TAX INVOICE');
    expect(html).not.toContain('INVOICE-CUM-BILL OF SUPPLY');
  });
});

// ─── Rule 46 mandatory fields ───────────────────────────────────────────────

describe('buildInvoiceHtml — Rule 46 mandatory field coverage', () => {
  it('renders every Rule 46 field present in the data', () => {
    const invoice = makeMixedRegisteredInvoice();
    const html = buildInvoiceHtml(REGISTERED_CLINIC, invoice);

    // Document identity
    expect(html).toContain('INV-202608-0001');
    // en-IN long-form issue date, rendered deterministically (no toLocaleDateString)
    expect(html).toContain('13 August 2026');
    // Due date
    expect(html).toContain('20 August 2026');

    // Supplier
    expect(html).toContain('Paws &amp; Claws Veterinary Clinic');
    expect(html).toContain('12 MG Road, Bengaluru 560001');
    expect(html).toContain('+91 98765 43210');
    expect(html).toContain('29AAPFU0939F1ZV');

    // Recipient
    expect(html).toContain('Asha Menon');
    expect(html).toContain('+91 91234 56789');

    // Patient
    expect(html).toContain('Bruno');
    expect(html).toContain('DOG');

    // Line items: description, HSN/SAC, quantity, rate, amount
    expect(html).toContain('General Consultation');
    expect(html).toContain('Amoxicillin 250mg (10 tabs)');
    expect(html).toContain('998351');
    expect(html).toContain('3004');
    expect(html).toContain('₹200.00'); // product rate
    expect(html).toContain('₹236.00'); // product line total

    // Totals block
    expect(html).toContain('Subtotal');
    expect(html).toContain('Taxable Value');
    expect(html).toContain('CGST');
    expect(html).toContain('SGST');
    expect(html).toContain('Grand Total');
    expect(html).toContain('₹736.00');

    // Rule 46(q): signature block
    expect(html).toContain('Authorised Signatory');
  });

  it('renders a discount row only when a discount exists', () => {
    const withoutDiscount = buildInvoiceHtml(
      REGISTERED_CLINIC,
      makeMixedRegisteredInvoice(),
    );
    expect(withoutDiscount).not.toContain('Discount');

    const discounted = makeInvoice({
      subtotalPaise: 50000,
      lineDiscountPaise: 5000,
      invoiceDiscountPaise: 0,
      taxableValuePaise: 45000,
      grandTotalPaise: 45000,
      balancePaise: 45000,
    });
    const html = buildInvoiceHtml(UNREGISTERED_CLINIC, discounted);

    expect(html).toContain('Discount');
    expect(html).toContain('₹50.00');
  });

  it('renders the printed figures so they reconcile: taxable + tax heads = grand total', () => {
    const invoice = makeMixedRegisteredInvoice();
    const html = buildInvoiceHtml(REGISTERED_CLINIC, invoice);

    // The arithmetic the owner performs by hand, asserted on the source data
    // the template renders — the corrected 06-05 invariant, in which
    // `roundOffPaise` is NOT a component of the total.
    expect(
      invoice.taxableValuePaise +
        invoice.cgstPaise +
        invoice.sgstPaise +
        invoice.igstPaise,
    ).toBe(invoice.grandTotalPaise);

    expect(html).toContain('₹700.00'); // taxable value
    expect(html).toContain('₹18.00'); // each of CGST and SGST
    expect(html).toContain('₹736.00'); // grand total
  });

  it('omits the round-off line when it is zero and renders it with its sign when it is not', () => {
    const zero = buildInvoiceHtml(REGISTERED_CLINIC, makeMixedRegisteredInvoice());
    expect(zero).not.toContain('Round Off');

    const rounded = { ...makeMixedRegisteredInvoice(), roundOffPaise: -43 };
    const html = buildInvoiceHtml(REGISTERED_CLINIC, rounded);

    expect(html).toContain('Round Off');
    expect(html).toContain('-₹0.43');
    // Disclosure only: the grand total must not have absorbed it twice.
    expect(html).toContain('₹736.00');
  });

  it('renders the app-consistent uppercase payment status labels, including D-46', () => {
    const paid = buildInvoiceHtml(
      REGISTERED_CLINIC,
      makeInvoice({ status: 'PAID', clinic: REGISTERED_CLINIC }),
    );
    expect(paid).toContain('PAID');

    const partial = buildInvoiceHtml(
      REGISTERED_CLINIC,
      makeInvoice({ status: 'PARTIALLY_PAID', clinic: REGISTERED_CLINIC }),
    );
    expect(partial).toContain('PARTIALLY PAID');

    const unpaid = buildInvoiceHtml(REGISTERED_CLINIC, makeInvoice({ status: 'UNPAID' }));
    expect(unpaid).toContain('UNPAID');

    const overdue = buildInvoiceHtml(REGISTERED_CLINIC, makeInvoice({ status: 'OVERDUE' }));
    expect(overdue).toContain('OVERDUE');

    const voided = buildInvoiceHtml(REGISTERED_CLINIC, makeInvoice({ status: 'VOIDED' }));
    expect(voided).toContain('VOIDED');

    // D-46: FINALIZED is labelled AWAITING PAYMENT, matching the mobile UI.
    const finalized = buildInvoiceHtml(
      REGISTERED_CLINIC,
      makeInvoice({ status: 'FINALIZED' }),
    );
    expect(finalized).toContain('AWAITING PAYMENT');
  });
});

// ─── Injection safety (T-06-96) ─────────────────────────────────────────────

describe('buildInvoiceHtml — HTML escaping', () => {
  it('escapes a clinic name containing markup', () => {
    const hostile: ClinicInvoiceHeader = {
      ...UNREGISTERED_CLINIC,
      name: '<script>alert(1)</script>',
    };
    const html = buildInvoiceHtml(hostile, makeInvoice({ clinic: hostile }));

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes an ampersand in an owner name', () => {
    const invoice = makeInvoice({
      owner: { id: 'owner-1', name: 'Asha & Sons', mobile: '+91 91234 56789' },
    });
    const html = buildInvoiceHtml(UNREGISTERED_CLINIC, invoice);

    expect(html).toContain('Asha &amp; Sons');
    expect(html).not.toContain('Asha & Sons');
  });

  it('escapes free text in a pet name, a line description and the notes', () => {
    const invoice = makeInvoice({
      pet: { id: 'pet-1', name: '<b>Bruno</b>', species: 'DOG' },
      lineItems: [makeLine({ description: '<img onerror=x>' })],
      notes: '</table><script>x</script>',
    });
    const html = buildInvoiceHtml(UNREGISTERED_CLINIC, invoice);

    expect(html).toContain('&lt;b&gt;Bruno&lt;/b&gt;');
    expect(html).toContain('&lt;img onerror=x&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img onerror');
  });
});

// ─── Logo, address threshold and optional blocks ────────────────────────────

describe('buildInvoiceHtml — logo, B2C address and optional blocks', () => {
  it('inlines a base64 logo and never interpolates a remote logoUrl', () => {
    const clinicWithRemoteLogo: ClinicInvoiceHeader = {
      ...UNREGISTERED_CLINIC,
      logoUrl: 'https://cdn.example.com/logo.png',
    };
    const invoice = makeInvoice({ clinic: clinicWithRemoteLogo });

    const withLogo = buildInvoiceHtml(clinicWithRemoteLogo, invoice, {
      logoBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(withLogo).toContain('<img src="data:');

    const withoutLogo = buildInvoiceHtml(clinicWithRemoteLogo, invoice);
    expect(withoutLogo).not.toContain('<img');
    expect(withoutLogo).not.toContain('https://cdn.example.com/logo.png');
  });

  it('renders the recipient address when supplied above the B2C threshold', () => {
    const invoice = makeInvoice({
      subtotalPaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
      taxableValuePaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
      grandTotalPaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
      balancePaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
    });

    const html = buildInvoiceHtml(UNREGISTERED_CLINIC, invoice, {
      ownerAddress: '44 Church Street, Bengaluru 560001',
    });
    expect(html).toContain('44 Church Street, Bengaluru 560001');
  });

  it('flags a missing recipient address above the B2C threshold rather than omitting it silently', () => {
    const invoice = makeInvoice({
      subtotalPaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
      taxableValuePaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
      grandTotalPaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
      balancePaise: B2C_ADDRESS_REQUIRED_ABOVE_PAISE + 100000,
    });

    const above = buildInvoiceHtml(UNREGISTERED_CLINIC, invoice);
    expect(above).toContain('Recipient address required');

    const below = buildInvoiceHtml(UNREGISTERED_CLINIC, makeInvoice());
    expect(below).not.toContain('Recipient address required');
  });

  it('renders the footer text and bank details when present and leaves no empty heading when absent', () => {
    const withBlocks = buildInvoiceHtml(
      REGISTERED_CLINIC,
      makeMixedRegisteredInvoice(),
    );
    expect(withBlocks).toContain('Bank Details');
    expect(withBlocks).toContain('HDFC0001234');
    expect(withBlocks).toContain('Thank you for trusting us with your pet.');

    const withoutBlocks = buildInvoiceHtml(UNREGISTERED_CLINIC, makeInvoice());
    expect(withoutBlocks).not.toContain('Bank Details');
    expect(withoutBlocks).not.toContain('Notes');
  });

  it('caps the line-item table font at 12px for the A4 single-page target', () => {
    const html = buildInvoiceHtml(REGISTERED_CLINIC, makeMixedRegisteredInvoice());
    expect(html).toContain('font-size: 12px');
    expect(html).toContain('@page');
  });
});
