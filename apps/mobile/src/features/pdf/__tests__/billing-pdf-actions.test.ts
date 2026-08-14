import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * D-16's three actions — Print, Share and Download — plus the document
 * assembly each of them shares.
 *
 * ## Why this file tests module-level functions rather than the hook
 *
 * `apps/mobile` cannot render a React component under test: `vitest.config.ts`
 * uses the `node` environment with no Metro transform and `react-test-renderer`
 * is not installed (06-14-SUMMARY.md deviation 1, itself inheriting Phase 5's
 * resolution). Calling `useGeneratePdf()` needs a renderer. So the work each
 * generator does — fetch, inline the logo, build the HTML, name the file — is
 * factored into module-level async functions, and the hook's `useCallback`s are
 * thin wrappers over them. That is the only shape in which D-16's actions are
 * falsifiable in this repo at all.
 *
 * The native modules are mocked, so nothing here proves `Print.printAsync`
 * opens a real print dialog. What it does prove is that Print, Share and
 * Download take three genuinely different code paths — the failure mode the
 * plan is guarding against is three buttons that all quietly share.
 */

// `vi.mock` factories are hoisted above every other statement in the file, so
// the spies they close over must be created inside `vi.hoisted` too.
const native = vi.hoisted(() => ({
  printAsync: vi.fn(async () => undefined),
  printToFileAsync: vi.fn(async () => ({ uri: 'file:///mock/cache/print.pdf' })),
  shareAsync: vi.fn(async () => undefined),
  moveAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  downloadAsync: vi.fn(async () => ({ status: 200, uri: 'file:///mock/cache/logo' })),
  readAsStringAsync: vi.fn(async () => 'iVBORw0KGgo='),
}));

const {
  printAsync,
  printToFileAsync,
  shareAsync,
  moveAsync,
  downloadAsync,
  readAsStringAsync,
} = native;

vi.mock('expo-print', () => ({
  printAsync: native.printAsync,
  printToFileAsync: native.printToFileAsync,
}));
vi.mock('expo-sharing', () => ({
  shareAsync: native.shareAsync,
  isAvailableAsync: vi.fn(async () => true),
}));
vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock/documents/',
  cacheDirectory: 'file:///mock/cache/',
  moveAsync: native.moveAsync,
  deleteAsync: native.deleteAsync,
  downloadAsync: native.downloadAsync,
  readAsStringAsync: native.readAsStringAsync,
  getInfoAsync: vi.fn(async () => ({ exists: false })),
}));
// AuthProvider pulls in expo-secure-store -> react-native, which cannot be
// parsed in this environment. The hook is not exercised here; only the
// module-level functions it delegates to are.
vi.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ accessToken: 'token-123' }),
}));

import {
  buildCreditNoteDocument,
  buildInvoiceDocument,
  buildReceiptDocument,
  printPdf,
  resolveLogoBase64,
  savePdf,
} from '../hooks/useGeneratePdf';

// ─── API fixtures ───────────────────────────────────────────────────────────

const CLINIC = {
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

const INVOICE = {
  id: 'inv-1',
  clinicId: 'clinic-1',
  invoiceNumber: 'INV-202608-0001',
  status: 'PAID',
  source: 'consultation',
  consultationId: null,
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
  dueDate: '2026-08-20T00:00:00.000Z',
  notes: null,
  finalizedAt: '2026-08-13T10:00:00.000Z',
  voidedAt: null,
  voidReason: null,
  voidRestoredStock: false,
  exceptionFlag: null,
  exceptionDetectedAt: null,
  exceptionResolvedAt: null,
  exceptionResolvedById: null,
  exceptionNotes: null,
  createdAt: '2026-08-13T09:30:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
  lineItems: [
    {
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
      createdAt: '2026-08-13T09:30:00.000Z',
    },
  ],
  payments: [],
  refunds: [],
  creditNotes: [],
  pet: { id: 'pet-1', name: 'Bruno', species: 'DOG' },
  owner: { id: 'owner-1', name: 'Asha Menon', mobile: '+91 91234 56789' },
  clinic: CLINIC,
};

const RECEIPT = {
  id: 'rct-1',
  clinicId: 'clinic-1',
  paymentId: 'pay-1',
  invoiceId: 'inv-1',
  receiptNumber: 'RCT-202608-0007',
  amountPaise: 23600,
  method: 'upi',
  transactionRef: 'pay_MkT9xQ2bLp01',
  issuedAt: '2026-08-13T10:15:00.000Z',
  createdAt: '2026-08-13T10:15:00.000Z',
};

const CREDIT_NOTE = {
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
  issuedAt: '2026-08-14T06:00:00.000Z',
  createdAt: '2026-08-14T06:00:00.000Z',
  lineItems: [
    {
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
      createdAt: '2026-08-14T06:00:00.000Z',
    },
  ],
  invoice: { id: 'inv-1', invoiceNumber: 'INV-202608-0001', grandTotalPaise: 23600 },
};

const requestedPaths: string[] = [];

function mockApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      requestedPaths.push(path);

      const body = path.includes('/receipts/')
        ? RECEIPT
        : path.includes('/credit-notes/')
          ? CREDIT_NOTE
          : INVOICE;

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: body }),
      };
    }),
  );
}

beforeEach(() => {
  requestedPaths.length = 0;
  vi.clearAllMocks();
  downloadAsync.mockResolvedValue({ status: 200, uri: 'file:///mock/cache/logo' });
  readAsStringAsync.mockResolvedValue('iVBORw0KGgo=');
  mockApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Print (D-16 action 1) ──────────────────────────────────────────────────

describe('printPdf', () => {
  it('opens the native print dialog and writes no file and opens no share sheet', async () => {
    await printPdf('<html><body>hi</body></html>');

    expect(printAsync).toHaveBeenCalledTimes(1);
    expect(printAsync).toHaveBeenCalledWith({ html: '<html><body>hi</body></html>' });
    expect(printToFileAsync).not.toHaveBeenCalled();
    expect(shareAsync).not.toHaveBeenCalled();
    expect(moveAsync).not.toHaveBeenCalled();
  });
});

// ─── Download (D-16 action 3) ───────────────────────────────────────────────

describe('savePdf', () => {
  it('writes the PDF into the app documents directory and returns its URI', async () => {
    const uri = await savePdf('<html></html>', 'Invoice_INV-202608-0001');

    expect(printToFileAsync).toHaveBeenCalledTimes(1);
    expect(moveAsync).toHaveBeenCalledWith({
      from: 'file:///mock/cache/print.pdf',
      to: 'file:///mock/documents/Invoice_INV-202608-0001.pdf',
    });
    expect(uri).toBe('file:///mock/documents/Invoice_INV-202608-0001.pdf');
  });

  it('is a distinct action from sharing — it does not open the share sheet', async () => {
    await savePdf('<html></html>', 'Invoice_INV-202608-0001');

    expect(shareAsync).not.toHaveBeenCalled();
    expect(printAsync).not.toHaveBeenCalled();
  });

  it('sanitises the filename', async () => {
    const uri = await savePdf('<html></html>', 'Invoice/INV 202608:0001');

    expect(uri).toBe('file:///mock/documents/Invoice_INV_202608_0001.pdf');
  });
});

// ─── Logo inlining ──────────────────────────────────────────────────────────

describe('resolveLogoBase64', () => {
  it('returns a base64 data URI, because a remote src does not render in expo-print on iOS', async () => {
    const result = await resolveLogoBase64('https://cdn.example.com/logo.png');

    expect(result).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(downloadAsync).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the clinic has no logo, without touching the network', async () => {
    expect(await resolveLogoBase64(null)).toBeUndefined();
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('returns undefined rather than throwing when the download fails', async () => {
    downloadAsync.mockRejectedValueOnce(new Error('offline'));

    // A missing logo must never block a financial document from being produced.
    expect(await resolveLogoBase64('https://cdn.example.com/logo.png')).toBeUndefined();
  });
});

// ─── Document assembly ──────────────────────────────────────────────────────

describe('buildInvoiceDocument', () => {
  it('fetches the invoice, inlines the logo and names the file after the invoice number', async () => {
    const doc = await buildInvoiceDocument('inv-1', 'token-123');

    expect(requestedPaths.some((p) => p.endsWith('/api/v1/billing/invoices/inv-1'))).toBe(true);
    expect(doc.filename).toBe('Invoice_INV-202608-0001');
    expect(doc.html).toContain('TAX INVOICE');
    expect(doc.html).toContain('INV-202608-0001');
    expect(doc.html).toContain('<img src="data:image/png;base64,');
  });

  it('still produces the document when the logo cannot be fetched', async () => {
    downloadAsync.mockRejectedValueOnce(new Error('offline'));

    const doc = await buildInvoiceDocument('inv-1', 'token-123');

    expect(doc.html).toContain('TAX INVOICE');
    expect(doc.html).not.toContain('<img');
  });

  it('propagates an API failure so the caller can surface it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' } }),
      })),
    );

    await expect(buildInvoiceDocument('inv-nope', 'token-123')).rejects.toThrow(
      'Invoice not found',
    );
  });
});

describe('buildReceiptDocument', () => {
  it('fetches both the receipt and its invoice and names the file after the receipt number', async () => {
    const doc = await buildReceiptDocument('inv-1', 'rct-1', 'token-123');

    expect(
      requestedPaths.some((p) => p.endsWith('/api/v1/billing/invoices/inv-1/receipts/rct-1')),
    ).toBe(true);
    expect(requestedPaths.some((p) => p.endsWith('/api/v1/billing/invoices/inv-1'))).toBe(true);
    expect(doc.filename).toBe('Receipt_RCT-202608-0007');
    expect(doc.html).toContain('PAYMENT RECEIPT');
    expect(doc.html).toContain('RCT-202608-0007');
    expect(doc.html).toContain('80mm');
  });
});

describe('buildCreditNoteDocument', () => {
  it('fetches the credit note and the invoice it references, and names the file after the CN number', async () => {
    const doc = await buildCreditNoteDocument('cn-1', 'token-123');

    expect(requestedPaths.some((p) => p.endsWith('/api/v1/billing/credit-notes/cn-1'))).toBe(
      true,
    );
    expect(requestedPaths.some((p) => p.endsWith('/api/v1/billing/invoices/inv-1'))).toBe(true);
    expect(doc.filename).toBe('CreditNote_CN-202608-0001');
    expect(doc.html).toContain('CREDIT NOTE');
    expect(doc.html).toContain('For Invoice #INV-202608-0001');
  });
});
