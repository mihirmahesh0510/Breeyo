import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  RAZORPAY_MIN_AMOUNT_PAISE,
  isInvoiceActionBlocked,
  isValidInvoiceTransition,
} from '@breeyo/types';
import type { InvoiceStatus, PaymentMethod } from '@breeyo/types';
import type { TenantPrismaClient, TenantTransactionClient } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import { staleWriteConflictError } from '../../realtime/browser-sync.service.js';
import type { BillingActor } from './invoice.repository.js';
import { InvoiceRepository } from './invoice.repository.js';
import { nextDocumentNumber } from './numbering.service.js';
import {
  getRazorpayForClinic,
  normalizeRazorpayError,
  toRazorpayExpiry,
} from './razorpay.client.js';

/**
 * Payment collection: cash, split, and Razorpay Payment Links (BIL-03, BIL-05).
 *
 * ## The rule this file exists to enforce
 *
 * **No method here marks an invoice `PAID` on the strength of a Razorpay API
 * response.** A 200 from `paymentLink.create` means a link now exists; it says
 * nothing about whether anyone paid it. 06-RESEARCH.md lists "treating a
 * Razorpay API 200 as money received" as the phase's headline anti-pattern, and
 * it is the one that loses real money: an invoice marked settled for a link the
 * owner walked away from is revenue the clinic never chases.
 *
 * Exactly two things may move an invoice to `PAID`:
 *
 *   1. `recordCashPayment` — physical cash in hand, counted by staff.
 *   2. Plan 06-10's webhook worker — Razorpay's signed confirmation.
 *
 * And neither writes `'PAID'` as a literal. Both insert a `Payment` row and
 * call `InvoiceRepository.recomputePaymentState`, which DERIVES the status from
 * the rows inside the same transaction. There is no code path in this file that
 * assigns `invoice.status`. That is deliberate: a stored status that can be set
 * independently of the rows it summarises will eventually disagree with them.
 *
 * ## Credentials are not this file's business
 *
 * No decryption helper is imported here and no credential name appears in this
 * file. `razorpay.client.ts` owns the whole credential lifecycle and hands back
 * an already-configured client (T-06-49), which is what makes that containment
 * greppable rather than merely intended.
 *
 * ## QR codes are rendered on the device
 *
 * The client draws the QR from `shortUrl` with `react-native-qrcode-svg`. No
 * image is fetched from Razorpay and none is stored. Razorpay's own QR Codes
 * API is not called (activation-gated), and the UPI-intent flag on a payment
 * link is not set (live-mode only) — neither works with test keys, per
 * 06-RESEARCH `## Environment Availability`.
 */

// ─── Receipts (D-13) ────────────────────────────────────────────────────────

/**
 * Allocates a receipt number and writes the `PaymentReceipt`.
 *
 * A module-level function rather than a method because plan 06-10's webhook
 * worker issues receipts too, for digital captures Razorpay confirms, and it
 * has no `PaymentService` instance — it holds a transaction handle and a
 * settled `Payment` row. A second implementation over there is how the cash
 * receipt and the digital receipt would end up with different numbering, or
 * different columns populated, for the same event in the clinic's books.
 *
 * Uses the project's existing `invoice_number_counters` allocator with a third
 * `docType`, `RCT`, rather than inventing a second numbering mechanism.
 * `doc_type` is a free-text column whose primary key is
 * `(clinic_id, doc_type, period)`, so this needed no migration — see the note
 * on `DOCUMENT_NUMBER_TYPES` in `@breeyo/types`.
 *
 * `transactionRef` carries the gateway payment id for a digital payment and is
 * null for cash, which is the only honest value: there is no reference to quote
 * for notes handed across a counter.
 */
export async function issuePaymentReceipt(
  tx: TenantTransactionClient,
  clinicId: string,
  invoiceId: string,
  payment: { id: string; amountPaise: number; method: string; razorpayPaymentId?: string | null },
  now: Date,
) {
  const receiptNumber = await nextDocumentNumber(tx, clinicId, 'RCT', now);

  return tx.paymentReceipt.create({
    data: {
      clinicId,
      paymentId: payment.id,
      invoiceId,
      receiptNumber,
      amountPaise: payment.amountPaise,
      method: payment.method,
      transactionRef: payment.razorpayPaymentId ?? null,
      issuedAt: now,
    },
  });
}

// ─── Domain errors ──────────────────────────────────────────────────────────

type DomainError = Error & { statusCode: number; code: string };

function domainError(message: string, status: number, code: string): DomainError {
  const error = new Error(message) as DomainError;
  error.statusCode = status;
  error.code = code;
  return error;
}

const invoiceNotFound = (id: string) =>
  domainError(`Invoice ${id} not found`, 404, 'INVOICE_NOT_FOUND');

/**
 * D-36 is about the overpayment we cannot prevent — two legs racing to settle,
 * detected afterwards by `recomputePaymentState` and surfaced as a billing
 * exception. This error is about the overpayment we CAN prevent: staff typing a
 * figure larger than what is outstanding. Rejecting it here keeps the exception
 * list meaningful, because every entry on it is then a genuine race rather than
 * a typo someone could have caught at the counter.
 */
const paymentExceedsBalance = (amountPaise: number, balancePaise: number) =>
  domainError(
    `Payment of ${amountPaise} paise exceeds the outstanding balance of ${balancePaise} paise`,
    400,
    'PAYMENT_EXCEEDS_BALANCE',
  );

const amountBelowGatewayMinimum = (amountPaise: number) =>
  domainError(
    `A digital payment must be at least ${RAZORPAY_MIN_AMOUNT_PAISE} paise; ${amountPaise} was requested. Collect this amount in cash instead.`,
    400,
    'AMOUNT_BELOW_GATEWAY_MINIMUM',
  );

const invalidStateTransition = (from: string) =>
  domainError(
    `An invoice in state ${from} cannot receive a payment`,
    409,
    'INVALID_STATE_TRANSITION',
  );

const billingExceptionUnresolved = (flag: string) =>
  domainError(
    `This invoice is flagged for review (${flag}) and cannot accept further payments until staff resolve it`,
    409,
    'BILLING_EXCEPTION_UNRESOLVED',
  );

const noPendingPaymentLink = (invoiceId: string) =>
  domainError(
    `Invoice ${invoiceId} has no outstanding payment link to retry`,
    409,
    'NO_PENDING_PAYMENT_LINK',
  );

/**
 * D-27: an owner may settle several invoices at once, and that is the ONLY
 * grouping the product recognises. Two owners' invoices behind one link would
 * produce a single receipt trail for two separate accounts, and a refund on one
 * of them would have no unambiguous counterparty.
 *
 * An invoice with no owner (a D-44 walk-in) is rejected here for the same
 * reason rather than treated as "no owner, so it matches": two unattributed
 * counter sales are two different strangers, not one customer.
 */
const invoicesNotSameOwner = () =>
  domainError(
    'A combined payment link must cover invoices for one pet owner. Unattributed walk-in invoices cannot be combined.',
    400,
    'INVOICES_NOT_SAME_OWNER',
  );

/**
 * Distinct from `PAYMENT_EXCEEDS_BALANCE`: nothing was over-asked, the invoice
 * simply has nothing left to collect. `assertPayable` cannot catch this — it
 * treats `PAID -> PAID` as valid so that a replayed webhook is a no-op rather
 * than a 409 — but a request to open a NEW link for a settled invoice is not a
 * replay, it is staff about to hand an owner a QR code for zero rupees.
 */
const invoiceAlreadySettled = (reference: string) =>
  domainError(
    `Invoice ${reference} is already settled and has nothing left to collect`,
    409,
    'INVOICE_ALREADY_SETTLED',
  );

/**
 * The balance moved between reading it and writing the payment rows — cash
 * taken at the counter while the link was being minted, most likely. Raised
 * inside the transaction so the rows roll back and the caller cancels the link
 * at the gateway, rather than leaving a live link for a figure that is no
 * longer owed.
 */
const invoiceBalanceChanged = (reference: string) =>
  domainError(
    `Invoice ${reference} changed while the payment link was being created. Try again.`,
    409,
    'INVOICE_BALANCE_CHANGED',
  );

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface SplitPaymentInput {
  totalPaise: number;
  cashAmountPaise: number;
  digitalAmountPaise: number;
  digitalMethod: 'upi' | 'card';
}

export interface CreatePaymentLinkOptions {
  method?: 'upi' | 'card';
  amountPaise?: number;
  /**
   * D-39 groundwork. A combined multi-invoice link creates one `Payment` row
   * per covered invoice, all sharing this id — which is why plan 06-03 relaxed
   * the unique constraint to `(razorpayPaymentLinkId, invoiceId)` and added the
   * column. A single-invoice link is the degenerate group of one, so the column
   * is populated here rather than left null; that way D-39's implementation is
   * a loop over invoice ids with a shared group, not a data backfill.
   */
  paymentGroupId?: string;
}

/**
 * Everything the client is allowed to know about a created link.
 *
 * Deliberately NOT the Razorpay response. That object carries the merchant
 * account id, the full customer block and internal ids, none of which the
 * front desk needs and all of which would then sit in a mobile response cache.
 */
export interface PaymentLinkResult {
  paymentLinkId: string;
  shortUrl: string;
  expiresAt: Date;
  amountPaise: number;
}

/** Per-invoice overrides for a combined link (D-44 allows both to be absent). */
export interface CombinedPaymentLinkOptions {
  method?: 'upi' | 'card';
  customerName?: string;
  customerContact?: string;
}

/**
 * A combined link, plus the breakdown the payment sheet lists.
 *
 * `paymentGroupId` is returned because it, not the link id, is what ties the
 * settlement together: the webhook fans out across the group, and support
 * tracing "which invoices did this one payment cover" starts here.
 */
export interface CombinedPaymentLinkResult extends PaymentLinkResult {
  paymentGroupId: string;
  invoices: Array<{
    invoiceId: string;
    invoiceNumber: string | null;
    amountPaise: number;
  }>;
}

/** The `invoices` columns a combined-link decision is made from. */
interface CombinableInvoice {
  id: string;
  status: string;
  invoiceNumber: string | null;
  balancePaise: number;
  exceptionFlag: string | null;
  ownerId: string | null;
  owner: { name: string | null; mobile: string | null } | null;
  pet: { name: string | null } | null;
}

/** The `invoices` columns a payment decision is made from. */
export interface LockedInvoiceRow {
  id: string;
  status: string;
  grand_total_paise: number;
  balance_paise: number;
  exception_flag: string | null;
  invoice_number: string | null;
  updated_at: Date;
}

// ─── Shared collection guards ───────────────────────────────────────────────
//
// Module-level rather than private methods, for the same reason
// `issuePaymentReceipt` above is: a second consumer exists that holds no
// `PaymentService`. `InvoiceService.markPaid` is the D-10 mark-paid control, and
// it shipped without either of these — no lock and no bound — which is CR-04. A
// re-implementation over there is precisely how the two paths would end up
// enforcing different rules about the same money.

/**
 * Takes the invoice row under a `FOR UPDATE` lock.
 *
 * The lock is what makes the balance guard meaningful: without it, two
 * concurrent collections both read the same balance, both pass, and the invoice
 * ends up overpaid. Since hotfix 06-00b the lock is genuinely held to commit on
 * the tenant client.
 */
export async function lockInvoiceForPayment(
  tx: TenantTransactionClient,
  clinicId: string,
  invoiceId: string,
): Promise<LockedInvoiceRow> {
  const rows = await tx.$queryRaw<LockedInvoiceRow[]>(Prisma.sql`
    SELECT id, status, grand_total_paise, balance_paise, exception_flag, invoice_number, updated_at
    FROM invoices
    WHERE id = ${invoiceId}::uuid
      AND clinic_id = ${clinicId}::uuid
    FOR UPDATE
  `);

  const row = rows[0];
  if (!row) throw invoiceNotFound(invoiceId);
  return row;
}

/**
 * D-05: throws a 409 `STALE_WRITE_CONFLICT` when `expectedVersion` is
 * supplied and no longer matches the row's live `updated_at` -- called AFTER
 * the caller's own `FOR UPDATE` lock (`lockInvoiceForPayment`/`lockInvoice`)
 * so the check and the real mutation that follows it commit or roll back
 * together in the same transaction. A no-op when `expectedVersion` is
 * omitted -- every pre-Plan-10-05 caller is unaffected.
 */
export function assertLockedInvoiceVersionCurrent(invoice: LockedInvoiceRow, expectedVersion?: number): void {
  if (expectedVersion === undefined) return;
  if (invoice.updated_at.getTime() === expectedVersion) return;

  throw staleWriteConflictError({
    domain: 'billing',
    entityType: 'INVOICE',
    entityId: invoice.id,
    currentVersion: invoice.updated_at.getTime(),
    expectedVersion,
  });
}

/**
 * Whether an invoice in this state can receive money at all.
 *
 * Expressed through the shared transition table rather than a local list, so
 * D-20 has one definition. `FINALIZED` is the single special case: it is the
 * transient post-finalize state that the reducer normally resolves within the
 * finalize transaction itself, and its table row lists only `UNPAID` and
 * `VOIDED`. Money arriving in that window is still real money.
 *
 * `DRAFT` fails here, which is the point — a draft carries no number and no
 * frozen tax, so it is not yet a record of account against which anything can be
 * received. `VOIDED` fails too; a late payment on a voided invoice is handled by
 * the webhook's D-35 path, not by staff collecting at the counter.
 */
export function assertInvoicePayable(status: InvoiceStatus, exceptionFlag: string | null): void {
  if (isInvoiceActionBlocked(exceptionFlag)) {
    throw billingExceptionUnresolved(exceptionFlag as string);
  }

  if (status === 'FINALIZED') return;

  if (
    isValidInvoiceTransition(status, 'PAID') ||
    isValidInvoiceTransition(status, 'PARTIALLY_PAID')
  ) {
    return;
  }

  throw invalidStateTransition(status);
}

/** Guards a locked row: exception flag, then state, then amount. */
export function assertInvoiceCollectable(
  invoice: LockedInvoiceRow,
  amountPaise: number,
): void {
  assertInvoicePayable(invoice.status as InvoiceStatus, invoice.exception_flag);

  if (amountPaise <= 0) {
    throw domainError('A payment amount must be positive', 400, 'VALIDATION_ERROR');
  }

  if (amountPaise > invoice.balance_paise) {
    throw paymentExceedsBalance(amountPaise, invoice.balance_paise);
  }
}

// ─── Service ────────────────────────────────────────────────────────────────

export class PaymentService {
  constructor(
    // `TenantPrismaClient`, not `PrismaClient`: every read and write below is
    // clinic-scoped and must run through the RLS-bound per-request handle
    // (D-30). Since hotfix 06-00b, its interactive `$transaction` is genuinely
    // atomic — rollback rolls back and `FOR UPDATE` holds to commit — which is
    // what the balance guards here rely on.
    private readonly repository: InvoiceRepository,
    private readonly prisma: TenantPrismaClient,
  ) {}

  // ─── Cash (D-10) ──────────────────────────────────────────────────────────

  /**
   * Records physical cash and settles the invoice from the resulting rows.
   *
   * One of only two paths in the system that may reach `PAID`, and it earns
   * that by being the one where the money is already in the drawer.
   */
  async recordCashPayment(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    amountPaise?: number,
    expectedVersion?: number,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, clinicId, invoiceId);
      assertLockedInvoiceVersionCurrent(invoice, expectedVersion);
      const amount = amountPaise ?? invoice.balance_paise;

      this.assertCollectable(invoice, amount);

      return this.applyCashLeg(tx, clinicId, invoiceId, actor, amount, 'cash');
    });

    return {
      ...result,
      invoice: await this.repository.getInvoiceDetail(clinicId, invoiceId),
    };
  }

  // ─── Payment links (D-09, D-11, BIL-05) ───────────────────────────────────

  /**
   * Creates a Razorpay Payment Link for the outstanding balance.
   *
   * The invoice status is untouched. A pending `Payment` row is written so the
   * link is a durable, auditable fact on our side — plan 06-10's webhook finds
   * it by `(razorpayPaymentLinkId, invoiceId)` and settles it, and the expiry
   * sweep finds it by `(clinicId, status, expiresAt)`.
   */
  async createPaymentLink(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    options: CreatePaymentLinkOptions = {},
  ): Promise<PaymentLinkResult> {
    const invoice = await this.loadInvoiceForPayment(clinicId, invoiceId);
    const amountPaise = options.amountPaise ?? invoice.balancePaise;
    const method: PaymentMethod = options.method ?? 'upi';

    this.assertPayable(invoice.status as InvoiceStatus, invoice.exceptionFlag);

    if (amountPaise > invoice.balancePaise) {
      throw paymentExceedsBalance(amountPaise, invoice.balancePaise);
    }

    // Checked BEFORE the SDK call on purpose. Razorpay would reject this with a
    // 400 that we would then surface as a 502 "gateway error", which reads to
    // the front desk as an outage rather than "this is too small to collect
    // online — take it in cash".
    if (amountPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
      throw amountBelowGatewayMinimum(amountPaise);
    }

    const rzp = getRazorpayForClinic(await this.loadClinicRazorpayConfig(clinicId));
    const now = new Date();
    const expireBy = toRazorpayExpiry(now);

    let link;
    try {
      link = await rzp.paymentLink.create({
        amount: amountPaise,
        currency: 'INR',
        // The split is modelled as two `Payment` rows on our side, so the link
        // itself is all-or-nothing. A partially payable link would let an owner
        // pay ₹1 of a ₹500 leg and leave the reconciliation to us.
        accept_partial: false,
        description: this.linkDescription(invoice),
        // The bare UUID: 36 characters, inside Razorpay's 40-character cap. A
        // prefixed form ("breeyo-inv-<uuid>") does not fit.
        reference_id: invoiceId,
        customer: this.buildCustomer(invoice.owner),
        // Razorpay's own SMS/email delivery is off. D-16 routes owner delivery
        // through Phase 7's WhatsApp abstraction, and D-44 means there may be
        // no contact on file at all — the QR is shown on screen.
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: expireBy,
        // The webhook cross-checks these against `reference_id` before applying
        // a payment, so a replayed event for another clinic cannot land here.
        notes: { clinicId, invoiceId },
      });
    } catch (err) {
      normalizeRazorpayError(err);
    }

    const expiresAt = new Date(expireBy * 1000);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            clinicId,
            invoiceId,
            method,
            channel: 'razorpay',
            amountPaise,
            // Pending, not captured. This is the whole point (T-06-50).
            status: 'pending',
            razorpayPaymentLinkId: link.id,
            shortUrl: link.short_url,
            paymentGroupId: options.paymentGroupId ?? randomUUID(),
            expiresAt,
            recordedById: actor.userId,
          },
        });

        await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_LINK_CREATED, {
          clinicId,
          userId: actor.userId,
          invoiceId,
          // The link id and the amount, never the short url's token or any
          // credential. Audit rows outlive incidents.
          metadata: { razorpayPaymentLinkId: link.id, amountPaise, method, expireBy },
        });
      });
    } catch (err) {
      // T-06-53: the link is live at Razorpay but we failed to record it, so
      // nothing on our side would ever settle or expire it — an owner could pay
      // into a void. Cancel it. If the cancel also fails there is nothing
      // further to try, and the original failure is the one worth surfacing.
      await rzp.paymentLink.cancel(link.id).catch(() => undefined);
      throw err;
    }

    return {
      paymentLinkId: link.id,
      shortUrl: link.short_url,
      expiresAt,
      amountPaise,
    };
  }

  // ─── Combined multi-invoice links (D-27, D-39) ────────────────────────────

  /**
   * Opens ONE Razorpay link covering several of an owner's invoices.
   *
   * D-27 gives each consultation its own invoice, so a multi-pet owner leaving
   * the clinic on a Saturday morning may be holding three of them. This is the
   * path that lets the front desk show a single QR code for the lot.
   *
   * ## One link, several rows
   *
   * The link is one object at Razorpay; on our side it becomes one `Payment`
   * row per invoice, all carrying the same `paymentGroupId`. That shape is not
   * incidental — plan 06-03 relaxed the unique constraint to
   * `(razorpay_payment_link_id, invoice_id)` to permit it, and plan 06-10's
   * `resolveLegs` finds the group by that column and settles every invoice in
   * it from the single `payment_link.paid`. Writing one aggregate row against a
   * "primary" invoice instead would settle one invoice and silently strand the
   * rest, and no amount of correct webhook code could recover the association.
   *
   * ## What is checked, and why here
   *
   * Every guard below asks a question that has no single-invoice equivalent:
   * do these invoices belong to one owner, is each of them still payable, do
   * their balances still sum to what we are about to ask for. They run BEFORE
   * the SDK call so an invalid combination is a 400 or 409 naming the offending
   * invoice, not a 502 that reads to the front desk as a gateway outage.
   *
   * Nothing here marks anything `PAID`. As everywhere else in this file, that
   * remains the webhook's job (T-06-50).
   */
  async createCombinedPaymentLink(
    clinicId: string,
    invoiceIds: string[],
    actor: BillingActor,
    options: CombinedPaymentLinkOptions = {},
  ): Promise<CombinedPaymentLinkResult> {
    // A client that lists the same invoice twice means it once, not twice. The
    // alternative — billing it twice inside one link — is an overpayment we
    // would then have to refund by hand.
    const uniqueIds = [...new Set(invoiceIds)];

    if (uniqueIds.length === 0) {
      throw domainError(
        'A combined payment link needs at least one invoice',
        400,
        'VALIDATION_ERROR',
      );
    }

    const invoices = await this.loadInvoicesForCombinedPayment(clinicId, uniqueIds);

    this.assertOneOwner(invoices);
    for (const invoice of invoices) {
      this.assertCombinable(invoice);
    }

    const amountPaise = invoices.reduce((sum, invoice) => sum + invoice.balancePaise, 0);

    if (amountPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
      throw amountBelowGatewayMinimum(amountPaise);
    }

    const method: PaymentMethod = options.method ?? 'upi';
    const paymentGroupId = randomUUID();
    // Razorpay's `reference_id` is capped at 40 characters, which fits exactly
    // one bare UUID. The first invoice carries it so the webhook's
    // "does this reference resolve to an invoice in this clinic" check has
    // something to resolve; the group, not this field, is what settles the rest.
    const primary = invoices[0];

    const rzp = getRazorpayForClinic(await this.loadClinicRazorpayConfig(clinicId));
    const now = new Date();
    const expireBy = toRazorpayExpiry(now);

    let link;
    try {
      link = await rzp.paymentLink.create({
        amount: amountPaise,
        currency: 'INR',
        // Same reasoning as the single-invoice link, with more at stake: a
        // partial payment against a combined link would have to be allocated
        // across several owners' invoices by guesswork.
        accept_partial: false,
        description: this.combinedLinkDescription(invoices),
        reference_id: primary.id,
        customer: this.buildCustomer({
          name: options.customerName ?? primary.owner?.name ?? null,
          mobile: options.customerContact ?? primary.owner?.mobile ?? null,
        }),
        // D-16 / D-44, exactly as for a single-invoice link.
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: expireBy,
        // `paymentGroupId` rides along so a support question about one Razorpay
        // link can be answered from the gateway dashboard alone.
        notes: {
          clinicId,
          invoiceId: primary.id,
          paymentGroupId,
          invoiceCount: String(invoices.length),
        },
      });
    } catch (err) {
      normalizeRazorpayError(err);
    }

    const expiresAt = new Date(expireBy * 1000);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const invoice of invoices) {
          // Re-read under FOR UPDATE. The balances above were read before the
          // gateway round trip, and cash taken at the counter in that window
          // would leave this link collecting more than is owed. Bailing out
          // here rolls the rows back and cancels the link below, which is the
          // outcome that cannot overcharge anyone.
          const locked = await this.lockInvoice(tx, clinicId, invoice.id);
          if (locked.balance_paise !== invoice.balancePaise) {
            throw invoiceBalanceChanged(invoice.invoiceNumber ?? invoice.id);
          }

          await tx.payment.create({
            data: {
              clinicId,
              invoiceId: invoice.id,
              method,
              channel: 'razorpay',
              amountPaise: invoice.balancePaise,
              status: 'pending',
              razorpayPaymentLinkId: link.id,
              shortUrl: link.short_url,
              paymentGroupId,
              expiresAt,
              recordedById: actor.userId,
            },
          });

          await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_LINK_CREATED, {
            clinicId,
            userId: actor.userId,
            invoiceId: invoice.id,
            // Per invoice, not once for the group: an audit trail read from a
            // single invoice must show that this invoice was put behind a link,
            // and `paymentGroupId` is what leads back to its siblings.
            metadata: {
              razorpayPaymentLinkId: link.id,
              amountPaise: invoice.balancePaise,
              method,
              expireBy,
              paymentGroupId,
              combinedInvoiceCount: invoices.length,
            },
          });
        }
      });
    } catch (err) {
      // T-06-53, amplified: an uncancelled combined link is one an owner could
      // pay for several invoices none of which would ever settle.
      await rzp.paymentLink.cancel(link.id).catch(() => undefined);
      throw err;
    }

    return {
      paymentLinkId: link.id,
      shortUrl: link.short_url,
      expiresAt,
      amountPaise,
      paymentGroupId,
      invoices: invoices.map((invoice) => ({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountPaise: invoice.balancePaise,
      })),
    };
  }

  // ─── Split (D-10, D-37) ───────────────────────────────────────────────────

  /**
   * Cash now, link for the rest.
   *
   * The cash leg commits first and independently. That ordering is D-37: if the
   * digital leg later expires unpaid, the captured cash row is already durable,
   * so `recomputePaymentState` derives `PARTIALLY_PAID` and the invoice can
   * never fall back to fully `UNPAID` for money the clinic is holding.
   */
  async recordSplitPayment(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    input: SplitPaymentInput,
  ) {
    // Re-checked here rather than trusted from the controller's parse: the sum
    // rule is a money invariant, and `recordSplitPayment` is also reachable
    // from the split branch of the internal API.
    if (input.cashAmountPaise + input.digitalAmountPaise !== input.totalPaise) {
      throw domainError(
        'The cash and digital legs must sum to the declared total',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (input.digitalAmountPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
      throw amountBelowGatewayMinimum(input.digitalAmountPaise);
    }

    const cashLeg = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, clinicId, invoiceId);

      // Both legs are bounded by the balance together, before either is
      // written. Checking only the cash leg would let a split over-collect.
      this.assertCollectable(invoice, input.totalPaise);

      return this.applyCashLeg(
        tx,
        clinicId,
        invoiceId,
        actor,
        input.cashAmountPaise,
        'cash',
      );
    });

    const paymentLink = await this.createPaymentLink(clinicId, invoiceId, actor, {
      method: input.digitalMethod,
      amountPaise: input.digitalAmountPaise,
    });

    return {
      ...cashLeg,
      paymentLink,
      invoice: await this.repository.getInvoiceDetail(clinicId, invoiceId),
    };
  }

  // ─── D-11 fallbacks ───────────────────────────────────────────────────────

  /**
   * Regenerates a link after a failed or abandoned attempt (D-11 retry).
   *
   * The old link is cancelled at the gateway first. Leaving it live would mean
   * two payable links for one balance, and an owner who scanned the first QR
   * before staff hit retry could pay it — producing the D-36 overpayment the
   * clinic then has to refund by hand.
   */
  async retryPaymentLink(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
  ): Promise<PaymentLinkResult> {
    const pending = await this.prisma.payment.findFirst({
      where: { clinicId, invoiceId, channel: 'razorpay', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) throw noPendingPaymentLink(invoiceId);

    if (pending.razorpayPaymentLinkId) {
      const rzp = getRazorpayForClinic(await this.loadClinicRazorpayConfig(clinicId));
      try {
        await rzp.paymentLink.cancel(pending.razorpayPaymentLinkId);
      } catch (err) {
        // An already-expired or already-cancelled link is a fine state to
        // retry from — the goal (no second payable link) is already met. Any
        // other failure means the old link may still be live, and issuing a
        // second one would be the overpayment described above.
        if (!this.isAlreadyClosedLinkError(err)) normalizeRazorpayError(err);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        // Scoped to `pending` and `razorpay`. A captured row — cash, or a leg a
        // webhook settled in the meantime — is never touched (D-37).
        where: { clinicId, invoiceId, channel: 'razorpay', status: 'pending' },
        data: { status: 'cancelled', failureReason: 'Superseded by a retried payment link' },
      });

      // Cancelling pending rows does not change any captured sum, so this is
      // normally a no-op. It runs anyway because a webhook may have captured
      // the very link being retried between the read above and this write, and
      // the derivation is what surfaces that rather than silently ignoring it.
      await this.repository.recomputePaymentState(tx, clinicId, invoiceId);
    });

    return this.createPaymentLink(clinicId, invoiceId, actor, {
      method: (pending.method as 'upi' | 'card') ?? 'upi',
      amountPaise: pending.amountPaise,
      paymentGroupId: pending.paymentGroupId ?? undefined,
    });
  }

  /**
   * The D-11 manual fallback: give up on the digital attempt.
   *
   * **D-37 lives in the `where` clause below.** Only pending razorpay rows are
   * cancelled. A cash leg already collected as part of a split is captured and
   * stays captured, so the recomputation lands the invoice on `PARTIALLY_PAID`
   * — the transition table has no `PARTIALLY_PAID -> UNPAID` edge for exactly
   * this reason. Widening this filter to all payments for the invoice is the
   * bug that would erase money the clinic is holding.
   */
  async markPaymentUnpaid(clinicId: string, invoiceId: string, actor: BillingActor) {
    const pendingLinks = await this.prisma.payment.findMany({
      where: {
        clinicId,
        invoiceId,
        channel: 'razorpay',
        status: 'pending',
        razorpayPaymentLinkId: { not: null },
      },
      select: { id: true, razorpayPaymentLinkId: true },
    });

    if (pendingLinks.length > 0) {
      const rzp = getRazorpayForClinic(await this.loadClinicRazorpayConfig(clinicId));

      for (const pending of pendingLinks) {
        if (!pending.razorpayPaymentLinkId) continue;
        try {
          await rzp.paymentLink.cancel(pending.razorpayPaymentLinkId);
        } catch (err) {
          if (!this.isAlreadyClosedLinkError(err)) normalizeRazorpayError(err);
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { clinicId, invoiceId, channel: 'razorpay', status: 'pending' },
        data: { status: 'cancelled', failureReason: 'Marked unpaid by staff' },
      });

      await this.repository.recomputePaymentState(tx, clinicId, invoiceId);

      await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_RECORDED, {
        clinicId,
        userId: actor.userId,
        invoiceId,
        metadata: { markedUnpaid: true, cancelledLinks: pendingLinks.length },
      });
    });

    return this.repository.getInvoiceDetail(clinicId, invoiceId);
  }

  // ─── Receipts (D-13) ──────────────────────────────────────────────────────

  /** The D-13 "View Receipt" read, clinic-scoped so another clinic's id 404s. */
  async getReceipt(clinicId: string, invoiceId: string, receiptId: string) {
    const receipt = await this.prisma.paymentReceipt.findFirst({
      where: { id: receiptId, clinicId, invoiceId },
    });

    if (!receipt) {
      throw domainError(`Receipt ${receiptId} not found`, 404, 'RECEIPT_NOT_FOUND');
    }

    return receipt;
  }

  /**
   * Owner-portal read (finding 9.3 — D-71 "receipt access before navigating
   * elsewhere" had no backing endpoint). Unlike `getReceipt`, the caller has
   * no `receiptId` to present (the owner-portal contract never exposed one),
   * so this finds the most recently issued receipt for the invoice instead.
   * Returns `null` rather than throwing when none exists yet — an unpaid
   * invoice having no receipt is an expected state for
   * `portal-receipt.service.ts` to map to its own NOT_FOUND, not this
   * method's job to treat as exceptional.
   */
  async getLatestReceiptForInvoice(clinicId: string, invoiceId: string) {
    return this.prisma.paymentReceipt.findFirst({
      where: { clinicId, invoiceId },
      orderBy: { issuedAt: 'desc' },
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Inserts the captured payment, derives the invoice status and issues the
   * receipt — all on the caller's transaction handle.
   *
   * Shared by `recordCashPayment` and the cash leg of `recordSplitPayment` so
   * there is exactly one place that turns cash into rows.
   */
  private async applyCashLeg(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    amountPaise: number,
    method: PaymentMethod,
  ) {
    const now = new Date();

    const payment = await tx.payment.create({
      data: {
        clinicId,
        invoiceId,
        method,
        channel: 'manual',
        amountPaise,
        status: 'captured',
        paidAt: now,
        recordedById: actor.userId,
      },
    });

    // Inside the transaction, on the same handle as the insert. The status is
    // derived from the rows, never assigned from a branch up here.
    await this.repository.recomputePaymentState(tx, clinicId, invoiceId);

    const receipt = await this.generateReceipt(tx, clinicId, invoiceId, payment, now);

    await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_RECORDED, {
      clinicId,
      userId: actor.userId,
      invoiceId,
      metadata: {
        method,
        channel: 'manual',
        amountPaise,
        paymentId: payment.id,
        receiptNumber: receipt.receiptNumber,
      },
    });

    return { paymentId: payment.id, receiptId: receipt.id, receiptNumber: receipt.receiptNumber };
  }

  /** Delegates to {@link issuePaymentReceipt}; see the note there (D-13). */
  private async generateReceipt(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
    payment: { id: string; amountPaise: number; method: string; razorpayPaymentId?: string | null },
    now: Date,
  ) {
    return issuePaymentReceipt(tx, clinicId, invoiceId, payment, now);
  }

  /** Delegates to {@link lockInvoiceForPayment}; see the note there. */
  private async lockInvoice(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
  ): Promise<LockedInvoiceRow> {
    return lockInvoiceForPayment(tx, clinicId, invoiceId);
  }

  private async loadInvoiceForPayment(clinicId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clinicId },
      select: {
        id: true,
        status: true,
        invoiceNumber: true,
        grandTotalPaise: true,
        balancePaise: true,
        exceptionFlag: true,
        owner: { select: { id: true, name: true, mobile: true } },
        pet: { select: { id: true, name: true } },
      },
    });

    if (!invoice) throw invoiceNotFound(invoiceId);
    return invoice;
  }

  /**
   * Loads every invoice in a combined request, in the order asked for.
   *
   * The order is preserved deliberately: the first invoice supplies the
   * gateway's `reference_id` and the customer block, so "which one is primary"
   * is the caller's stated first choice rather than whatever the database
   * happened to return.
   *
   * A single query scoped to the clinic, then a per-id presence check. An id
   * belonging to another clinic is indistinguishable from one that does not
   * exist, which is the point — a 403 here would confirm the invoice is real.
   */
  private async loadInvoicesForCombinedPayment(
    clinicId: string,
    invoiceIds: string[],
  ): Promise<CombinableInvoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, clinicId },
      select: {
        id: true,
        status: true,
        invoiceNumber: true,
        balancePaise: true,
        exceptionFlag: true,
        ownerId: true,
        owner: { select: { name: true, mobile: true } },
        pet: { select: { name: true } },
      },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));

    return invoiceIds.map((id) => {
      const row = byId.get(id);
      if (!row) throw invoiceNotFound(id);
      return row;
    });
  }

  /**
   * D-27: a combined link settles ONE owner's invoices.
   *
   * A lone invoice is exempt — that is the degenerate group of one, and D-44
   * explicitly allows a walk-in with no owner record to be handed a QR code.
   * The moment there are two, an owner is required on each and they must match,
   * because `null === null` is not "the same person".
   */
  private assertOneOwner(invoices: CombinableInvoice[]): void {
    if (invoices.length < 2) return;

    const [first, ...rest] = invoices;
    if (first.ownerId == null) throw invoicesNotSameOwner();
    if (rest.some((invoice) => invoice.ownerId !== first.ownerId)) {
      throw invoicesNotSameOwner();
    }
  }

  /**
   * Whether one invoice may join a combined link.
   *
   * Delegates the state question to {@link assertPayable} rather than restating
   * it, so D-20 keeps a single definition, and re-raises the failure with the
   * invoice named — with three invoices selected, "an invoice in state VOIDED
   * cannot receive a payment" is not an actionable message on its own.
   */
  private assertCombinable(invoice: CombinableInvoice): void {
    const reference = invoice.invoiceNumber ?? invoice.id;

    try {
      this.assertPayable(invoice.status as InvoiceStatus, invoice.exceptionFlag);
    } catch (err) {
      const domain = err as DomainError;
      throw domainError(`Invoice ${reference}: ${domain.message}`, domain.statusCode, domain.code);
    }

    if (invoice.balancePaise <= 0) {
      throw invoiceAlreadySettled(reference);
    }
  }

  /**
   * Razorpay caps `description` at 2048 characters, and an owner scanning the
   * QR sees this text — so it names the invoices being settled rather than the
   * pets, which may repeat across a multi-pet visit.
   */
  private combinedLinkDescription(invoices: CombinableInvoice[]): string {
    if (invoices.length === 1) {
      return this.linkDescription(invoices[0]);
    }

    const numbers = invoices.map((invoice) => invoice.invoiceNumber ?? 'Invoice').join(', ');
    return `${invoices.length} invoices — ${numbers}`.slice(0, 2048);
  }

  /**
   * The `Clinic` columns `getRazorpayForClinic` needs, and no others.
   *
   * `razorpayWebhookSecretEnc` is deliberately absent from the SELECT: the
   * outbound payment path has no use for it, and a value not read cannot leak.
   */
  private async loadClinicRazorpayConfig(clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId },
      select: {
        id: true,
        razorpayKeyId: true,
        razorpayKeySecretEnc: true,
        razorpayTestMode: true,
      },
    });

    if (!clinic) throw invoiceNotFound(clinicId);
    return clinic;
  }

  /** Delegates to {@link assertInvoiceCollectable}; see the note there. */
  private assertCollectable(invoice: LockedInvoiceRow, amountPaise: number): void {
    assertInvoiceCollectable(invoice, amountPaise);
  }

  /** Delegates to {@link assertInvoicePayable}; see the note there. */
  private assertPayable(status: InvoiceStatus, exceptionFlag: string | null): void {
    assertInvoicePayable(status, exceptionFlag);
  }

  /**
   * D-44: a walk-in sale may have no owner record and no phone number.
   *
   * Razorpay's `customer` object is required but each of its fields is
   * optional, so an empty object is a valid request. Building
   * `{ contact: owner.mobile }` unconditionally would put `undefined` — or
   * throw on a null owner — and block the counter sale the QR flow exists for.
   * A contact matters only for remote delivery, which is off (`notify` is all
   * false) and belongs to Phase 7.
   */
  private buildCustomer(owner: { name?: string | null; mobile?: string | null } | null) {
    const customer: { name?: string; contact?: string } = {};
    if (owner?.name) customer.name = owner.name;
    if (owner?.mobile) customer.contact = owner.mobile;
    return customer;
  }

  /** Razorpay caps `description` at 2048 characters. */
  private linkDescription(invoice: {
    invoiceNumber: string | null;
    pet?: { name: string | null } | null;
  }): string {
    const reference = invoice.invoiceNumber ?? 'Invoice';
    const pet = invoice.pet?.name;
    return (pet ? `${reference} — ${pet}` : reference).slice(0, 2048);
  }

  /**
   * A cancel that failed because the link was already expired, cancelled or
   * paid has achieved what the caller wanted. Anything else has not.
   */
  private isAlreadyClosedLinkError(err: unknown): boolean {
    const description = (
      (err as { error?: { description?: string } })?.error?.description ?? ''
    ).toLowerCase();

    return (
      description.includes('already been cancelled') ||
      description.includes('already cancelled') ||
      description.includes('expired') ||
      description.includes('already paid') ||
      description.includes('not in created state')
    );
  }
}
