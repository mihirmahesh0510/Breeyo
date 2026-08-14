import { describe, it, expect } from 'vitest';
import {
  BILLING_PAYMENT_ENDPOINTS,
  INVOICE_DETAIL_ENDPOINT,
  invoiceDetailQueryKey,
  paymentMutationQueryKeys,
  parseCreditNoteInput,
  parsePaymentInput,
  parseRefundInput,
  parseVoidInput,
} from '../lib/payment-mutations';

const INVOICE_ID = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
const LINE_ITEM_ID = '33333333-3333-4333-8333-333333333333';

describe('endpoint paths', () => {
  // These strings are the contract with `apps/api/src/modules/billing/billing.routes.ts`.
  // A rename on the server that is not mirrored here is a 404 at the counter,
  // which is why they are pinned rather than assembled at the call site.
  it('matches the shipped billing route table', () => {
    expect(INVOICE_DETAIL_ENDPOINT(INVOICE_ID)).toBe(`/api/v1/billing/invoices/${INVOICE_ID}`);
    expect(BILLING_PAYMENT_ENDPOINTS.recordPayment(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/payments`,
    );
    expect(BILLING_PAYMENT_ENDPOINTS.retryPaymentLink(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/payments/retry`,
    );
    expect(BILLING_PAYMENT_ENDPOINTS.markUnpaid(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/payments/mark-unpaid`,
    );
    expect(BILLING_PAYMENT_ENDPOINTS.markPaid(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/mark-paid`,
    );
    expect(BILLING_PAYMENT_ENDPOINTS.voidInvoice(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/void`,
    );
    expect(BILLING_PAYMENT_ENDPOINTS.createRefund(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/refunds`,
    );
    expect(BILLING_PAYMENT_ENDPOINTS.issueCreditNote(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/credit-notes`,
    );
    expect(BILLING_PAYMENT_ENDPOINTS.refundable(INVOICE_ID)).toBe(
      `/api/v1/billing/invoices/${INVOICE_ID}/refundable`,
    );
  });

  it('covers every money-state write the detail screen can perform', () => {
    expect(Object.keys(BILLING_PAYMENT_ENDPOINTS).sort()).toEqual([
      'createRefund',
      'issueCreditNote',
      'markPaid',
      'markUnpaid',
      'recordPayment',
      'refundable',
      'retryPaymentLink',
      'voidInvoice',
    ]);
  });
});

describe('cache keys', () => {
  it('keys the invoice detail under the shared invoices namespace', () => {
    expect(invoiceDetailQueryKey(INVOICE_ID)).toEqual(['invoices', INVOICE_ID]);
  });

  // T-06-113: a captured payment that leaves any surface showing the old
  // balance invites a second collection. The detail, the list and the dashboard
  // are the three surfaces that render a balance.
  it('invalidates the detail, the list and the dashboard on every money write', () => {
    const keys = paymentMutationQueryKeys(INVOICE_ID);

    expect(keys).toContainEqual(['invoices', INVOICE_ID]);
    expect(keys).toContainEqual(['invoices']);
    expect(keys).toContainEqual(['billing', 'dashboard']);
    expect(keys).toHaveLength(3);
  });
});

describe('parsePaymentInput', () => {
  it('accepts a single cash payment', () => {
    expect(
      parsePaymentInput({ mode: 'single', method: 'cash', amountPaise: 50_000 }),
    ).toMatchObject({ mode: 'single', method: 'cash', amountPaise: 50_000, channel: 'manual' });
  });

  it('rejects a Razorpay leg below the gateway minimum before a round trip', () => {
    expect(() =>
      parsePaymentInput({
        mode: 'single',
        method: 'upi',
        channel: 'razorpay',
        amountPaise: 50,
      }),
    ).toThrow(/at least 100 paise/i);
  });

  it('rejects a split whose legs do not sum to the declared total', () => {
    expect(() =>
      parsePaymentInput({
        mode: 'split',
        totalPaise: 100_000,
        cashAmountPaise: 40_000,
        digitalAmountPaise: 50_000,
        digitalMethod: 'upi',
      }),
    ).toThrow(/sum to the declared total/i);
  });

  it('accepts a split that sums', () => {
    expect(
      parsePaymentInput({
        mode: 'split',
        totalPaise: 100_000,
        cashAmountPaise: 40_000,
        digitalAmountPaise: 60_000,
        digitalMethod: 'upi',
      }),
    ).toMatchObject({ mode: 'split', totalPaise: 100_000 });
  });
});

describe('parseVoidInput', () => {
  it('requires a reason', () => {
    expect(() => parseVoidInput({ reason: '' })).toThrow();
  });

  it('defaults the stock-restoration choice to true', () => {
    expect(parseVoidInput({ reason: 'Billed the wrong pet' })).toEqual({
      reason: 'Billed the wrong pet',
      restoreStock: true,
    });
  });

  // D-34 amended D-26: the server decides WHICH movements reverse (billing-time
  // lines only), and the shared schema therefore accepts `true` alone. The sheet
  // still surfaces the choice, so an opt-out has to fail loudly here rather than
  // be silently ignored on the wire — see VoidConfirmSheet's note.
  it('rejects an opt-out rather than silently dropping it', () => {
    expect(() => parseVoidInput({ reason: 'Duplicate invoice', restoreStock: false })).toThrow();
  });
});

describe('parseRefundInput', () => {
  it('carries the specific payment leg through untouched (D-42)', () => {
    expect(
      parseRefundInput({
        type: 'partial',
        amountPaise: 25_000,
        paymentId: PAYMENT_ID,
        method: 'cash',
      }),
    ).toMatchObject({ paymentId: PAYMENT_ID, method: 'cash', amountPaise: 25_000 });
  });

  it('rejects a non-positive amount', () => {
    expect(() => parseRefundInput({ type: 'full', amountPaise: 0 })).toThrow();
  });
});

describe('parseCreditNoteInput', () => {
  it('accepts a credited line', () => {
    expect(
      parseCreditNoteInput({
        reason: 'incorrect_charge',
        items: [{ invoiceLineItemId: LINE_ITEM_ID, creditAmountPaise: 10_000 }],
      }),
    ).toMatchObject({ reason: 'incorrect_charge' });
  });

  it('requires notes when the reason is "other"', () => {
    expect(() =>
      parseCreditNoteInput({
        reason: 'other',
        items: [{ invoiceLineItemId: LINE_ITEM_ID, creditAmountPaise: 10_000 }],
      }),
    ).toThrow(/notes are required/i);
  });
});
