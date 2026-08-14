import { z } from 'zod';
import {
  CREDIT_NOTE_REASONS,
  DISCOUNT_TYPES,
  GST_RATE_SLABS,
  GSTIN_REGEX,
  INVOICE_LINE_TYPES,
  INVOICE_LIST_FILTERS,
  INVOICE_LIST_SORTS,
  INVOICE_SOURCES,
  PAYMENT_CHANNELS,
  PAYMENT_METHODS,
  RAZORPAY_MIN_AMOUNT_PAISE,
  REFUND_METHODS,
  TAX_TREATMENTS,
  stateCodeFromGstin,
} from '@breeyo/types';

/**
 * A GST rate must be one of the current slabs, not merely a percentage.
 *
 * Declared here, above its first use, rather than beside the invoice schemas
 * further down: `serviceCatalogSchema` needs it too, and a `const` is not
 * hoisted into the object literal that references it.
 *
 * `min(0).max(100)` — the previous guard on `gstRateOverride` — accepts 12 and
 * 28, the two slabs GST 2.0 retired on 22 September 2025. A catalog row saved
 * at a rate that no longer legally exists produces an incorrect tax charge on
 * every invoice that uses it, and `invoice_line_items.gst_rate_percent` freezes
 * that wrong rate onto the finalized document permanently (Finding G2).
 */
const gstRateSlabSchema = z
  .number()
  .refine((rate) => GST_RATE_SLABS.includes(rate), {
    message: 'Not a current GST slab',
  });

const serviceCategorySchema = z
  .enum([
    'consultation',
    'vaccination',
    'surgery',
    'diagnostic',
    'dental',
    'grooming',
    'preventive',
    'emergency',
    'other',
  ])
  .default('other');

export const serviceCatalogSchema = z.object({
  name: z.string().min(1).max(100),
  category: serviceCategorySchema,
  /**
   * Integer paise (D-31). A fractional value here is a rupee figure that
   * slipped through unconverted — a 100x error on a money field — never a
   * rounding nicety.
   */
  price: z.number().int().nonnegative(),
  sacCode: z.string().max(10).optional(),
  hsnCode: z.string().max(10).optional(),
  gstRateOverride: gstRateSlabSchema.optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
});

export type ServiceCatalogInput = z.infer<typeof serviceCatalogSchema>;

/**
 * The PATCH shape for an existing catalog entry (D-02).
 *
 * Every field is optional because the mobile form submits only what changed,
 * and `.strict()` because an unrecognised key on a reference-data write is a
 * client bug worth surfacing rather than silently dropping.
 *
 * `isPreset` is accepted here **only so the service can reject it** with
 * `CANNOT_MODIFY_PRESET`. Omitting it from the schema would have Zod strip the
 * key silently, and the caller would get a 200 for a change that never
 * happened. Which fields a *preset* may change is a domain rule, not a shape
 * rule, and lives in `ServiceCatalogService.update`.
 */
export const serviceCatalogUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    category: serviceCategorySchema.optional(),
    price: z.number().int().nonnegative().optional(),
    sacCode: z.string().max(10).nullable().optional(),
    hsnCode: z.string().max(10).nullable().optional(),
    gstRateOverride: gstRateSlabSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isPreset: z.boolean().optional(),
  })
  .strict();

export type ServiceCatalogUpdateInput = z.infer<typeof serviceCatalogUpdateSchema>;

// ─── Phase 6 billing write schemas ──────────────────────────────────────────
//
// Shared by the Fastify handlers and the mobile forms, so a payload the phone
// accepts is exactly the payload the server accepts. Two rules hold everywhere
// below and are asserted by grep gates in the plan:
//
//   1. Every money field is `z.number().int()`. Money is integer paise (D-31);
//      a fractional value is always a bug or an attack, never a rounding
//      nicety, and JavaScript floats cannot be trusted to carry it.
//   2. No schema accepts a computed money figure. Line quantities and unit
//      prices come from the client; every derived figure — the sub-total, the
//      tax heads, the round-off, the grand total — is recomputed server-side
//      from the line items at finalize and is structurally absent from these
//      inputs (ASVS V11; 06-RESEARCH's "computing money on the client and
//      trusting it" anti-pattern). Zod strips unknown keys, so a client that
//      sends one is silently ignored rather than believed.

/**
 * A discount is either a whole percentage of 0-100 or a flat amount in paise;
 * which one is decided by the sibling `discountType`, so neither field is
 * meaningful without the other.
 *
 * There is no unit change anywhere on this field's journey: what the client
 * sends is what `invoices.invoice_discount_value` and
 * `invoice_line_items.discount_value` store and what the service's arithmetic
 * divides by 100. Do not send basis points, and do not scale on the way in —
 * the bound below (percent <= 100) is what makes a 100% write-off expressible
 * at all, and it is enforced against the same units the service reads.
 */
function discountGuard(
  discountType: string | undefined,
  discountValue: number | undefined,
  ctx: z.RefinementCtx,
  typeField: string,
  valueField: string,
): void {
  if (discountType !== undefined && discountValue === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [valueField],
      message: 'A discount type requires a discount value',
    });
  }
  if (discountValue !== undefined && discountType === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [typeField],
      message: 'A discount value requires a discount type',
    });
  }
  if (discountType === 'percent' && discountValue !== undefined && discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [valueField],
      message: 'A percentage discount cannot exceed 100',
    });
  }
}

// `gstRateSlabSchema` is declared at the top of this file, above
// `serviceCatalogSchema`, which needs it as well.

export const invoiceLineItemInputSchema = z
  .object({
    lineType: z.enum(INVOICE_LINE_TYPES),
    serviceCatalogId: z.string().uuid().optional(),
    inventoryItemId: z.string().uuid().optional(),
    /**
     * Present when Phase 5's dispense flow already decremented a batch for this
     * line. Finalize stamps the invoice id onto that movement instead of
     * deducting a second time.
     */
    stockMovementId: z.string().uuid().optional(),
    description: z.string().min(1).max(200),
    quantity: z.number().int().positive(),
    unitPricePaise: z.number().int().nonnegative(),
    discountType: z.enum(DISCOUNT_TYPES).optional(),
    discountValue: z.number().int().nonnegative().optional(),
    hsnSacCode: z.string().max(10).optional(),
    taxTreatment: z.enum(TAX_TREATMENTS),
    gstRatePercent: gstRateSlabSchema,
  })
  .superRefine((value, ctx) => {
    discountGuard(value.discountType, value.discountValue, ctx, 'discountType', 'discountValue');
  });

export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemInputSchema>;

const createInvoiceBaseSchema = z.object({
  petId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  consultationId: z.string().uuid().optional(),
  source: z.enum(INVOICE_SOURCES).default('manual'),
  lineItems: z.array(invoiceLineItemInputSchema).min(1),
  invoiceDiscountType: z.enum(DISCOUNT_TYPES).optional(),
  invoiceDiscountValue: z.number().int().nonnegative().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

function invoiceDiscountGuard(
  value: { invoiceDiscountType?: string; invoiceDiscountValue?: number },
  ctx: z.RefinementCtx,
): void {
  discountGuard(
    value.invoiceDiscountType,
    value.invoiceDiscountValue,
    ctx,
    'invoiceDiscountType',
    'invoiceDiscountValue',
  );
}

export const createInvoiceSchema = createInvoiceBaseSchema.superRefine(invoiceDiscountGuard);
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/** PATCH on a DRAFT (D-21: only a draft is editable). */
export const updateDraftInvoiceSchema = createInvoiceBaseSchema
  .partial()
  .superRefine(invoiceDiscountGuard);
export type UpdateDraftInvoiceInput = z.infer<typeof updateDraftInvoiceSchema>;

/**
 * Finalize takes no line items and no money at all: the invoice's contents are
 * already persisted as a draft, and finalize's job is to number it, freeze the
 * tax snapshot and deduct stock in one transaction.
 */
export const finalizeInvoiceSchema = z.object({
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  placeOfSupplyStateCode: z.string().length(2).optional(),
});
export type FinalizeInvoiceInput = z.infer<typeof finalizeInvoiceSchema>;

// ─── Payments (D-10) ────────────────────────────────────────────────────────

const singlePaymentSchema = z.object({
  mode: z.literal('single'),
  method: z.enum(PAYMENT_METHODS),
  channel: z.enum(PAYMENT_CHANNELS).default('manual'),
  amountPaise: z.number().int().positive(),
  /** Staff-entered UPI reference or card slip number for a manual payment. */
  reference: z.string().max(100).optional(),
});

const splitPaymentSchema = z.object({
  mode: z.literal('split'),
  totalPaise: z.number().int().positive(),
  cashAmountPaise: z.number().int().positive(),
  digitalAmountPaise: z.number().int().positive(),
  digitalMethod: z.enum(['upi', 'card']),
  digitalChannel: z.enum(PAYMENT_CHANNELS).default('razorpay'),
  reference: z.string().max(100).optional(),
});

export const recordPaymentSchema = z
  .discriminatedUnion('mode', [singlePaymentSchema, splitPaymentSchema])
  .superRefine((value, ctx) => {
    if (value.mode === 'single') {
      if (value.channel === 'razorpay' && value.amountPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountPaise'],
          message: `A Razorpay payment must be at least ${RAZORPAY_MIN_AMOUNT_PAISE} paise`,
        });
      }
      return;
    }

    // A split that does not add up silently under-collects: the invoice is
    // marked settled for a total the clinic never received.
    if (value.cashAmountPaise + value.digitalAmountPaise !== value.totalPaise) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totalPaise'],
        message: 'The cash and digital legs must sum to the declared total',
      });
    }

    if (
      value.digitalChannel === 'razorpay' &&
      value.digitalAmountPaise < RAZORPAY_MIN_AMOUNT_PAISE
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['digitalAmountPaise'],
        message: `A Razorpay leg must be at least ${RAZORPAY_MIN_AMOUNT_PAISE} paise`,
      });
    }
  });
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/**
 * D-27 / D-39: one Razorpay link may settle several of an owner's invoices, so
 * this takes a list rather than a single id. Plan 06-03 relaxed the `payments`
 * unique constraint to `(razorpay_payment_link_id, invoice_id)` and added
 * `payment_group_id` precisely so the multi-invoice case is representable.
 */
export const createPaymentLinkSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(20),
  /**
   * Optional because D-44 allows a walk-in with no phone number on file: the QR
   * is rendered on screen for the owner to scan. A contact is only needed when
   * the link must be delivered remotely. Bounds are Razorpay's own.
   */
  customerContact: z.string().min(8).max(14).optional(),
  customerName: z.string().max(100).optional(),
});
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

// ─── Refunds (D-12, D-42) ───────────────────────────────────────────────────

const refundInputBaseSchema = z.object({
  type: z.enum(['full', 'partial']),
  amountPaise: z.number().int().positive(),
  /**
   * D-42: split-payment refunds are issued per leg. Naming the payment being
   * reversed is what lets staff refund only the cash portion, only the digital
   * portion, or both independently. Absent means a whole-invoice adjustment.
   */
  paymentId: z.string().uuid().optional(),
  method: z.enum(REFUND_METHODS).optional(),
  reason: z.string().max(500).optional(),
});

export const refundInputSchema = refundInputBaseSchema;
export type RefundInput = z.infer<typeof refundInputSchema>;

/**
 * The cheap first line of defence, not the guarantee. The authoritative
 * `Σ refunds ≤ Σ payments` check runs inside plan 06-09's refund transaction,
 * under a row lock, because the refundable balance can change between this
 * parse and that write.
 */
export function makeRefundInputSchema(maxRefundablePaise: number) {
  return refundInputBaseSchema.refine((value) => value.amountPaise <= maxRefundablePaise, {
    path: ['amountPaise'],
    message: 'Refund exceeds the refundable balance on this invoice',
  });
}

// ─── Void and credit note ───────────────────────────────────────────────────

/**
 * D-26 asked the user "Return dispensed items to stock?". D-34 amends it: a
 * void is a distinct, unrestricted operation that ALWAYS reverses every stock
 * movement tied to the invoice, however old — the 24-hour window governs only
 * the manual per-dispense return.
 *
 * The field is kept on the wire so the intent is explicit in the request and in
 * the audit log, but only `true` validates. A client sending `false` gets a
 * clear rejection rather than having its choice silently ignored.
 */
export const voidInvoiceSchema = z.object({
  reason: z.string().min(1).max(500),
  restoreStock: z.literal(true).default(true),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

export const creditNoteSchema = z
  .object({
    reason: z.enum(CREDIT_NOTE_REASONS),
    notes: z.string().max(1000).optional(),
    items: z
      .array(
        z.object({
          invoiceLineItemId: z.string().uuid(),
          creditAmountPaise: z.number().int().positive(),
        }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => {
    // A credit note is a record of account with a 6-year retention obligation.
    // "Other" with no explanation leaves an auditor nothing to go on.
    if (value.reason === 'other' && (value.notes === undefined || value.notes.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Notes are required when the reason is Other',
      });
    }
  });
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

// ─── Billing settings (D-29) ────────────────────────────────────────────────

export const billingSettingsSchema = z
  .object({
    gstin: z.string().regex(GSTIN_REGEX, 'Not a valid 15-character GSTIN').optional(),
    gstEnabled: z.boolean().default(false),
    stateCode: z.string().length(2).optional(),
    defaultGstRate: gstRateSlabSchema.optional(),
    defaultDueDays: z.number().int().min(0).max(365).default(0),
    bankDetails: z.string().max(500).optional(),
    invoiceFooterText: z.string().max(1000).optional(),
    razorpayKeyId: z.string().max(64).optional(),
    // Accepted on the way IN only. Never returned: see billingSettingsResponseSchema.
    razorpayKeySecret: z.string().min(8).max(128).optional(),
    razorpayWebhookSecret: z.string().min(8).max(128).optional(),
    razorpayTestMode: z.boolean().default(true),
    /**
     * Opt-in only. Rotating the token changes the clinic's webhook URL, which
     * stops Razorpay delivering to the old one the moment it is saved — the
     * Admin has to paste the new URL into their dashboard before payments
     * confirm again. That is a deliberate recovery action (a leaked token), so
     * it never happens as a side effect of an ordinary settings save.
     */
    rotateWebhookToken: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    // Pitfall 12 / Section 122: collecting tax without a registration is an
    // offence carrying a penalty of up to Rs 25,000 or 100% of the tax. This
    // guard lives in the shared schema so the mobile form and the API reject it
    // identically — a client-only check would be one bypass away from a fine.
    if (value.gstEnabled && value.gstin === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstin'],
        message: 'GST cannot be enabled without a valid GSTIN',
      });
    }

    // The place-of-supply comparison decides CGST+SGST versus IGST. A state
    // code that disagrees with the GSTIN it was supposedly derived from would
    // misclassify every invoice the clinic issues.
    if (value.gstin !== undefined && value.stateCode !== undefined) {
      const derived = stateCodeFromGstin(value.gstin);
      if (derived !== null && derived !== value.stateCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateCode'],
          message: 'State code does not match the first two digits of the GSTIN',
        });
      }
    }
  });
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;

/**
 * The read shape of `GET /billing/settings`, mirroring `ClinicBillingSettings`
 * in `@breeyo/types`.
 *
 * It exists as a runtime schema, not merely a TypeScript interface, so that the
 * secret-stripping is enforced by execution rather than by a type that erases
 * at build time. Zod drops unknown keys, so even if a query upstream selected a
 * ciphertext column by accident, parsing through this schema removes it before
 * it can reach a device (T-06-16, ASVS V8).
 */
export const billingSettingsResponseSchema = z.object({
  clinicId: z.string().uuid(),
  gstin: z.string().nullable(),
  gstEnabled: z.boolean(),
  stateCode: z.string().nullable(),
  defaultGstRate: z.number().nullable(),
  defaultDueDays: z.number().int(),
  bankDetails: z.string().nullable(),
  invoiceFooterText: z.string().nullable(),
  razorpayKeyId: z.string().nullable(),
  hasRazorpayKeySecret: z.boolean(),
  hasRazorpayWebhookSecret: z.boolean(),
  razorpayWebhookToken: z.string().nullable(),
  razorpayTestMode: z.boolean(),
  webhookUrl: z.string().nullable(),
  webhookConfigured: z.boolean(),
});
export type BillingSettingsResponse = z.infer<typeof billingSettingsResponseSchema>;

// ─── Quick Sale, listing, exceptions ────────────────────────────────────────

/** D-04 counter sale: scan, add to cart, invoice. No consultation, owner optional (D-44). */
export const quickSaleSchema = z.object({
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  ownerId: z.string().uuid().optional(),
});
export type QuickSaleInput = z.infer<typeof quickSaleSchema>;

export const invoiceListQuerySchema = z.object({
  status: z.enum(INVOICE_LIST_FILTERS).default('all'),
  search: z.string().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  petId: z.string().uuid().optional(),
  sort: z.enum(INVOICE_LIST_SORTS).default('newest'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type InvoiceListQueryInput = z.infer<typeof invoiceListQuerySchema>;

/**
 * D-35 / D-36: an invoice flagged with a billing exception has every further
 * status-changing action blocked until a human resolves it. Notes are mandatory
 * because clearing the flag is the only record of what was actually done about
 * the money.
 */
export const resolveBillingExceptionSchema = z.object({
  exceptionNotes: z.string().min(1).max(1000),
});
export type ResolveBillingExceptionInput = z.infer<typeof resolveBillingExceptionSchema>;
