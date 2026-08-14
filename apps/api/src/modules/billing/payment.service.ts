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

/** The `invoices` columns a payment decision is made from. */
interface LockedInvoiceRow {
  id: string;
  status: string;
  grand_total_paise: number;
  balance_paise: number;
  exception_flag: string | null;
  invoice_number: string | null;
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
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, clinicId, invoiceId);
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

  /**
   * Takes the invoice row under a `FOR UPDATE` lock.
   *
   * The lock is what makes the balance guard meaningful: without it, two
   * concurrent collections both read the same balance, both pass, and the
   * invoice ends up overpaid. Since hotfix 06-00b the lock is genuinely held to
   * commit on the tenant client.
   */
  private async lockInvoice(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
  ): Promise<LockedInvoiceRow> {
    const rows = await tx.$queryRaw<LockedInvoiceRow[]>(Prisma.sql`
      SELECT id, status, grand_total_paise, balance_paise, exception_flag, invoice_number
      FROM invoices
      WHERE id = ${invoiceId}::uuid
        AND clinic_id = ${clinicId}::uuid
      FOR UPDATE
    `);

    const row = rows[0];
    if (!row) throw invoiceNotFound(invoiceId);
    return row;
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

  /** Guards a locked row: exception flag, then state, then amount. */
  private assertCollectable(invoice: LockedInvoiceRow, amountPaise: number): void {
    this.assertPayable(invoice.status as InvoiceStatus, invoice.exception_flag);

    if (amountPaise <= 0) {
      throw domainError('A payment amount must be positive', 400, 'VALIDATION_ERROR');
    }

    if (amountPaise > invoice.balance_paise) {
      throw paymentExceedsBalance(amountPaise, invoice.balance_paise);
    }
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
   * frozen tax, so it is not yet a record of account against which anything can
   * be received. `VOIDED` fails too; a late payment on a voided invoice is
   * handled by the webhook's D-35 path, not by staff collecting at the counter.
   */
  private assertPayable(status: InvoiceStatus, exceptionFlag: string | null): void {
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
