import { describe, it, expect } from 'vitest';
import {
  invoiceLineItemInputSchema,
  createInvoiceSchema,
  updateDraftInvoiceSchema,
  finalizeInvoiceSchema,
  recordPaymentSchema,
  refundInputSchema,
  makeRefundInputSchema,
  voidInvoiceSchema,
  creditNoteSchema,
  billingSettingsSchema,
  billingSettingsResponseSchema,
  quickSaleSchema,
  invoiceListQuerySchema,
  createPaymentLinkSchema,
  resolveBillingExceptionSchema,
} from '../billing.js';

const UUID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const UUID_2 = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';

function validLine(overrides: Record<string, unknown> = {}) {
  return {
    lineType: 'service',
    description: 'General Consultation',
    quantity: 1,
    unitPricePaise: 50000,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
    ...overrides,
  };
}

// ─── Behaviour 1: fractional money and non-positive quantity ────────────────

describe('invoiceLineItemInputSchema — money and quantity', () => {
  it('accepts a well-formed line', () => {
    expect(invoiceLineItemInputSchema.safeParse(validLine()).success).toBe(true);
  });

  it('rejects a fractional unitPricePaise', () => {
    const result = invoiceLineItemInputSchema.safeParse(validLine({ unitPricePaise: 100.5 }));
    expect(result.success).toBe(false);
  });

  it('rejects a quantity of zero', () => {
    expect(invoiceLineItemInputSchema.safeParse(validLine({ quantity: 0 })).success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    expect(invoiceLineItemInputSchema.safeParse(validLine({ quantity: -1 })).success).toBe(false);
  });

  it('rejects a negative unitPricePaise', () => {
    expect(
      invoiceLineItemInputSchema.safeParse(validLine({ unitPricePaise: -1 })).success,
    ).toBe(false);
  });

  it('rejects a gstRatePercent that is not a current slab', () => {
    expect(invoiceLineItemInputSchema.safeParse(validLine({ gstRatePercent: 12 })).success).toBe(
      false,
    );
    expect(invoiceLineItemInputSchema.safeParse(validLine({ gstRatePercent: 28 })).success).toBe(
      false,
    );
  });

  it('accepts every current slab', () => {
    for (const rate of [0, 5, 18, 40]) {
      expect(invoiceLineItemInputSchema.safeParse(validLine({ gstRatePercent: rate })).success).toBe(
        true,
      );
    }
  });
});

// ─── Behaviour 2: discount bounds ───────────────────────────────────────────

describe('invoiceLineItemInputSchema — discounts', () => {
  it('rejects a percent discount above 100', () => {
    const result = invoiceLineItemInputSchema.safeParse(
      validLine({ discountType: 'percent', discountValue: 150 }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts the same value as a flat discount', () => {
    const result = invoiceLineItemInputSchema.safeParse(
      validLine({ discountType: 'flat', discountValue: 150 }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a 100 percent discount (D-40: no approval threshold for Beta)', () => {
    const result = invoiceLineItemInputSchema.safeParse(
      validLine({ discountType: 'percent', discountValue: 100 }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a discountType with no discountValue', () => {
    const result = invoiceLineItemInputSchema.safeParse(validLine({ discountType: 'percent' }));
    expect(result.success).toBe(false);
  });

  it('rejects a discountValue with no discountType', () => {
    const result = invoiceLineItemInputSchema.safeParse(validLine({ discountValue: 100 }));
    expect(result.success).toBe(false);
  });
});

// ─── No client-computed totals reach any write schema ───────────────────────

describe('createInvoiceSchema — the server owns every total', () => {
  it('accepts a minimal draft', () => {
    const result = createInvoiceSchema.safeParse({ lineItems: [validLine()] });
    expect(result.success).toBe(true);
  });

  it('requires at least one line item', () => {
    expect(createInvoiceSchema.safeParse({ lineItems: [] }).success).toBe(false);
  });

  it('strips a client-supplied grand total rather than trusting it', () => {
    const result = createInvoiceSchema.safeParse({
      lineItems: [validLine()],
      grandTotalPaise: 1,
      subtotalPaise: 1,
      cgstPaise: 1,
      sgstPaise: 1,
      igstPaise: 1,
      taxableValuePaise: 1,
    });
    expect(result.success).toBe(true);
    const parsed = result.success ? (result.data as Record<string, unknown>) : {};
    expect(parsed).not.toHaveProperty('grandTotalPaise');
    expect(parsed).not.toHaveProperty('subtotalPaise');
    expect(parsed).not.toHaveProperty('cgstPaise');
    expect(parsed).not.toHaveProperty('taxableValuePaise');
  });

  it('defaults source to manual', () => {
    const result = createInvoiceSchema.safeParse({ lineItems: [validLine()] });
    expect(result.success && result.data.source).toBe('manual');
  });

  it('rejects an invoice-level percent discount above 100', () => {
    const result = createInvoiceSchema.safeParse({
      lineItems: [validLine()],
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateDraftInvoiceSchema / finalizeInvoiceSchema', () => {
  it('accepts an empty patch', () => {
    expect(updateDraftInvoiceSchema.safeParse({}).success).toBe(true);
  });

  it('still rejects a bad discount on a patch', () => {
    const result = updateDraftInvoiceSchema.safeParse({
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 101,
    });
    expect(result.success).toBe(false);
  });

  /**
   * CR-01. An omitted key and an explicit `null` are different requests: the
   * first says "I am not editing the discount", the second says "remove it".
   * Without a wire form for the second, an invoice-level discount could never be
   * taken off a draft once applied.
   */
  it('accepts an explicit null pair as the "clear this discount" signal', () => {
    const result = updateDraftInvoiceSchema.safeParse({
      invoiceDiscountType: null,
      invoiceDiscountValue: null,
    });
    expect(result.success).toBe(true);
    const parsed = result.success ? result.data : {};
    // The keys must SURVIVE parsing — the service distinguishes "present and
    // null" from "absent", so a schema that stripped them would erase the intent.
    expect(parsed).toHaveProperty('invoiceDiscountType', null);
    expect(parsed).toHaveProperty('invoiceDiscountValue', null);
  });

  it('leaves the discount keys absent when the patch does not mention them', () => {
    const result = updateDraftInvoiceSchema.safeParse({ notes: 'just a note' });
    expect(result.success).toBe(true);
    const parsed = result.success ? (result.data as Record<string, unknown>) : {};
    expect('invoiceDiscountType' in parsed).toBe(false);
    expect('invoiceDiscountValue' in parsed).toBe(false);
  });

  it('rejects a half-cleared discount, which is neither a discount nor a removal', () => {
    expect(
      updateDraftInvoiceSchema.safeParse({
        invoiceDiscountType: null,
        invoiceDiscountValue: 5_000,
      }).success,
    ).toBe(false);

    expect(
      updateDraftInvoiceSchema.safeParse({
        invoiceDiscountType: 'flat',
        invoiceDiscountValue: null,
      }).success,
    ).toBe(false);
  });

  it('finalize accepts no line items and no totals', () => {
    const result = finalizeInvoiceSchema.safeParse({ placeOfSupplyStateCode: '27' });
    expect(result.success).toBe(true);
    const parsed = result.success ? (result.data as Record<string, unknown>) : {};
    expect(parsed).not.toHaveProperty('lineItems');
    expect(parsed).not.toHaveProperty('grandTotalPaise');
  });

  it('finalize rejects a state code that is not two characters', () => {
    expect(finalizeInvoiceSchema.safeParse({ placeOfSupplyStateCode: '277' }).success).toBe(false);
  });
});

// ─── Behaviour 3: Razorpay's 100-paise INR minimum ──────────────────────────

describe('recordPaymentSchema — Razorpay minimum', () => {
  it('rejects a 99 paise payment on the razorpay channel', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'single',
      method: 'upi',
      channel: 'razorpay',
      amountPaise: 99,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a 99 paise cash payment recorded manually', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'single',
      method: 'cash',
      channel: 'manual',
      amountPaise: 99,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a 100 paise razorpay payment', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'single',
      method: 'upi',
      channel: 'razorpay',
      amountPaise: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a fractional amount', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'single',
      method: 'cash',
      amountPaise: 100.5,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Behaviour 4: split legs must sum to the declared total ─────────────────

describe('recordPaymentSchema — split payments (D-10)', () => {
  it('accepts a balanced split', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'split',
      totalPaise: 150000,
      cashAmountPaise: 100000,
      digitalAmountPaise: 50000,
      digitalMethod: 'upi',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a split whose legs do not sum to the total', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'split',
      totalPaise: 150000,
      cashAmountPaise: 100000,
      digitalAmountPaise: 40000,
      digitalMethod: 'upi',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a digital leg below the Razorpay minimum', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'split',
      totalPaise: 100099,
      cashAmountPaise: 100000,
      digitalAmountPaise: 99,
      digitalMethod: 'upi',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a card or upi leg declared as cash', () => {
    const result = recordPaymentSchema.safeParse({
      mode: 'split',
      totalPaise: 150000,
      cashAmountPaise: 100000,
      digitalAmountPaise: 50000,
      digitalMethod: 'cash',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Behaviour 5: refunds are bounded ───────────────────────────────────────

describe('refundInputSchema', () => {
  it('accepts a partial refund', () => {
    const result = refundInputSchema.safeParse({ type: 'partial', amountPaise: 25000 });
    expect(result.success).toBe(true);
  });

  it('rejects a zero or negative refund', () => {
    expect(refundInputSchema.safeParse({ type: 'partial', amountPaise: 0 }).success).toBe(false);
    expect(refundInputSchema.safeParse({ type: 'full', amountPaise: -1 }).success).toBe(false);
  });

  it('rejects an amount above the supplied maxRefundablePaise', () => {
    const bounded = makeRefundInputSchema(50000);
    expect(bounded.safeParse({ type: 'partial', amountPaise: 50001 }).success).toBe(false);
    expect(bounded.safeParse({ type: 'partial', amountPaise: 50000 }).success).toBe(true);
  });

  it('accepts a per-leg refund naming its payment and method (D-42)', () => {
    const result = refundInputSchema.safeParse({
      type: 'partial',
      amountPaise: 25000,
      paymentId: UUID,
      method: 'cash',
    });
    expect(result.success).toBe(true);
  });
});

// ─── Void and credit note ───────────────────────────────────────────────────

describe('voidInvoiceSchema', () => {
  it('requires a reason', () => {
    expect(voidInvoiceSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(voidInvoiceSchema.safeParse({ reason: 'Wrong pet' }).success).toBe(true);
  });

  it('defaults restoreStock to true and refuses to opt out (D-34)', () => {
    const result = voidInvoiceSchema.safeParse({ reason: 'Wrong pet' });
    expect(result.success && result.data.restoreStock).toBe(true);
    expect(voidInvoiceSchema.safeParse({ reason: 'Wrong pet', restoreStock: false }).success).toBe(
      false,
    );
  });
});

describe('creditNoteSchema', () => {
  it('accepts a credit note against one line', () => {
    const result = creditNoteSchema.safeParse({
      reason: 'product_returned',
      items: [{ invoiceLineItemId: UUID, creditAmountPaise: 25000 }],
    });
    expect(result.success).toBe(true);
  });

  it('requires at least one item', () => {
    expect(creditNoteSchema.safeParse({ reason: 'other', items: [] }).success).toBe(false);
  });

  it('rejects a reason outside the picker vocabulary', () => {
    const result = creditNoteSchema.safeParse({
      reason: 'because',
      items: [{ invoiceLineItemId: UUID, creditAmountPaise: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('requires notes when the reason is other', () => {
    const result = creditNoteSchema.safeParse({
      reason: 'other',
      items: [{ invoiceLineItemId: UUID, creditAmountPaise: 1 }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Behaviour 6: GST cannot be enabled without a valid GSTIN ───────────────

describe('billingSettingsSchema — GST guard (Section 122)', () => {
  it('accepts GST disabled with no GSTIN', () => {
    expect(billingSettingsSchema.safeParse({ gstEnabled: false }).success).toBe(true);
  });

  it('rejects gstEnabled with no GSTIN at all', () => {
    const result = billingSettingsSchema.safeParse({ gstEnabled: true });
    expect(result.success).toBe(false);
    const message = result.success ? '' : result.error.issues.map((i) => i.message).join(' ');
    expect(message).toContain('GST cannot be enabled without a valid GSTIN');
  });

  it('rejects gstEnabled with a malformed GSTIN', () => {
    const result = billingSettingsSchema.safeParse({
      gstEnabled: true,
      gstin: '27aapfu0939f1zv',
    });
    expect(result.success).toBe(false);
  });

  it('accepts gstEnabled with a well-formed GSTIN', () => {
    const result = billingSettingsSchema.safeParse({
      gstEnabled: true,
      gstin: '27AAPFU0939F1ZV',
      stateCode: '27',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a state code that disagrees with the GSTIN', () => {
    const result = billingSettingsSchema.safeParse({
      gstEnabled: true,
      gstin: '27AAPFU0939F1ZV',
      stateCode: '29',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a defaultGstRate that is not a current slab', () => {
    expect(billingSettingsSchema.safeParse({ defaultGstRate: 12 }).success).toBe(false);
    expect(billingSettingsSchema.safeParse({ defaultGstRate: 28 }).success).toBe(false);
    expect(billingSettingsSchema.safeParse({ defaultGstRate: 18 }).success).toBe(true);
  });
});

// ─── Behaviour 7: secrets in, never out ─────────────────────────────────────

describe('billingSettingsSchema — Razorpay credentials', () => {
  it('rejects a key secret shorter than 8 characters', () => {
    const result = billingSettingsSchema.safeParse({ razorpayKeySecret: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects a webhook secret shorter than 8 characters', () => {
    const result = billingSettingsSchema.safeParse({ razorpayWebhookSecret: 'abc' });
    expect(result.success).toBe(false);
  });

  it('accepts a credible secret', () => {
    const result = billingSettingsSchema.safeParse({
      razorpayKeyId: 'rzp_test_abc123',
      razorpayKeySecret: 'a-credible-secret-value',
    });
    expect(result.success).toBe(true);
  });

  it('never echoes a secret through the response schema', () => {
    const result = billingSettingsResponseSchema.safeParse({
      clinicId: UUID,
      gstin: null,
      gstEnabled: false,
      stateCode: null,
      defaultGstRate: null,
      defaultDueDays: 0,
      bankDetails: null,
      invoiceFooterText: null,
      razorpayKeyId: 'rzp_test_abc123',
      hasRazorpayKeySecret: true,
      hasRazorpayWebhookSecret: true,
      razorpayWebhookToken: 'tok_abc',
      razorpayTestMode: true,
      webhookUrl: 'https://api.example.test/api/v1/webhooks/razorpay/tok_abc',
      webhookConfigured: true,
      // a serializer bug upstream leaks these in — the schema must drop them
      razorpayKeySecret: 'super-secret',
      razorpayWebhookSecret: 'super-secret-too',
      razorpayKeySecretEnc: 'ciphertext',
    });
    expect(result.success).toBe(true);
    const parsed = result.success ? (result.data as Record<string, unknown>) : {};
    expect(parsed).not.toHaveProperty('razorpayKeySecret');
    expect(parsed).not.toHaveProperty('razorpayWebhookSecret');
    expect(parsed).not.toHaveProperty('razorpayKeySecretEnc');
    expect(parsed.hasRazorpayKeySecret).toBe(true);
  });
});

// ─── Quick Sale, list query, payment links, exceptions ──────────────────────

describe('quickSaleSchema (D-04)', () => {
  it('accepts a cart with no owner on file (D-44)', () => {
    const result = quickSaleSchema.safeParse({
      items: [{ inventoryItemId: UUID, quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty cart and a fractional quantity', () => {
    expect(quickSaleSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      quickSaleSchema.safeParse({ items: [{ inventoryItemId: UUID, quantity: 1.5 }] }).success,
    ).toBe(false);
  });
});

describe('invoiceListQuerySchema (D-24)', () => {
  it('defaults to all / newest / 20', () => {
    const result = invoiceListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('all');
      expect(result.data.sort).toBe('newest');
      expect(result.data.limit).toBe(20);
    }
  });

  it('coerces a string limit and caps it at 100', () => {
    expect(invoiceListQuerySchema.safeParse({ limit: '50' }).success).toBe(true);
    expect(invoiceListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('rejects a status outside the filter vocabulary', () => {
    expect(invoiceListQuerySchema.safeParse({ status: 'finalized' }).success).toBe(false);
  });
});

describe('createPaymentLinkSchema (D-27, D-39)', () => {
  it('accepts a single invoice', () => {
    const result = createPaymentLinkSchema.safeParse({ invoiceIds: [UUID] });
    expect(result.success).toBe(true);
  });

  it('accepts several invoices for one combined link (D-39)', () => {
    const result = createPaymentLinkSchema.safeParse({ invoiceIds: [UUID, UUID_2] });
    expect(result.success).toBe(true);
  });

  it('rejects an empty invoice list', () => {
    expect(createPaymentLinkSchema.safeParse({ invoiceIds: [] }).success).toBe(false);
  });
});

describe('resolveBillingExceptionSchema (D-35, D-36)', () => {
  it('requires notes explaining the resolution', () => {
    expect(resolveBillingExceptionSchema.safeParse({ exceptionNotes: '' }).success).toBe(false);
    expect(
      resolveBillingExceptionSchema.safeParse({ exceptionNotes: 'Refunded in cash at counter' })
        .success,
    ).toBe(true);
  });
});
