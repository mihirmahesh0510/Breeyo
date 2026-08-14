import type { Species } from './constants/species.js';
import type {
  BillingExceptionFlag,
  DiscountType,
  DocumentNumberType,
  InvoiceLineType,
  InvoiceSource,
  InvoiceStatus,
  PaymentChannel,
  PaymentMethod,
  PaymentStatus,
  RefundMethod,
  RefundStatus,
} from './constants/invoice-status.js';
import type { InvoiceDocumentType, TaxTreatment } from './constants/gst.js';
import type { CreditNoteReason } from './constants/billing.constants.js';

export type ServiceCategory =
  | 'consultation'
  | 'vaccination'
  | 'surgery'
  | 'diagnostic'
  | 'dental'
  | 'grooming'
  | 'preventive'
  | 'emergency'
  | 'other';

export interface ServiceCatalog {
  id: string;
  clinicId: string;
  name: string;
  category: ServiceCategory;
  price: number; // paise
  sacCode: string | null;
  hsnCode: string | null;
  gstRateOverride: number | null; // percentage
  isActive: boolean;
  isPreset: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Phase 6 billing entities ───────────────────────────────────────────────
//
// Every interface below mirrors its Prisma model in `apps/api/prisma/schema.prisma`
// field for field. Conventions, all inherited from `ServiceCatalog` above:
//
//   * `id` then `clinicId` first
//   * a nullable database column is `| null`, never an optional `?` property —
//     the field is always present on the wire, it is its value that can be absent
//   * `Date` for every timestamp
//   * money is `number` integer paise with a trailing `// paise` comment (D-31)
//   * a `Decimal` tax rate surfaces here as `number` with a `// percentage` comment
//   * string-literal unions, imported from the constant modules, never re-declared

/**
 * An invoice (D-14, D-20). The money fields are the frozen result of plan
 * 06-05's tax engine, written once by the finalize transaction; nothing in a
 * request path recomputes them from the current catalog or the current slab
 * table, because a historical invoice must stay re-derivable after both change.
 */
export interface Invoice {
  id: string;
  clinicId: string;
  /** Null while `DRAFT`. Assigned inside the finalize transaction (D-15, D-38). */
  invoiceNumber: string | null;
  status: InvoiceStatus;
  source: InvoiceSource;

  consultationId: string | null;
  petId: string | null;
  ownerId: string | null;
  createdById: string;

  /** GST snapshot, frozen at finalize (Finding G4, CGST Rule 46A). */
  documentType: InvoiceDocumentType | null;
  placeOfSupplyStateCode: string | null;
  isInterState: boolean;
  gstEnabledSnapshot: boolean;
  clinicGstinSnapshot: string | null;

  subtotalPaise: number; // paise
  lineDiscountPaise: number; // paise
  invoiceDiscountType: DiscountType | null;
  /** Paise when the type is `flat`; percent times 100 when the type is `percent`. */
  invoiceDiscountValue: number | null;
  invoiceDiscountPaise: number; // paise
  taxableValuePaise: number; // paise
  cgstPaise: number; // paise
  sgstPaise: number; // paise
  igstPaise: number; // paise
  /**
   * Section 170 / Rule 51 disclosure field: `Σ (rounded − exact)` across the
   * three heads, persisted for GSTR-1 reconciliation against the exact
   * pre-rounding figures. NOT a component of {@link Invoice.grandTotalPaise} —
   * the heads above are already rounded.
   */
  roundOffPaise: number; // paise
  /** `taxableValuePaise + cgst + sgst + igst`, i.e. the printed figures. */
  grandTotalPaise: number; // paise
  amountPaidPaise: number; // paise
  creditedPaise: number; // paise
  /** Goes negative on overpayment (D-36) — do not clamp it to zero on display. */
  balancePaise: number; // paise

  dueDate: Date | null;
  notes: string | null;

  finalizedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  /** D-26/D-34: whether the void actually reversed the stock movements. */
  voidRestoredStock: boolean;

  /** Non-null blocks every further status-changing action (D-35, D-36). */
  exceptionFlag: BillingExceptionFlag | null;
  exceptionDetectedAt: Date | null;
  exceptionResolvedAt: Date | null;
  exceptionResolvedById: string | null;
  exceptionNotes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  clinicId: string;
  invoiceId: string;

  lineType: InvoiceLineType;
  sortOrder: number;

  serviceCatalogId: string | null;
  inventoryItemId: string | null;
  /**
   * The deduct/skip discriminator. Non-null means Phase 5's dispense flow has
   * already decremented a batch for this line and finalize must not deduct
   * again; null on a `product` line means finalize deducts FIFO itself.
   */
  stockMovementId: string | null;

  description: string;
  hsnSacCode: string | null;
  quantity: number;

  unitPricePaise: number; // paise
  discountType: DiscountType | null;
  discountValue: number | null;
  lineDiscountPaise: number; // paise
  /** Pro-rata share of the invoice-level discount, pushed down before tax. */
  allocatedInvoiceDiscountPaise: number; // paise

  taxTreatment: TaxTreatment;
  /** The rate APPLIED, frozen at finalize. */
  gstRatePercent: number; // percentage
  taxableValuePaise: number; // paise
  cgstPaise: number; // paise
  sgstPaise: number; // paise
  igstPaise: number; // paise
  lineTotalPaise: number; // paise

  createdAt: Date;
}

/**
 * One payment leg (D-10). A split payment is two rows against one invoice; a
 * D-39 combined link is several rows sharing one `paymentGroupId`, one per
 * invoice the link settles.
 */
export interface Payment {
  id: string;
  clinicId: string;
  invoiceId: string;

  method: PaymentMethod;
  channel: PaymentChannel;

  amountPaise: number; // paise
  status: PaymentStatus;

  razorpayPaymentLinkId: string | null;
  razorpayPaymentId: string | null;
  shortUrl: string | null;
  /** Shared by every leg created from one combined multi-invoice link (D-39). */
  paymentGroupId: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  failureReason: string | null;
  recordedById: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/** D-13: a receipt is a document distinct from the invoice, one per payment. */
export interface PaymentReceipt {
  id: string;
  clinicId: string;
  paymentId: string;
  invoiceId: string;

  receiptNumber: string;
  amountPaise: number; // paise
  method: PaymentMethod;
  transactionRef: string | null;
  issuedAt: Date;

  createdAt: Date;
}

/**
 * A refund (D-12). `paymentId` names the specific leg being reversed, because
 * D-42 permits refunding only the cash portion, only the digital portion, or
 * both, independently. Null means a whole-invoice cash adjustment.
 */
export interface Refund {
  id: string;
  clinicId: string;
  invoiceId: string;
  paymentId: string | null;

  method: RefundMethod;
  amountPaise: number; // paise
  status: RefundStatus;

  razorpayRefundId: string | null;
  reason: string | null;
  processedAt: Date | null;
  failureReason: string | null;
  createdById: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * A credit note (D-19, D-22). Amounts are POSITIVE and reduce the referenced
 * invoice's balance by reference; this is not a negative-amount invoice. D-43:
 * revenue reporting attributes it to `issuedAt`'s month, never the original
 * invoice's month.
 */
export interface CreditNote {
  id: string;
  clinicId: string;
  invoiceId: string;

  creditNoteNumber: string;
  reason: CreditNoteReason;
  notes: string | null;

  subtotalPaise: number; // paise
  taxableValuePaise: number; // paise
  cgstPaise: number; // paise
  sgstPaise: number; // paise
  igstPaise: number; // paise
  /** Disclosure only, exactly as on {@link Invoice} — excluded from `totalPaise`. */
  roundOffPaise: number; // paise
  /** `taxableValuePaise + cgstPaise + sgstPaise + igstPaise`. */
  totalPaise: number; // paise

  issuedById: string;
  issuedAt: Date;

  createdAt: Date;
}

export interface CreditNoteLineItem {
  id: string;
  clinicId: string;
  creditNoteId: string;
  /** Null when crediting an amount that maps to no single original line. */
  invoiceLineItemId: string | null;

  description: string;
  hsnSacCode: string | null;
  quantity: number;

  taxTreatment: TaxTreatment;
  gstRatePercent: number; // percentage
  taxableValuePaise: number; // paise
  cgstPaise: number; // paise
  sgstPaise: number; // paise
  igstPaise: number; // paise
  totalPaise: number; // paise

  createdAt: Date;
}

/**
 * Gap-free per-clinic document numbering (D-15, D-19, D-38). There is no `id`
 * and no `updatedAt`: the composite key IS the upsert's conflict target.
 */
export interface InvoiceNumberCounter {
  clinicId: string;
  docType: DocumentNumberType;
  /** The reset scope key — an IST financial-year key such as `2026-27`. */
  period: string;
  lastNumber: number;
}

/**
 * Razorpay webhook inbox row (BIL-06). `rawPayload` is untrusted external input
 * persisted verbatim before it is trusted, so the HMAC can be re-verified and
 * the event replayed during an investigation. It is not display data.
 */
export interface WebhookEvent {
  id: string;
  clinicId: string;

  eventId: string;
  eventType: string;
  rawPayload: string;

  signatureVerified: boolean;
  receivedAt: Date;
  processedAt: Date | null;
  processingError: string | null;
}

/** Append-only financial audit trail (D-32), 6-year retention per Section 36. */
export interface BillingAuditLog {
  id: string;
  clinicId: string;
  userId: string | null;
  event: string;
  invoiceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;

  createdAt: Date;
}

/**
 * The D-29 billing settings subset of `Clinic`, as returned by
 * `GET /billing/settings` and accepted by the settings screen.
 *
 * SECURITY: the *Enc columns are never surfaced. GET /billing/settings returns
 * presence booleans only (D-29, ASVS V8). There is deliberately no field on
 * this interface, encrypted or otherwise, that could carry a Razorpay secret —
 * the omission is structural, so no serializer bug can leak one.
 */
export interface ClinicBillingSettings {
  clinicId: string;

  gstin: string | null;
  gstEnabled: boolean;
  stateCode: string | null;
  defaultGstRate: number | null; // percentage
  defaultDueDays: number;
  bankDetails: string | null;
  invoiceFooterText: string | null;

  /** Public key id — safe at rest and safe to display. */
  razorpayKeyId: string | null;
  hasRazorpayKeySecret: boolean;
  hasRazorpayWebhookSecret: boolean;
  /**
   * The unguessable path segment of this clinic's webhook URL. Razorpay sends
   * no tenant identifier, so this token IS the tenant routing key: treat it as
   * a capability. It is returned only to an authenticated Admin of this clinic,
   * solely so the settings screen can render the URL to paste into the Razorpay
   * dashboard, and must never be logged or included in an error body.
   */
  razorpayWebhookToken: string | null;
  razorpayTestMode: boolean;
  /**
   * The full URL an Admin pastes into their Razorpay dashboard, or `null` when
   * no webhook token exists yet. Built server-side from the public API base and
   * {@link ClinicBillingSettings.razorpayWebhookToken} so the mobile settings
   * screen never has to know the route shape.
   */
  webhookUrl: string | null;
  /**
   * Whether this clinic can actually receive payment confirmations: it needs
   * both a routing token and a webhook secret to verify signatures with.
   *
   * This is a health indicator, not a convenience. Without it, a clinic that
   * skipped the Razorpay dashboard step has BIL-06 silently broken — payments
   * complete at the gateway and the invoice never leaves Unpaid, with no error
   * anywhere for staff to act on.
   */
  webhookConfigured: boolean;
}

// ─── Composed response shapes ───────────────────────────────────────────────

/** The D-14 invoice header block, rendered by all three PDF templates. */
export interface ClinicInvoiceHeader {
  name: string;
  address: string;
  contactPhone: string;
  gstin: string | null;
  logoUrl: string | null;
  stateCode: string | null;
  gstEnabled: boolean;
  bankDetails: string | null;
  invoiceFooterText: string | null;
}

/** The pet identity shown on an invoice. Null when the invoice is a counter sale. */
export interface InvoicePetSummary {
  id: string;
  name: string;
  species: Species;
}

/** The owner identity shown on an invoice (D-44: a mobile number is optional). */
export interface InvoiceOwnerSummary {
  id: string;
  name: string;
  mobile: string;
}

/**
 * The full invoice payload consumed by the mobile InvoiceDetailScreen and by
 * all three PDF templates (invoice, receipt, credit note).
 */
export interface InvoiceDetail extends Invoice {
  lineItems: InvoiceLineItem[];
  payments: Payment[];
  refunds: Refund[];
  creditNotes: CreditNote[];
  pet: InvoicePetSummary | null;
  owner: InvoiceOwnerSummary | null;
  clinic: ClinicInvoiceHeader;
}

/** The narrow projection the billing dashboard list renders (D-24). */
export interface InvoiceListItem {
  id: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  grandTotalPaise: number; // paise
  balancePaise: number; // paise
  createdAt: Date;
  dueDate: Date | null;
  petName: string | null;
  ownerName: string | null;
  /** Drives the exception badge on the list card (D-35, D-36). */
  exceptionFlag: BillingExceptionFlag | null;
}

/** The five D-24 + D-33 summary cards at the top of the Billing tab. */
export interface BillingDashboardSummary {
  todayRevenuePaise: number; // paise
  unpaidTotalPaise: number; // paise
  overdueCount: number;
  recentPaymentsCount: number;
  /** RPT-01 (D-33): COUNT(DISTINCT petId) over today's finalized consultations, IST-bounded. */
  patientsSeenToday: number;
  /**
   * Invoices carrying an unresolved {@link Invoice.exceptionFlag} (D-35, D-36).
   *
   * Not one of the five cards. It is here because a flagged invoice **blocks
   * every further status-changing action on itself** and, until this field
   * existed, nothing in the product surfaced `exception_flag` at all — an
   * overpayment or a payment landing on a voided invoice would sit unresolved
   * and undiscoverable, with the only symptom being that staff could no longer
   * act on the invoice and could not see why. Zero is the normal value, so this
   * renders as a banner only when non-zero rather than as a sixth card.
   *
   * The exceptions *list* this count points at is not yet built; see
   * `06-12-SUMMARY.md` under Deferred Items.
   */
  billingExceptionCount: number;
}

/** A row in the billing exceptions list (D-35, D-36) awaiting staff resolution. */
export interface BillingExceptionListItem {
  invoiceId: string;
  invoiceNumber: string | null;
  exceptionFlag: BillingExceptionFlag;
  exceptionDetectedAt: Date | null;
  grandTotalPaise: number; // paise
  amountPaidPaise: number; // paise
  balancePaise: number; // paise
  petName: string | null;
  ownerName: string | null;
}

/**
 * The return shape of plan 06-05's `computeInvoiceTax`.
 *
 * The three tax heads are already rounded to whole rupees, once, at invoice
 * level (Section 170 / Rule 51).
 */
export interface TaxBreakdown {
  taxableValuePaise: number; // paise
  /** Rounded to a whole rupee at invoice level. */
  cgstPaise: number; // paise
  /** Rounded to a whole rupee at invoice level. */
  sgstPaise: number; // paise
  /** Rounded to a whole rupee at invoice level. */
  igstPaise: number; // paise
  /**
   * `Σ (rounded − exact)` across the three heads — a disclosure figure for
   * GSTR-1 reconciliation. Deliberately excluded from
   * {@link TaxBreakdown.grandTotalPaise}; adding it would double-count the
   * rounding already applied to the heads.
   */
  roundOffPaise: number; // paise
  /** `taxableValuePaise + cgstPaise + sgstPaise + igstPaise`. */
  grandTotalPaise: number; // paise
  documentType: InvoiceDocumentType;
}

/**
 * Per-item detail returned with the BIL-02 409 when finalize fails stock
 * validation. The mobile `StockValidationBanner` renders one row per entry.
 */
export interface StockShortfall {
  inventoryItemId: string;
  description: string;
  requested: number;
  available: number;
}
