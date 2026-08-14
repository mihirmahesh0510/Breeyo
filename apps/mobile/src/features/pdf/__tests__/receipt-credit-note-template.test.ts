import { describe, it, expect } from 'vitest';
import type {
  ClinicInvoiceHeader,
  CreditNote,
  CreditNoteLineItem,
  InvoiceDetail,
  InvoiceLineItem,
  PaymentReceipt,
} from '@breeyo/types';
import { buildPaymentReceiptHtml } from '../templates/payment-receipt';
import { buildCreditNoteHtml, type CreditNoteDocument } from '../templates/credit-note';

/**
 * D-13 payment receipt and D-19/D-22 credit note template coverage.
 *
 * Both documents inherit the invoice template's three non-negotiables — escape
 * everything, format every money value from paise through one formatter, and
 * gate the tax presentation on the invoice's frozen `gstEnabledSnapshot` — so
 * this file re-asserts each of them rather than trusting the sibling's suite.
 */

// ─── Fixtures ───────────────────────────────────────────────────────────────

const REGISTERED_CLINIC: ClinicInvoiceHeader = {
  name: 'Paws & Claws Veterinary Clinic',
  address: '12 MG Road, Bengaluru 560001',
  contactPhone: '+91 98765 43210',
  gstin: '29AAPFU0939F1ZV',
  logoUrl: 'https://cdn.example.com/logo.png',
  stateCode: '29',
  gstEnabled: true,
  bankDetails: null,
  invoiceFooterText: null,
};

const UNREGISTERED_CLINIC: ClinicInvoiceHeader = {
  ...REGISTERED_CLINIC,
  gstin: null,
  stateCode: null,
  gstEnabled: false,
};

function makeInvoiceLine(overrides: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: 'line-1',
    clinicId: 'clinic-1',
    invoiceId: 'inv-1',
    lineType: 'product',
    sortOrder: 1,
    serviceCatalogId: null,
    inventoryItemId: 'item-1',
    stockMovementId: null,
    description: 'Amoxicillin 250mg (10 tabs)',
    hsnSacCode: '3004',
    quantity: 1,
    unitPricePaise: 20000,
    discountType: null,
    discountValue: null,
    lineDiscountPaise: 0,
    allocatedInvoiceDiscountPaise: 0,
    taxTreatment: 'taxable',
    gstRatePercent: 18,
    taxableValuePaise: 20000,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    lineTotalPaise: 23600,
    createdAt: new Date('2026-08-13T09:30:00.000Z'),
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const base: InvoiceDetail = {
    id: 'inv-1',
    clinicId: 'clinic-1',
    invoiceNumber: 'INV-202608-0001',
    status: 'PAID',
    source: 'consultation',

    consultationId: 'cons-1',
    petId: 'pet-1',
    ownerId: 'owner-1',
    createdById: 'user-1',

    documentType: 'tax_invoice',
    placeOfSupplyStateCode: '29',
    isInterState: false,
    gstEnabledSnapshot: true,
    clinicGstinSnapshot: '29AAPFU0939F1ZV',

    subtotalPaise: 20000,
    lineDiscountPaise: 0,
    invoiceDiscountType: null,
    invoiceDiscountValue: null,
    invoiceDiscountPaise: 0,
    taxableValuePaise: 20000,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    roundOffPaise: 0,
    grandTotalPaise: 23600,
    amountPaidPaise: 23600,
    creditedPaise: 0,
    balancePaise: 0,

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

    lineItems: [makeInvoiceLine()],
    payments: [],
    refunds: [],
    creditNotes: [],
    pet: { id: 'pet-1', name: 'Bruno', species: 'DOG' },
    owner: { id: 'owner-1', name: 'Asha Menon', mobile: '+91 91234 56789' },
    clinic: REGISTERED_CLINIC,
  };

  return { ...base, ...overrides };
}

function makeReceipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    id: 'rct-1',
    clinicId: 'clinic-1',
    paymentId: 'pay-1',
    invoiceId: 'inv-1',
    receiptNumber: 'RCT-202608-0007',
    amountPaise: 23600,
    method: 'upi',
    transactionRef: 'pay_MkT9xQ2bLp01',
    issuedAt: new Date('2026-08-13T10:15:00.000Z'),
    createdAt: new Date('2026-08-13T10:15:00.000Z'),
    ...overrides,
  };
}

function makeCreditNoteLine(
  overrides: Partial<CreditNoteLineItem> = {},
): CreditNoteLineItem {
  return {
    id: 'cnl-1',
    clinicId: 'clinic-1',
    creditNoteId: 'cn-1',
    invoiceLineItemId: 'line-1',
    description: 'Amoxicillin 250mg (10 tabs)',
    hsnSacCode: '3004',
    quantity: 1,
    taxTreatment: 'taxable',
    gstRatePercent: 18,
    taxableValuePaise: 20000,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    totalPaise: 23600,
    createdAt: new Date('2026-08-14T06:00:00.000Z'),
    ...overrides,
  };
}

function makeCreditNote(
  overrides: Partial<CreditNote> = {},
  lineOverrides: Partial<CreditNoteLineItem> = {},
): CreditNoteDocument {
  const base: CreditNote = {
    id: 'cn-1',
    clinicId: 'clinic-1',
    invoiceId: 'inv-1',
    creditNoteNumber: 'CN-202608-0001',
    reason: 'product_returned',
    notes: null,
    subtotalPaise: 20000,
    taxableValuePaise: 20000,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    roundOffPaise: 0,
    totalPaise: 23600,
    issuedById: 'user-1',
    issuedAt: new Date('2026-08-14T06:00:00.000Z'),
    createdAt: new Date('2026-08-14T06:00:00.000Z'),
    ...overrides,
  };

  return { ...base, lineItems: [makeCreditNoteLine(lineOverrides)] };
}

// ─── Payment receipt (D-13) ─────────────────────────────────────────────────

describe('buildPaymentReceiptHtml', () => {
  it('renders the clinic header, receipt number, date/time, invoice reference, amount, method and thank-you footer', () => {
    const html = buildPaymentReceiptHtml(REGISTERED_CLINIC, makeReceipt(), makeInvoice());

    expect(html).toContain('Paws &amp; Claws Veterinary Clinic');
    expect(html).toContain('12 MG Road, Bengaluru 560001');
    expect(html).toContain('+91 98765 43210');

    expect(html).toContain('PAYMENT RECEIPT');
    expect(html).toContain('RCT-202608-0007');
    expect(html).toContain('13 August 2026');
    expect(html).toContain('15:45'); // 10:15 UTC rendered in IST
    expect(html).toContain('INV-202608-0001');
    expect(html).toContain('₹236.00');
    expect(html).toContain('UPI');
    expect(html).toContain('pay_MkT9xQ2bLp01');
    expect(html).toContain('Thank you');
  });

  it('omits the transaction-reference row entirely for a cash payment', () => {
    const html = buildPaymentReceiptHtml(
      REGISTERED_CLINIC,
      makeReceipt({ method: 'cash', transactionRef: null }),
      makeInvoice(),
    );

    expect(html).toContain('CASH');
    expect(html).not.toContain('Transaction Ref');
    expect(html).not.toContain('pay_MkT9xQ2bLp01');
  });

  it('declares an 80mm thermal page width', () => {
    const html = buildPaymentReceiptHtml(REGISTERED_CLINIC, makeReceipt(), makeInvoice());

    expect(html).toContain('80mm');
    expect(html).toContain('@page');
  });

  it('escapes interpolated text and takes the logo only as a base64 data URI', () => {
    const hostile: ClinicInvoiceHeader = {
      ...REGISTERED_CLINIC,
      name: '<script>alert(1)</script>',
    };
    const html = buildPaymentReceiptHtml(hostile, makeReceipt(), makeInvoice());

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('https://cdn.example.com/logo.png');

    const withLogo = buildPaymentReceiptHtml(
      REGISTERED_CLINIC,
      makeReceipt(),
      makeInvoice(),
      { logoBase64: 'data:image/png;base64,iVBORw0KGgo=' },
    );
    expect(withLogo).toContain('<img src="data:');
  });
});

// ─── Credit note (D-19, D-22) ───────────────────────────────────────────────

describe('buildCreditNoteHtml', () => {
  it('renders the CREDIT NOTE heading, number, date, original invoice reference, credited lines, totals, reason and notes', () => {
    const creditNote = makeCreditNote({ notes: 'Owner returned two unopened strips.' });
    const html = buildCreditNoteHtml(REGISTERED_CLINIC, creditNote, makeInvoice());

    expect(html).toContain('CREDIT NOTE');
    expect(html).toContain('CN-202608-0001');
    expect(html).toContain('14 August 2026');
    expect(html).toContain('For Invoice #INV-202608-0001');

    // Credited line: description, HSN/SAC, quantity, amount
    expect(html).toContain('Amoxicillin 250mg (10 tabs)');
    expect(html).toContain('3004');
    expect(html).toContain('₹200.00');

    // Tax heads and total
    expect(html).toContain('CGST');
    expect(html).toContain('SGST');
    expect(html).toContain('₹18.00');
    expect(html).toContain('Credit Total');
    expect(html).toContain('₹236.00');

    // Human-readable reason label, never the stored literal
    expect(html).toContain('Product returned');
    expect(html).not.toContain('product_returned');

    expect(html).toContain('Owner returned two unopened strips.');
  });

  it('renders a positive amount under the CREDIT NOTE heading and states the balance effect in words', () => {
    const html = buildCreditNoteHtml(REGISTERED_CLINIC, makeCreditNote(), makeInvoice());

    expect(html).toContain('₹236.00');
    expect(html).not.toContain('-₹236.00');
    expect(html).toContain('reduces the outstanding balance');
  });

  it('gates the tax rows on the original invoice snapshot, not on the credit note alone', () => {
    const unregisteredInvoice = makeInvoice({
      documentType: 'invoice',
      gstEnabledSnapshot: false,
      clinicGstinSnapshot: null,
      placeOfSupplyStateCode: null,
      clinic: UNREGISTERED_CLINIC,
    });

    const html = buildCreditNoteHtml(
      UNREGISTERED_CLINIC,
      makeCreditNote(
        { cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 20000 },
        {
          taxTreatment: 'exempt',
          gstRatePercent: 0,
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
          totalPaise: 20000,
        },
      ),
      unregisteredInvoice,
    );

    expect(html).not.toContain('GSTIN');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).not.toContain('IGST');
    expect(html).not.toContain('HSN');
  });

  it('renders a single IGST row for an inter-state original invoice', () => {
    const interState = makeInvoice({ isInterState: true, placeOfSupplyStateCode: '27' });
    const creditNote = makeCreditNote(
      { cgstPaise: 0, sgstPaise: 0, igstPaise: 3600 },
      { cgstPaise: 0, sgstPaise: 0, igstPaise: 3600 },
    );

    const html = buildCreditNoteHtml(REGISTERED_CLINIC, creditNote, interState);

    expect(html).toContain('IGST');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).toContain('₹36.00');
  });

  it('escapes interpolated text and takes the logo only as a base64 data URI', () => {
    const creditNote = makeCreditNote(
      { notes: '</table><script>alert(1)</script>' },
      { description: 'Bruno & Co <b>tabs</b>' },
    );

    const html = buildCreditNoteHtml(REGISTERED_CLINIC, creditNote, makeInvoice());

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Bruno &amp; Co &lt;b&gt;tabs&lt;/b&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('https://cdn.example.com/logo.png');

    const withLogo = buildCreditNoteHtml(
      REGISTERED_CLINIC,
      makeCreditNote(),
      makeInvoice(),
      { logoBase64: 'data:image/png;base64,iVBORw0KGgo=' },
    );
    expect(withLogo).toContain('<img src="data:');
  });

  it('falls back to a safe label rather than rendering undefined for an unknown reason literal', () => {
    const creditNote = makeCreditNote();
    // Simulates an API that grew a sixth reason before the app was updated.
    (creditNote as { reason: string }).reason = 'goodwill_gesture';

    const html = buildCreditNoteHtml(REGISTERED_CLINIC, creditNote, makeInvoice());

    expect(html).not.toContain('undefined');
    expect(html).toContain('Other');
  });
});
