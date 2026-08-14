import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { PAYMENT_LINK_TIMEOUT_MINUTES, SOCKET_EVENTS } from '@breeyo/types';
import { createTenantClient } from '../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../lib/billing-audit-log.js';
import { StockMovementService } from '../modules/inventory/stock-movement.service.js';
import { InvoiceRepository } from '../modules/billing/invoice.repository.js';
import { StockValidatorService } from '../modules/billing/stock-validator.service.js';
import {
  getRazorpayForClinic,
  type ClinicRazorpayConfig,
} from '../modules/billing/razorpay.client.js';

/**
 * Expires abandoned payment links server-side, every minute, in IST (D-11).
 *
 * ## Why a sweep exists at all
 *
 * The PaymentScreen shows a fifteen-minute countdown. That countdown is
 * decoration: the front desk backgrounds the app, the device sleeps, the
 * screen is closed the moment the owner walks off. D-11 promises that a pending
 * digital payment times out after fifteen minutes and the invoice reverts —
 * and a promise that only holds while a particular screen is open is not a
 * promise. This job is the authoritative deadline; the countdown merely agrees
 * with it.
 *
 * ## Fifteen minutes is measured from OUR clock, not Razorpay's
 *
 * `razorpay.client.ts` sends `expire_by = now + 16 minutes`, because Razorpay
 * rejects an `expire_by` under fifteen minutes away by the time the request
 * lands. So `payments.expires_at` is a minute LATER than the deadline D-11
 * actually states. The predicate below is therefore keyed on `createdAt`
 * against {@link PAYMENT_LINK_TIMEOUT_MINUTES}, with `expiresAt` as a secondary
 * condition so a row created with a shorter window is still caught. Razorpay's
 * own expiry is the backstop, never the primary deadline.
 *
 * ## D-37 lives in the WHERE clause
 *
 * Only `pending` `razorpay` rows are claimed. A cash leg already collected as
 * part of a split is `captured` and is not touched, so the derivation lands the
 * invoice on `PARTIALLY_PAID` rather than erasing money the clinic is holding.
 * Widening this filter to "all payments for the invoice" is the bug that would
 * make a clinic chase an owner for cash it already took.
 *
 * Admin client by design: a cron has no request context and the sweep spans
 * every clinic (D-30 exemption). Each clinic's writes then run on a tenant
 * handle bound to that clinic, so the actual mutations are RLS-scoped.
 */

/** Every minute. D-11's fifteen-minute promise is worth at most a minute of slop. */
const EXPIRY_CRON_EXPRESSION = '* * * * *';

interface ExpiringPayment {
  id: string;
  clinicId: string;
  invoiceId: string;
  razorpayPaymentLinkId: string | null;
}

/**
 * Expires every pending link past its deadline and returns how many changed.
 *
 * Exported separately from {@link scheduleExpirePaymentLinks} so the suite can
 * drive it directly rather than waiting on a schedule.
 */
export async function runPaymentLinkExpirySweep(
  prisma: PrismaClient,
  io: Server | null,
  now: Date = new Date(),
): Promise<number> {
  const deadline = new Date(now.getTime() - PAYMENT_LINK_TIMEOUT_MINUTES * 60_000);

  const expiring = await prisma.payment.findMany({
    where: {
      channel: 'razorpay',
      status: 'pending',
      OR: [{ createdAt: { lt: deadline } }, { expiresAt: { lt: now } }],
    },
    select: { id: true, clinicId: true, invoiceId: true, razorpayPaymentLinkId: true },
    orderBy: { createdAt: 'asc' },
  });

  if (expiring.length === 0) return 0;

  const byClinic = new Map<string, ExpiringPayment[]>();
  for (const payment of expiring) {
    byClinic.set(payment.clinicId, [...(byClinic.get(payment.clinicId) ?? []), payment]);
  }

  let expired = 0;

  for (const [clinicId, payments] of byClinic) {
    try {
      expired += await expireForClinic(prisma, io, clinicId, payments, now);
    } catch (error) {
      // One clinic's failure must not cost every other clinic its sweep. The
      // rows stay pending and the next run (a minute away) tries again.
      console.error(`Payment link expiry: clinic ${clinicId} failed`, error);
    }
  }

  return expired;
}

async function expireForClinic(
  prisma: PrismaClient,
  io: Server | null,
  clinicId: string,
  payments: ExpiringPayment[],
  now: Date,
): Promise<number> {
  await cancelAtGateway(prisma, clinicId, payments);

  const db = createTenantClient(clinicId);
  const repository = new InvoiceRepository(
    db,
    new StockValidatorService(db, new StockMovementService(db)),
  );

  const touched = await db.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      // Re-asserted inside the transaction, not carried over from the read: a
      // webhook may have captured one of these rows in the meantime, and a
      // captured payment must never be turned into an expired one.
      where: {
        id: { in: payments.map((payment) => payment.id) },
        clinicId,
        channel: 'razorpay',
        status: 'pending',
      },
      data: {
        status: 'expired',
        failureReason: `No payment received within ${PAYMENT_LINK_TIMEOUT_MINUTES} minutes`,
      },
    });

    if (count === 0) return [];

    const results: Array<{ invoiceId: string; status: string; balancePaise: number }> = [];

    for (const invoiceId of [...new Set(payments.map((payment) => payment.invoiceId))]) {
      await repository.recomputePaymentState(tx, clinicId, invoiceId);

      await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_LINK_EXPIRED, {
        clinicId,
        invoiceId,
        metadata: {
          expiredAt: now.toISOString(),
          timeoutMinutes: PAYMENT_LINK_TIMEOUT_MINUTES,
          linkCount: payments.filter((payment) => payment.invoiceId === invoiceId).length,
        },
      });

      const invoice = await tx.invoice.findFirstOrThrow({
        where: { id: invoiceId, clinicId },
        select: { status: true, balancePaise: true },
      });

      results.push({ invoiceId, status: invoice.status, balancePaise: invoice.balancePaise });
    }

    return results;
  });

  if (io) {
    for (const invoice of touched) {
      // Room-scoped. This carries a clinic's outstanding balance, which is not
      // a thing to put on every socket in the deployment.
      io.to(`clinic:${clinicId}`).emit(SOCKET_EVENTS.INVOICE_UPDATED, {
        invoiceId: invoice.invoiceId,
        status: invoice.status,
        balancePaise: invoice.balancePaise,
        reason: 'payment-link-expired',
      });
    }
  }

  return touched.length > 0 ? payments.length : 0;
}

/**
 * Best-effort cancellation of the links at Razorpay.
 *
 * Every failure is swallowed on purpose. D-11 promises the LOCAL expiry, and
 * that is what the transaction above delivers; a link left live at the gateway
 * that is later paid arrives as a `payment_link.paid` webhook and is reconciled
 * by `webhook.worker.ts` — which records the money and flags the invoice rather
 * than dropping it. Letting a gateway outage block the local expiry would
 * invert that: the invoice would sit "pending payment" indefinitely with no
 * path back.
 */
async function cancelAtGateway(
  prisma: PrismaClient,
  clinicId: string,
  payments: ExpiringPayment[],
): Promise<void> {
  const linkIds = payments
    .map((payment) => payment.razorpayPaymentLinkId)
    .filter((id): id is string => id != null);

  if (linkIds.length === 0) return;

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      razorpayKeyId: true,
      razorpayKeySecretEnc: true,
      razorpayTestMode: true,
    },
  });

  if (!clinic) return;

  let rzp;
  try {
    rzp = getRazorpayForClinic(clinic as ClinicRazorpayConfig);
  } catch {
    // Credentials were removed since the link was created. Nothing to cancel
    // with, and nothing that should stop the local expiry.
    return;
  }

  for (const linkId of linkIds) {
    try {
      await rzp.paymentLink.cancel(linkId);
    } catch (error) {
      console.error(`Payment link expiry: cancel failed for ${linkId}`, error);
    }
  }
}

export function scheduleExpirePaymentLinks(prisma: PrismaClient, io: Server) {
  cron.schedule(
    EXPIRY_CRON_EXPRESSION,
    async () => {
      try {
        const count = await runPaymentLinkExpirySweep(prisma, io);
        if (count > 0) {
          console.log(`Payment link expiry: ${count} pending link(s) expired`);
        }
      } catch (error) {
        console.error('Payment link expiry sweep failed:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
