import { Prisma } from '@prisma/client';
import { makeRefundInputSchema } from '@breeyo/validators';
import type { RefundInput } from '@breeyo/validators';
import type { RefundMethod } from '@breeyo/types';
import type { TenantPrismaClient, TenantTransactionClient } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import type { BillingActor } from './invoice.repository.js';
import { InvoiceRepository } from './invoice.repository.js';
import { allocateProRata } from './money.js';
import { getRazorpayForClinic, normalizeRazorpayError } from './razorpay.client.js';

/**
 * Refunds (BIL-03, D-12, D-42) — money going back out of the clinic.
 *
 * ## A refund is not instant, and this file never pretends otherwise
 *
 * `razorpay.payments.refund` returning 200 means Razorpay ACCEPTED a refund
 * request. Settlement to the owner's card or bank takes 2-5 business days,
 * which is exactly what the UI-SPEC's "Digital refunds processed via Razorpay
 * (2-5 business days)" caption tells the front desk. So a digital leg is
 * inserted with `status: 'pending'` and is NEVER moved on here — only plan
 * 06-10's `refund.processed` webhook handler completes it, and `refund.failed`
 * fails it.
 *
 * Marking a digital refund `processed` on the API call succeeding is the exact
 * same class of error as treating a payment-link 200 as money received
 * (T-06-50, T-06-68): the record would assert a fact about the outside world
 * that nobody has confirmed. The one `status: 'processed'` literal below is on
 * the CASH path, where the fact is simply true — the notes are already back
 * across the counter.
 *
 * ## The bound is the only thing standing between a typo and a loss
 *
 *     refundable = Σ payments(captured) − Σ refunds(pending OR processed)
 *
 * Two details are load-bearing:
 *
 *  1. **Pending refunds are in the subtrahend.** A pending refund is money
 *     already promised to the owner. Counting only `processed` would let two
 *     concurrent partial refunds each pass a check against the same figure and
 *     together return more than was ever collected (T-06-67).
 *  2. **`balance_paise` is not consulted.** D-36 leaves the balance free to go
 *     negative on an overpayment, and an overpaid invoice is precisely the one
 *     that most needs refunding. A bound derived from the balance would either
 *     refuse that refund or, worse, permit an unbounded one. Captured payments
 *     are the physical quantity that limits what can be returned.
 *
 * The bound is evaluated on the transaction handle that holds a `FOR UPDATE`
 * lock on the invoice row, so concurrent refund requests for one invoice
 * serialise rather than racing. Since hotfix 06-00b the lock genuinely holds to
 * commit on the tenant client.
 *
 * ## Credentials are not this file's business
 *
 * No decryption helper is imported and no credential name appears here.
 * `razorpay.client.ts` owns the whole credential lifecycle (T-06-49).
 *
 * ## The invoice status is never assigned here
 *
 * D-20's transition table has no `REFUNDED` state, and this service contains no
 * `invoice.update`. `InvoiceRepository.recomputePaymentState` derives
 * `amountPaidPaise`, `balancePaise` and `status` from the rows inside the same
 * transaction. A refund is a row, not a status.
 */

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

const paymentNotFound = (id: string) =>
  domainError(
    `Payment ${id} is not a captured payment on this invoice`,
    404,
    'PAYMENT_NOT_FOUND',
  );

const refundExceedsPaid = (amountPaise: number, refundablePaise: number) =>
  domainError(
    `A refund of ${amountPaise} paise exceeds the ${refundablePaise} paise still refundable on this invoice`,
    400,
    'REFUND_EXCEEDS_PAID',
  );

/**
 * A payment link that was created but never captured has no gateway payment id,
 * so there is nothing at Razorpay to reverse. Distinct from the bound error
 * because the remedy is different: this one is not about the amount.
 */
const paymentNotRefundable = (id: string) =>
  domainError(
    `Payment ${id} has no captured gateway payment to refund against`,
    400,
    'PAYMENT_NOT_REFUNDABLE',
  );

const invalidStateTransition = (from: string) =>
  domainError(`An invoice in state ${from} cannot be refunded`, 409, 'INVALID_STATE_TRANSITION');

// ─── Shapes ─────────────────────────────────────────────────────────────────

/** One refund record as the mobile sheet renders it. */
export interface RefundLegResult {
  refundId: string;
  paymentId: string;
  /** `razorpay` or `cash` — the D-12 split-refund display keys off this. */
  method: RefundMethod;
  amountPaise: number;
  status: 'pending' | 'processed';
  razorpayRefundId: string | null;
  processedAt: Date | null;
}

export interface RefundResult {
  refunds: RefundLegResult[];
  totalRefundedPaise: number;
  invoice: Awaited<ReturnType<InvoiceRepository['getInvoiceDetail']>>;
}

/** What one captured payment can still return (D-42). */
export interface RefundableLeg {
  paymentId: string;
  method: string;
  channel: string;
  capturedPaise: number;
  refundedPaise: number;
  refundablePaise: number;
}

/** Powers the UI-SPEC's "Maximum: Rs [paid_amount]" caption and the leg picker. */
export interface RefundableSummary {
  refundablePaise: number;
  legs: RefundableLeg[];
}

/** The `invoices` columns a refund decision is made from. */
interface LockedInvoiceRow {
  id: string;
  status: string;
  grand_total_paise: number;
  balance_paise: number;
  exception_flag: string | null;
  invoice_number: string | null;
}

interface CapturedPaymentRow {
  id: string;
  method: string;
  channel: string;
  amountPaise: number;
  razorpayPaymentId: string | null;
}

interface RefundRow {
  id: string;
  paymentId: string | null;
  amountPaise: number;
  status: string;
}

/**
 * The refund statuses that reserve money.
 *
 * Named once, at module scope, so the "pending counts too" rule is a single
 * fact rather than a filter someone can narrow at one call site and not the
 * other. See the header for why omitting `pending` is T-06-67.
 */
const RESERVING_REFUND_STATUSES = ['pending', 'processed'] as const;

/** D-20 has no REFUNDED state; these two simply have nothing to refund. */
const NON_REFUNDABLE_INVOICE_STATES = new Set(['DRAFT', 'VOIDED']);

// ─── Service ────────────────────────────────────────────────────────────────

export class RefundService {
  constructor(
    // `TenantPrismaClient`, not `PrismaClient`: every read and write here is
    // clinic-scoped and must run through the RLS-bound per-request handle
    // (D-30).
    private readonly repository: InvoiceRepository,
    private readonly prisma: TenantPrismaClient,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  /**
   * What is still refundable on this invoice, in total and per leg.
   *
   * Read outside a transaction on purpose — this is the figure the sheet shows
   * before the user has decided anything. It is advisory: `createRefund`
   * recomputes it under the row lock, because between this read and that write
   * another member of staff may have refunded the same money.
   */
  async getRefundableSummary(clinicId: string, invoiceId: string): Promise<RefundableSummary> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clinicId },
      select: { id: true, status: true },
    });
    if (!invoice) throw invoiceNotFound(invoiceId);

    const [payments, refunds] = await Promise.all([
      this.prisma.payment.findMany({
        where: { clinicId, invoiceId, status: 'captured' },
        select: { id: true, method: true, channel: true, amountPaise: true, razorpayPaymentId: true },
      }),
      this.prisma.refund.findMany({
        where: { clinicId, invoiceId, status: { in: ['pending', 'processed'] } },
        select: { id: true, paymentId: true, amountPaise: true, status: true },
      }),
    ]);

    return this.summarise(payments as CapturedPaymentRow[], refunds as RefundRow[]);
  }

  /**
   * The bound, evaluated on the caller's LOCKED handle.
   *
   * `Σ captured − Σ (pending + processed) refunds`. Takes `tx` rather than
   * reaching for a client of its own precisely so it cannot be called outside
   * the lock that makes it meaningful.
   */
  async getRefundableAmount(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
  ): Promise<number> {
    const { legs, refunds } = await this.loadLegs(tx, clinicId, invoiceId);
    return this.summarise(legs, refunds).refundablePaise;
  }

  /** The invoice detail screen's refund history. */
  async listRefunds(clinicId: string, invoiceId: string) {
    return this.prisma.refund.findMany({
      where: { clinicId, invoiceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Write (D-12, D-42) ───────────────────────────────────────────────────

  /**
   * Issues one refund per affected payment leg.
   *
   * D-42: `input.paymentId` names a single leg, so staff can return just the
   * cash portion, just the digital portion, or both — matching however the
   * money was actually collected. With no `paymentId`, the amount is spread
   * across every leg that still has something to give, in proportion to what
   * each still has, using `allocateProRata` so the parts sum to exactly the
   * requested amount. `input.method` narrows to one settlement kind without
   * naming a specific row.
   */
  async createRefund(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    input: RefundInput,
  ): Promise<RefundResult> {
    const refunds = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, clinicId, invoiceId);

      if (NON_REFUNDABLE_INVOICE_STATES.has(invoice.status)) {
        throw invalidStateTransition(invoice.status);
      }

      const { legs, refunds: existing } = await this.loadLegs(tx, clinicId, invoiceId);
      const summary = this.summarise(legs, existing);

      // The cheap schema-level check first, so a client that sent an amount
      // larger than anything collected gets the same 400 whether or not a leg
      // filter would have narrowed it further. `makeRefundInputSchema` is the
      // same factory the mobile form uses, so the two agree by construction.
      const parsed = makeRefundInputSchema(summary.refundablePaise).safeParse(input);
      if (!parsed.success) {
        throw refundExceedsPaid(input.amountPaise, summary.refundablePaise);
      }

      const targets = this.selectLegs(summary.legs, legs, input);
      const availablePaise = targets.reduce((sum, leg) => sum + leg.refundablePaise, 0);

      // The authoritative bound. For a named leg or a method filter this is
      // narrower than the invoice-wide figure above: Razorpay cannot return
      // more than the leg it collected.
      if (input.amountPaise > availablePaise) {
        throw refundExceedsPaid(input.amountPaise, availablePaise);
      }

      const allocations = allocateProRata(
        input.amountPaise,
        targets.map((leg) => leg.refundablePaise),
      );

      const now = new Date();
      const created: RefundLegResult[] = [];

      for (const [index, leg] of targets.entries()) {
        const amountPaise = allocations[index];
        if (amountPaise <= 0) continue;

        const payment = legs.find((row) => row.id === leg.paymentId);
        if (!payment) throw paymentNotFound(leg.paymentId);

        created.push(
          payment.channel === 'razorpay'
            ? await this.refundDigitalLeg(tx, clinicId, invoiceId, actor, payment, amountPaise, input)
            : await this.refundCashLeg(tx, clinicId, invoiceId, actor, payment, amountPaise, now, input),
        );
      }

      // Derived from the rows, in the same transaction that wrote them. A
      // pending digital refund does not move the balance yet — the reducer
      // counts only `processed` refunds, which is the same asynchrony the
      // pending status records.
      await this.repository.recomputePaymentState(tx, clinicId, invoiceId);

      await writeBillingAuditLog(tx, BillingAuditEvent.REFUND_INITIATED, {
        clinicId,
        userId: actor.userId,
        invoiceId,
        metadata: {
          totalPaise: created.reduce((sum, refund) => sum + refund.amountPaise, 0),
          type: input.type,
          reason: input.reason ?? null,
          // Ids and amounts only. No gateway credential and no short url.
          legs: created.map((refund) => ({
            refundId: refund.refundId,
            paymentId: refund.paymentId,
            method: refund.method,
            amountPaise: refund.amountPaise,
            status: refund.status,
          })),
        },
      });

      return created;
    });

    return {
      refunds,
      totalRefundedPaise: refunds.reduce((sum, refund) => sum + refund.amountPaise, 0),
      invoice: await this.repository.getInvoiceDetail(clinicId, invoiceId),
    };
  }

  // ─── Legs ─────────────────────────────────────────────────────────────────

  /**
   * Cash back across the counter: settled the instant it is handed over.
   *
   * This is the ONLY place in the file that writes `status: 'processed'`, and
   * it earns that by being the one where nothing is in flight. A cash refund
   * has no gateway, no settlement window and nothing to confirm later.
   */
  private async refundCashLeg(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    payment: CapturedPaymentRow,
    amountPaise: number,
    now: Date,
    input: RefundInput,
  ): Promise<RefundLegResult> {
    const refund = await tx.refund.create({
      data: {
        clinicId,
        invoiceId,
        paymentId: payment.id,
        method: 'cash',
        amountPaise,
        status: 'processed',
        processedAt: now,
        reason: input.reason ?? null,
        createdById: actor.userId,
      },
    });

    return {
      refundId: refund.id,
      paymentId: payment.id,
      method: 'cash',
      amountPaise,
      status: 'processed',
      razorpayRefundId: null,
      processedAt: now,
    };
  }

  /**
   * A Razorpay refund: requested here, completed by the webhook.
   *
   * The row is written BEFORE the SDK call so that our id exists to send as
   * `receipt`. That gives the webhook a second way home: `refund.processed`
   * can be matched on `razorpayRefundId` normally, or on the receipt we chose
   * if the write-back below never landed.
   *
   * A rejection propagates out of the enclosing transaction, so the pending row
   * rolls back with it — we do not keep a record of a refund the gateway
   * refused.
   */
  private async refundDigitalLeg(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    payment: CapturedPaymentRow,
    amountPaise: number,
    input: RefundInput,
  ): Promise<RefundLegResult> {
    if (!payment.razorpayPaymentId) {
      throw paymentNotRefundable(payment.id);
    }

    const refund = await tx.refund.create({
      data: {
        clinicId,
        invoiceId,
        paymentId: payment.id,
        method: 'razorpay',
        amountPaise,
        // Pending, and it stays pending. See the file header (T-06-68).
        status: 'pending',
        reason: input.reason ?? null,
        createdById: actor.userId,
      },
    });

    const rzp = getRazorpayForClinic(await this.loadClinicRazorpayConfig(tx, clinicId));

    let gatewayRefund: { id: string };
    try {
      gatewayRefund = (await rzp.payments.refund(payment.razorpayPaymentId, {
        amount: amountPaise,
        // `optimum` costs the merchant an instant-refund fee and is not
        // available on every method; a vet clinic refund is not time-critical.
        speed: 'normal',
        notes: { clinicId, invoiceId, refundId: refund.id },
        receipt: refund.id,
      })) as { id: string };
    } catch (err) {
      normalizeRazorpayError(err);
    }

    // The gateway id ONLY. Writing a status here — even the `processed` the
    // SDK's own response carries — would assert a settlement nobody has
    // confirmed.
    await tx.refund.update({
      where: { id: refund.id },
      data: { razorpayRefundId: gatewayRefund.id },
    });

    return {
      refundId: refund.id,
      paymentId: payment.id,
      method: 'razorpay',
      amountPaise,
      status: 'pending',
      razorpayRefundId: gatewayRefund.id,
      processedAt: null,
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Which legs this request touches.
   *
   * `paymentId` wins (D-42's per-leg refund), then `method`, then everything
   * with something left to give. A named leg that is not a captured payment on
   * this invoice 404s rather than silently falling back to all legs — a client
   * that asked to refund one specific payment must not get a different one.
   */
  private selectLegs(
    legs: RefundableLeg[],
    payments: CapturedPaymentRow[],
    input: RefundInput,
  ): RefundableLeg[] {
    if (input.paymentId) {
      const named = legs.find((leg) => leg.paymentId === input.paymentId);
      if (!named) throw paymentNotFound(input.paymentId);
      return [named];
    }

    const withBalance = legs.filter((leg) => leg.refundablePaise > 0);

    if (input.method) {
      const wanted = input.method;
      const filtered = withBalance.filter((leg) => this.refundMethodFor(leg, payments) === wanted);
      if (filtered.length === 0) {
        throw refundExceedsPaid(input.amountPaise, 0);
      }
      return filtered;
    }

    if (withBalance.length === 0) {
      throw refundExceedsPaid(input.amountPaise, 0);
    }

    return withBalance;
  }

  /**
   * How a leg settles a refund.
   *
   * Keyed off `channel`, not `method`. A payment recorded through the D-10
   * manual attestation path carries `method: 'upi'` with `channel: 'manual'`
   * and has no gateway payment to reverse — it is refunded as a manual cash
   * adjustment, which is what actually happened.
   */
  private refundMethodFor(leg: RefundableLeg, payments: CapturedPaymentRow[]): RefundMethod {
    const payment = payments.find((row) => row.id === leg.paymentId);
    return payment?.channel === 'razorpay' ? 'razorpay' : 'cash';
  }

  /**
   * Folds captured payments and reserving refunds into the per-leg picture.
   *
   * A refund with a null `paymentId` — a whole-invoice adjustment, which the
   * schema permits — cannot be attributed to a leg, so it is subtracted from
   * the invoice-wide figure only. That keeps the total honest without
   * arbitrarily charging it to whichever leg happens to sort first.
   */
  private summarise(
    payments: CapturedPaymentRow[],
    refunds: RefundRow[],
  ): RefundableSummary {
    const byPayment = new Map<string, number>();
    let unattributedPaise = 0;

    for (const refund of refunds) {
      if (refund.paymentId) {
        byPayment.set(refund.paymentId, (byPayment.get(refund.paymentId) ?? 0) + refund.amountPaise);
      } else {
        unattributedPaise += refund.amountPaise;
      }
    }

    const legs: RefundableLeg[] = payments.map((payment) => {
      const refundedPaise = byPayment.get(payment.id) ?? 0;
      return {
        paymentId: payment.id,
        method: payment.method,
        channel: payment.channel,
        capturedPaise: payment.amountPaise,
        refundedPaise,
        refundablePaise: Math.max(0, payment.amountPaise - refundedPaise),
      };
    });

    const capturedPaise = payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
    const reservedPaise = refunds.reduce((sum, refund) => sum + refund.amountPaise, 0);

    // Σ captured − Σ (pending + processed) refunds. Clamped at zero only so a
    // historically over-refunded invoice reports "nothing left" rather than a
    // negative headline figure; the guards above still refuse the request.
    const refundablePaise = Math.max(0, capturedPaise - reservedPaise);

    // An unattributed adjustment has already been taken out of the invoice-wide
    // figure above. Take it off the per-leg budget too, cheapest leg first, so
    // the legs can never together offer more than the invoice as a whole.
    let outstanding = unattributedPaise;
    for (const leg of legs) {
      if (outstanding <= 0) break;
      const taken = Math.min(outstanding, leg.refundablePaise);
      leg.refundablePaise -= taken;
      leg.refundedPaise += taken;
      outstanding -= taken;
    }

    return { refundablePaise, legs };
  }

  private async loadLegs(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
  ): Promise<{ legs: CapturedPaymentRow[]; refunds: RefundRow[] }> {
    const [legs, refunds] = await Promise.all([
      tx.payment.findMany({
        where: { clinicId, invoiceId, status: 'captured' },
        select: { id: true, method: true, channel: true, amountPaise: true, razorpayPaymentId: true },
        orderBy: { createdAt: 'asc' },
      }),
      tx.refund.findMany({
        // `['pending', 'processed']` — a pending refund reserves its amount.
        // Narrowing this to `'processed'` is T-06-67.
        where: { clinicId, invoiceId, status: { in: [...RESERVING_REFUND_STATUSES] } },
        select: { id: true, paymentId: true, amountPaise: true, status: true },
      }),
    ]);

    return { legs: legs as CapturedPaymentRow[], refunds: refunds as RefundRow[] };
  }

  /**
   * Takes the invoice row under a `FOR UPDATE` lock.
   *
   * Without it, two concurrent refunds read the same refundable figure, both
   * pass, and the clinic returns more than it ever took.
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

  /**
   * The `Clinic` columns `getRazorpayForClinic` needs, and no others.
   *
   * `razorpayWebhookSecretEnc` is deliberately absent: the outbound refund path
   * has no use for it, and a value not read cannot leak.
   */
  private async loadClinicRazorpayConfig(tx: TenantTransactionClient, clinicId: string) {
    const clinic = await tx.clinic.findFirst({
      where: { id: clinicId },
      select: {
        id: true,
        razorpayKeyId: true,
        razorpayKeySecretEnc: true,
        razorpayTestMode: true,
      },
    });

    if (!clinic) throw domainError(`Clinic ${clinicId} not found`, 404, 'CLINIC_NOT_FOUND');
    return clinic;
  }
}
