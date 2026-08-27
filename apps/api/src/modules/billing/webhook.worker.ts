import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { SOCKET_EVENTS, isValidInvoiceTransition } from '@breeyo/types';
import type { InvoiceStatus } from '@breeyo/types';
import {
  createTenantClient,
  type TenantPrismaClient,
  type TenantTransactionClient,
} from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import { StockMovementService } from '../inventory/stock-movement.service.js';
import { InvoiceRepository } from './invoice.repository.js';
import { StockValidatorService } from './stock-validator.service.js';
import { issuePaymentReceipt } from './payment.service.js';
import { applyRefundGatewayOutcome } from './refund-gateway-outcome.js';
import { BILLING_WEBHOOK_QUEUE, type BillingWebhookJob } from './webhook.service.js';

/**
 * Applies verified Razorpay events to invoices (BIL-06).
 *
 * ## Why none of this runs in the HTTP handler
 *
 * Razorpay disables a webhook after 24 hours of responses that are non-2xx or
 * slower than five seconds. Settling an invoice means a locked read, a payment
 * update, a status derivation, a receipt allocation and an audit write — under
 * contention that is not reliably a sub-five-second operation, and the price of
 * being wrong is BIL-06 silently ending for that clinic. So the endpoint stores
 * the event and answers; this file does the work, with BullMQ's three attempts
 * behind it and the `webhook_events` row as the durable record either way.
 *
 * ## The four delivery properties this file is written against
 *
 * - **Duplicate delivery.** Documented Razorpay behaviour. The endpoint dedupes
 *   on `event_id`, and this file dedupes again on `processedAt` so a second
 *   BullMQ attempt on a committed event does nothing.
 * - **Out-of-order delivery.** `payment_link.paid` can arrive before
 *   `payment.captured`. Re-applying `PAID` to a `PAID` invoice is a no-op, not
 *   an error — see `IDEMPOTENT_STATUSES` in `@breeyo/types`.
 * - **Events we will never handle.** An unrecognised type is stamped processed
 *   with a note. Throwing would buy three BullMQ retries of the same refusal.
 * - **Events that are genuinely wrong.** A verified event whose invoice belongs
 *   to another clinic is recorded as a `processingError` and NOT applied
 *   (T-06-64). It would otherwise be a cross-tenant write authorised by a
 *   signature that was itself valid.
 *
 * ## Status is never assigned here
 *
 * Every money mutation ends in `InvoiceRepository.recomputePaymentState`, which
 * DERIVES status, `amountPaidPaise` and `balancePaise` from the rows inside the
 * same transaction. That is also where D-35 (payment after void) and D-36
 * (overpayment) are detected — neither is a branch this file could take
 * correctly on its own, because both are properties of the row set rather than
 * of the event that happened to arrive last.
 *
 * ## Pushes are room-scoped, always
 *
 * `io.to('clinic:<id>').emit(...)`, never a global broadcast. `midnight-archive.ts`
 * broadcasts globally, but its payload is a content-free "refresh your queue"
 * nudge. An invoice update carries one clinic's financial position, and a global
 * broadcast would put it on every connected socket in the deployment (T-06-63).
 */

// ─── Event types ────────────────────────────────────────────────────────────

const EVENT_PAYMENT_LINK_PAID = 'payment_link.paid';
const EVENT_PAYMENT_LINK_PARTIALLY_PAID = 'payment_link.partially_paid';
const EVENT_PAYMENT_LINK_EXPIRED = 'payment_link.expired';
const EVENT_PAYMENT_LINK_CANCELLED = 'payment_link.cancelled';
const EVENT_REFUND_PROCESSED = 'refund.processed';
const EVENT_REFUND_FAILED = 'refund.failed';

// ─── Shapes of the (verified, but still external) payload ───────────────────

interface RazorpayPaymentLinkEntity {
  id?: unknown;
  reference_id?: unknown;
  amount?: unknown;
  amount_paid?: unknown;
  notes?: Record<string, unknown>;
}

interface RazorpayRefundEntity {
  id?: unknown;
  amount?: unknown;
  error_description?: unknown;
  notes?: Record<string, unknown>;
}

interface RazorpayEvent {
  event?: unknown;
  payload?: {
    payment_link?: { entity?: RazorpayPaymentLinkEntity };
    payment?: { entity?: { id?: unknown; method?: unknown } };
    refund?: { entity?: RazorpayRefundEntity };
  };
}

/** One invoice the worker touched, as the Socket.IO push needs it. */
interface InvoiceTouch {
  invoiceId: string;
  status: string;
  balancePaise: number;
  exceptionFlag: string | null;
  captured?: { amountPaise: number; method: string };
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;

// ─── Worker ─────────────────────────────────────────────────────────────────

/**
 * Constructs the BullMQ consumer. The job body is
 * {@link applyWebhookEvent}, exported separately so the integration suite can
 * drive it directly — the worker itself is never started under
 * `NODE_ENV=test`, and a test that could not apply an event would only ever
 * cover the acknowledgement half of BIL-06.
 */
export function createBillingWebhookWorker(
  redis: Redis,
  prisma: PrismaClient,
  io: Server | null,
): Worker<BillingWebhookJob> {
  return new Worker<BillingWebhookJob>(
    BILLING_WEBHOOK_QUEUE,
    async (job: Job<BillingWebhookJob>) => {
      await applyWebhookEvent(prisma, io, job.data.webhookEventId);
    },
    { connection: redis, concurrency: 5 },
  );
}

/**
 * Applies one stored webhook event.
 *
 * `prisma` is the admin client, and only because the `webhook_events` row must
 * be found by id BEFORE its clinic is known — that lookup is by definition not
 * scoped to a tenant. Everything after it runs on a tenant handle bound to the
 * clinic on the row (D-30 exemption).
 */
export async function applyWebhookEvent(
  prisma: PrismaClient,
  io: Server | null,
  webhookEventId: string,
): Promise<void> {
  const row = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!row) return;

  // A second BullMQ attempt on an event that already committed. Returning here
  // is what makes `attempts: 3` safe against money.
  if (row.processedAt) return;

  const db = createTenantClient(row.clinicId);

  let event: RazorpayEvent;
  try {
    event = JSON.parse(row.rawPayload) as RazorpayEvent;
  } catch {
    await refuse(db, webhookEventId, 'payload is not valid JSON');
    return;
  }

  const eventType = asString(event.event) ?? row.eventType;

  try {
    const touched = await dispatch(db, row.clinicId, webhookEventId, eventType, event);
    if (touched) push(io, row.clinicId, touched);
  } catch (err) {
    // Leaves `processedAt` null on purpose: the row stays reprocessable and
    // BullMQ's remaining attempts apply. The note is best-effort — if the
    // database itself is what failed, there is nowhere to write it.
    const message = err instanceof Error ? err.message : 'unknown worker failure';
    await db.webhookEvent
      .update({ where: { id: webhookEventId }, data: { processingError: message.slice(0, 500) } })
      .catch(() => undefined);
    throw err;
  }
}

async function dispatch(
  db: TenantPrismaClient,
  clinicId: string,
  webhookEventId: string,
  eventType: string,
  event: RazorpayEvent,
): Promise<InvoiceTouch[] | null> {
  switch (eventType) {
    case EVENT_PAYMENT_LINK_PAID:
    case EVENT_PAYMENT_LINK_PARTIALLY_PAID:
      return applyCapture(db, clinicId, webhookEventId, event);

    case EVENT_PAYMENT_LINK_EXPIRED:
      return applyLinkTermination(db, clinicId, webhookEventId, event, 'expired');

    case EVENT_PAYMENT_LINK_CANCELLED:
      return applyLinkTermination(db, clinicId, webhookEventId, event, 'cancelled');

    case EVENT_REFUND_PROCESSED:
      return applyRefundOutcome(db, clinicId, webhookEventId, event, 'processed');

    case EVENT_REFUND_FAILED:
      return applyRefundOutcome(db, clinicId, webhookEventId, event, 'failed');

    default:
      // Stamped processed, not thrown: Razorpay sends events we did not
      // subscribe to and will never act on, and three retries of a refusal is
      // three retries we pay for and learn nothing from.
      await refuse(db, webhookEventId, `unhandled event type ${eventType}`);
      return null;
  }
}

// ─── Capture (BIL-06, D-35, D-36, D-39) ─────────────────────────────────────

async function applyCapture(
  db: TenantPrismaClient,
  clinicId: string,
  webhookEventId: string,
  event: RazorpayEvent,
): Promise<InvoiceTouch[] | null> {
  const entity = event.payload?.payment_link?.entity;
  const paymentLinkId = asString(entity?.id);
  const referenceId = asString(entity?.reference_id);
  const amountPaid = asInt(entity?.amount_paid) ?? asInt(entity?.amount);
  const razorpayPaymentId = asString(event.payload?.payment?.entity?.id);

  if (!paymentLinkId || !referenceId || amountPaid == null || amountPaid <= 0) {
    await refuse(db, webhookEventId, 'payment_link entity is missing id, reference_id or amount');
    return null;
  }

  // T-06-64. The token verified and the signature verified, so this event is
  // authentically Razorpay's — but `notes.clinicId` and the referenced invoice
  // must ALSO be this clinic's, or applying it is a cross-tenant write.
  const notesClinicId = asString(entity?.notes?.clinicId);
  if (notesClinicId != null && notesClinicId !== clinicId) {
    await refuse(db, webhookEventId, 'event notes name a different clinic');
    return null;
  }

  const referenced = await db.invoice.findFirst({
    where: { id: referenceId, clinicId },
    select: { id: true },
  });
  if (!referenced) {
    await refuse(db, webhookEventId, 'reference_id does not resolve to an invoice in this clinic');
    return null;
  }

  const legs = await resolveLegs(db, clinicId, paymentLinkId);

  if (legs.length === 0) {
    // Everything for this link is already captured, or the link never existed
    // on our side. Either way there is nothing to settle and nothing is wrong.
    await refuse(db, webhookEventId, 'no outstanding payment row for this link');
    return null;
  }

  const now = new Date();
  const repository = buildRepository(db);

  return db.$transaction(async (tx) => {
    const touched: InvoiceTouch[] = [];
    let remaining = amountPaid;

    for (const leg of legs) {
      if (remaining <= 0) break;

      const invoice = await tx.invoice.findFirst({
        where: { id: leg.invoiceId, clinicId },
        select: { id: true, status: true },
      });
      if (!invoice) continue;

      if (!canReceiveCapture(invoice.status as InvoiceStatus)) {
        // A draft, for instance. Recorded rather than thrown: an invalid
        // transition never becomes valid, so retrying cannot help.
        continue;
      }

      // D-39: a combined link covers several invoices, each with its own row
      // and its own amount. A full settlement gives every leg its own figure; a
      // partial one is allocated in creation order, and a leg that receives
      // nothing stays pending.
      const capturedPaise = Math.min(remaining, leg.amountPaise);
      remaining -= capturedPaise;

      const payment = await tx.payment.update({
        where: { id: leg.id },
        data: {
          status: 'captured',
          // The row records money actually received, so a short settlement
          // rewrites the amount rather than overstating it.
          amountPaise: capturedPaise,
          razorpayPaymentId,
          paidAt: now,
        },
      });

      await repository.recomputePaymentState(tx, clinicId, leg.invoiceId);

      await issuePaymentReceipt(tx, clinicId, leg.invoiceId, payment, now);

      await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_RECORDED, {
        clinicId,
        invoiceId: leg.invoiceId,
        metadata: {
          channel: 'razorpay',
          method: payment.method,
          amountPaise: capturedPaise,
          razorpayPaymentLinkId: paymentLinkId,
          razorpayPaymentId,
          lateCapture: leg.wasOutstanding ? undefined : true,
        },
      });

      touched.push(
        await readTouch(tx, clinicId, leg.invoiceId, {
          amountPaise: capturedPaise,
          method: payment.method,
        }),
      );
    }

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: now, processingError: null },
    });

    return touched;
  });
}

/**
 * The `Payment` rows one link settles.
 *
 * Preference order matters. Normally these are the `pending` rows for the link,
 * expanded across the whole `paymentGroupId` so D-39's combined multi-invoice
 * link settles every invoice it covered from the single `payment_link.paid`.
 *
 * The fallback is the D-35 / D-11 reconciliation case: the link was cancelled
 * or expired on our side and the owner paid it anyway. Razorpay believes the
 * money moved, and it did. Recording it is the only honest option — the invoice
 * is then flagged by `recomputePaymentState`, not reopened.
 */
async function resolveLegs(
  db: TenantPrismaClient,
  clinicId: string,
  paymentLinkId: string,
): Promise<Array<{ id: string; invoiceId: string; amountPaise: number; wasOutstanding: boolean }>> {
  const forLink = await db.payment.findMany({
    where: { clinicId, channel: 'razorpay', razorpayPaymentLinkId: paymentLinkId },
    select: { id: true, invoiceId: true, amountPaise: true, status: true, paymentGroupId: true },
    orderBy: { createdAt: 'asc' },
  });

  const groupIds = [
    ...new Set(forLink.map((row) => row.paymentGroupId).filter((id): id is string => id != null)),
  ];

  if (groupIds.length > 0) {
    const group = await db.payment.findMany({
      where: {
        clinicId,
        channel: 'razorpay',
        status: 'pending',
        paymentGroupId: { in: groupIds },
      },
      select: { id: true, invoiceId: true, amountPaise: true },
      orderBy: { createdAt: 'asc' },
    });
    if (group.length > 0) {
      return group.map((row) => ({ ...row, wasOutstanding: true }));
    }
  }

  const pending = forLink.filter((row) => row.status === 'pending');
  if (pending.length > 0) {
    return pending.map((row) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      amountPaise: row.amountPaise,
      wasOutstanding: true,
    }));
  }

  const closed = forLink.filter((row) => row.status === 'cancelled' || row.status === 'expired');
  return closed.map((row) => ({
    id: row.id,
    invoiceId: row.invoiceId,
    amountPaise: row.amountPaise,
    wasOutstanding: false,
  }));
}

/**
 * Whether an invoice in this state can have money recorded against it.
 *
 * `VOIDED` deliberately returns true. D-35 is explicit: a late payment on a
 * voided invoice is recorded and surfaced as a billing exception for manual
 * refund — it is not dropped, and the invoice is not reopened.
 * `recomputePaymentState` is what enforces the second half of that.
 */
function canReceiveCapture(status: InvoiceStatus): boolean {
  if (status === 'VOIDED' || status === 'FINALIZED') return true;
  return (
    isValidInvoiceTransition(status, 'PAID') || isValidInvoiceTransition(status, 'PARTIALLY_PAID')
  );
}

// ─── Expiry and cancellation (D-11, D-37) ───────────────────────────────────

async function applyLinkTermination(
  db: TenantPrismaClient,
  clinicId: string,
  webhookEventId: string,
  event: RazorpayEvent,
  outcome: 'expired' | 'cancelled',
): Promise<InvoiceTouch[] | null> {
  const entity = event.payload?.payment_link?.entity;
  const paymentLinkId = asString(entity?.id);

  if (!paymentLinkId) {
    await refuse(db, webhookEventId, 'payment_link entity is missing id');
    return null;
  }

  const notesClinicId = asString(entity?.notes?.clinicId);
  if (notesClinicId != null && notesClinicId !== clinicId) {
    await refuse(db, webhookEventId, 'event notes name a different clinic');
    return null;
  }

  // D-37 lives in this filter. Only `pending` `razorpay` rows terminate; a cash
  // leg already collected as part of a split is captured and stays captured, so
  // the derivation lands on PARTIALLY_PAID rather than erasing money the clinic
  // is holding.
  const pending = await db.payment.findMany({
    where: { clinicId, channel: 'razorpay', status: 'pending', razorpayPaymentLinkId: paymentLinkId },
    select: { id: true, invoiceId: true },
  });

  if (pending.length === 0) {
    await refuse(db, webhookEventId, 'no pending payment row for this link');
    return null;
  }

  const now = new Date();
  const repository = buildRepository(db);

  return db.$transaction(async (tx) => {
    const touched: InvoiceTouch[] = [];

    await tx.payment.updateMany({
      where: { id: { in: pending.map((row) => row.id) } },
      data: {
        status: outcome,
        failureReason:
          outcome === 'expired'
            ? 'Payment link expired at the gateway'
            : 'Payment link cancelled at the gateway',
      },
    });

    for (const invoiceId of [...new Set(pending.map((row) => row.invoiceId))]) {
      await repository.recomputePaymentState(tx, clinicId, invoiceId);

      await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_LINK_EXPIRED, {
        clinicId,
        invoiceId,
        metadata: { razorpayPaymentLinkId: paymentLinkId, outcome },
      });

      touched.push(await readTouch(tx, clinicId, invoiceId));
    }

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: now, processingError: null },
    });

    return touched;
  });
}

// ─── Refunds (D-12, D-42) ───────────────────────────────────────────────────

async function applyRefundOutcome(
  db: TenantPrismaClient,
  clinicId: string,
  webhookEventId: string,
  event: RazorpayEvent,
  outcome: 'processed' | 'failed',
): Promise<InvoiceTouch[] | null> {
  const entity = event.payload?.refund?.entity;
  const razorpayRefundId = asString(entity?.id);

  if (!razorpayRefundId) {
    await refuse(db, webhookEventId, 'refund entity is missing id');
    return null;
  }

  const refund = await db.refund.findFirst({
    where: { clinicId, razorpayRefundId },
    select: { id: true, invoiceId: true, amountPaise: true, status: true },
  });

  if (!refund) {
    await refuse(db, webhookEventId, 'no refund row for this gateway refund id');
    return null;
  }

  const failureReason = asString(entity?.error_description) ?? 'The gateway reported a failure';

  // The transition itself — refund row, recomputed balance, audit log — is
  // shared with `refund-reconciliation.job.ts`'s poll-based fallback (WR-3)
  // via `applyRefundGatewayOutcome`, so a refund completed by either channel
  // ends up in an identical state. Only the webhook-specific bookkeeping
  // (marking THIS event processed) stays local to this file.
  return db.$transaction(async (tx) => {
    const touched = await applyRefundGatewayOutcome(
      db,
      tx,
      clinicId,
      refund,
      outcome,
      razorpayRefundId,
      failureReason,
    );

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: new Date(), processingError: null },
    });

    return [touched];
  });
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Marks the event dealt with, with the reason we did not apply it.
 *
 * `processedAt` IS stamped. That is the whole point: these are events we will
 * never successfully apply, so leaving them unprocessed would mean BullMQ
 * retrying them and an operator re-reading them forever.
 */
async function refuse(
  db: TenantPrismaClient,
  webhookEventId: string,
  reason: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: new Date(), processingError: reason.slice(0, 500) },
    });
  });
}

function buildRepository(db: TenantPrismaClient): InvoiceRepository {
  // `recomputePaymentState` does not touch stock, but the repository's
  // constructor takes the validator, so it is built and unused rather than
  // making the dependency optional and inviting a null at a call site that
  // does need it.
  return new InvoiceRepository(db, new StockValidatorService(db, new StockMovementService(db)));
}

async function readTouch(
  tx: TenantTransactionClient,
  clinicId: string,
  invoiceId: string,
  captured?: { amountPaise: number; method: string },
): Promise<InvoiceTouch> {
  const invoice = await tx.invoice.findFirstOrThrow({
    where: { id: invoiceId, clinicId },
    select: { status: true, balancePaise: true, exceptionFlag: true },
  });

  return {
    invoiceId,
    status: invoice.status,
    balancePaise: invoice.balancePaise,
    exceptionFlag: invoice.exceptionFlag,
    captured,
  };
}

/**
 * Pushes the outcome to the originating clinic's room, and only there.
 *
 * Null-guarded so the worker can be constructed — and the handler called from a
 * test — without a Socket.IO server, matching `queue.service.ts`.
 */
function push(io: Server | null, clinicId: string, touched: InvoiceTouch[]): void {
  if (!io || touched.length === 0) return;

  const room = io.to(`clinic:${clinicId}`);

  for (const touch of touched) {
    room.emit(SOCKET_EVENTS.INVOICE_UPDATED, {
      invoiceId: touch.invoiceId,
      status: touch.status,
      balancePaise: touch.balancePaise,
      exceptionFlag: touch.exceptionFlag,
    });

    if (touch.captured) {
      room.emit(SOCKET_EVENTS.PAYMENT_RECEIVED, {
        invoiceId: touch.invoiceId,
        amountPaise: touch.captured.amountPaise,
        method: touch.captured.method,
      });
    }
  }
}
