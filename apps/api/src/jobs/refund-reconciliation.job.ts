import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@breeyo/types';
import { createTenantClient, type TenantPrismaClient } from '../lib/prisma-rls.js';
import {
  getRazorpayForClinic,
  type ClinicRazorpayConfig,
} from '../modules/billing/razorpay.client.js';
import { applyRefundGatewayOutcome } from '../modules/billing/refund-gateway-outcome.js';

/**
 * Reconciles refunds stuck `pending` because the Razorpay webhook that would
 * have completed them was never delivered (WR-3).
 *
 * ## Why this exists
 *
 * `refund.service.ts`'s `reserveDigitalLeg` writes a digital refund `pending`
 * and NEVER touches it again by design — only `webhook.worker.ts`'s
 * `refund.processed`/`refund.failed` handlers move it on, driven by Razorpay's
 * webhook. A webhook is a best-effort push: an expired endpoint, a rotated
 * signing secret, or one dropped delivery leaves the row `pending` forever
 * with no retry path — silently holding its amount against
 * `refund.service.ts`'s refundable bound for good, and never settling for the
 * owner.
 *
 * This sweep is the pull-based backstop. It asks Razorpay directly —
 * `refunds.fetch`, the same read `razorpay-mock.ts`'s double already answers
 * — for the CURRENT state of every refund old enough that a webhook should
 * long since have arrived, and applies whatever Razorpay says through the
 * exact same {@link applyRefundGatewayOutcome} the webhook handler uses. A
 * refund reconciled by either path ends up in an identical state: same row,
 * same recomputed balance, same audit log entry.
 *
 * ## The staleness window
 *
 * Thirty minutes, comfortably longer than any transient webhook delay (a
 * dropped delivery or a brief endpoint outage), so this sweep does not race a
 * webhook that is merely running late — it only ever picks up a refund the
 * webhook path has had a fair chance to complete and hasn't. Refund
 * settlement itself takes 2-5 business days (see `refund.service.ts`'s
 * header), so thirty minutes of extra latency on the rare lost-webhook path
 * costs nothing a clinic would notice.
 *
 * ## Admin client, tenant writes
 *
 * Same shape as `expire-payment-links.ts`: the driving query is cross-clinic
 * (no request context, D-30 exemption), grouped by clinic, and every write
 * then runs on a tenant-scoped handle bound to that clinic.
 */

const REFUND_RECONCILIATION_STALE_MINUTES = 30;

/**
 * Every ten minutes — frequent enough that a lost webhook is caught well
 * inside a support call's timescale, infrequent enough not to poll Razorpay
 * for a fallback path that should rarely have anything to do.
 */
const REFUND_RECONCILIATION_CRON_EXPRESSION = '*/10 * * * *';

interface StaleRefund {
  id: string;
  clinicId: string;
  invoiceId: string;
  amountPaise: number;
  razorpayRefundId: string;
}

/**
 * Reconciles every digital refund that is still `pending` past the staleness
 * window and returns how many were resolved (`processed` or `failed`).
 *
 * Exported separately from {@link scheduleRefundReconciliation} so the suite
 * can drive it directly rather than waiting on a schedule.
 */
export async function runRefundReconciliationSweep(
  prisma: PrismaClient,
  io: Server | null,
  now: Date = new Date(),
): Promise<number> {
  const deadline = new Date(now.getTime() - REFUND_RECONCILIATION_STALE_MINUTES * 60_000);

  const stale = await prisma.refund.findMany({
    where: {
      status: 'pending',
      razorpayRefundId: { not: null },
      createdAt: { lt: deadline },
    },
    select: {
      id: true,
      clinicId: true,
      invoiceId: true,
      amountPaise: true,
      razorpayRefundId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (stale.length === 0) return 0;

  const byClinic = new Map<string, StaleRefund[]>();
  for (const refund of stale) {
    // Narrowed by the WHERE clause above; the null check only satisfies the
    // type checker that `razorpayRefundId` is a `string` from here on.
    if (!refund.razorpayRefundId) continue;

    const entry: StaleRefund = {
      id: refund.id,
      clinicId: refund.clinicId,
      invoiceId: refund.invoiceId,
      amountPaise: refund.amountPaise,
      razorpayRefundId: refund.razorpayRefundId,
    };
    byClinic.set(refund.clinicId, [...(byClinic.get(refund.clinicId) ?? []), entry]);
  }

  let reconciled = 0;

  for (const [clinicId, refunds] of byClinic) {
    try {
      reconciled += await reconcileForClinic(prisma, io, clinicId, refunds);
    } catch (error) {
      // One clinic's credential/gateway trouble must not cost every other
      // clinic its sweep. The rows stay pending and the next run (ten minutes
      // away) tries again.
      console.error(`Refund reconciliation: clinic ${clinicId} failed`, error);
    }
  }

  return reconciled;
}

async function reconcileForClinic(
  prisma: PrismaClient,
  io: Server | null,
  clinicId: string,
  refunds: StaleRefund[],
): Promise<number> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      razorpayKeyId: true,
      razorpayKeySecretEnc: true,
      razorpayTestMode: true,
    },
  });
  if (!clinic) return 0;

  let rzp: ReturnType<typeof getRazorpayForClinic>;
  try {
    rzp = getRazorpayForClinic(clinic as ClinicRazorpayConfig);
  } catch {
    // Credentials were removed since the refund was reserved. Nothing to poll
    // Razorpay with; the row stays pending for a human to reconcile.
    return 0;
  }

  const db = createTenantClient(clinicId);
  let reconciled = 0;

  for (const refund of refunds) {
    try {
      reconciled += await reconcileOne(db, io, clinicId, refund, rzp);
    } catch (error) {
      // Each refund is independent: one bad fetch or write must not stop this
      // clinic's other stale refunds from being tried in the same run.
      console.error(`Refund reconciliation: refund ${refund.id} failed`, error);
    }
  }

  return reconciled;
}

async function reconcileOne(
  db: TenantPrismaClient,
  io: Server | null,
  clinicId: string,
  refund: StaleRefund,
  rzp: ReturnType<typeof getRazorpayForClinic>,
): Promise<number> {
  const gatewayRefund = await rzp.refunds.fetch(refund.razorpayRefundId);

  if (gatewayRefund.status !== 'processed' && gatewayRefund.status !== 'failed') {
    // Still genuinely pending at Razorpay (or an unrecognised status) —
    // nothing to reconcile yet. The next sweep tries again.
    return 0;
  }

  const outcome = gatewayRefund.status;
  const failureReason =
    outcome === 'failed'
      ? 'The gateway reported a failure (reconciled by poll — no webhook was received)'
      : '';

  const touched = await db.$transaction((tx) =>
    applyRefundGatewayOutcome(
      db,
      tx,
      clinicId,
      refund,
      outcome,
      refund.razorpayRefundId,
      failureReason,
    ),
  );

  if (io) {
    // Room-scoped, matching every other cron push in this codebase — an
    // invoice's balance is not a thing to put on every socket in the
    // deployment.
    io.to(`clinic:${clinicId}`).emit(SOCKET_EVENTS.INVOICE_UPDATED, {
      invoiceId: touched.invoiceId,
      status: touched.status,
      balancePaise: touched.balancePaise,
      exceptionFlag: touched.exceptionFlag,
      reason: 'refund-reconciliation',
    });
  }

  return 1;
}

export function scheduleRefundReconciliation(prisma: PrismaClient, io: Server) {
  cron.schedule(
    REFUND_RECONCILIATION_CRON_EXPRESSION,
    async () => {
      try {
        const count = await runRefundReconciliationSweep(prisma, io);
        if (count > 0) {
          console.log(`Refund reconciliation: ${count} stale pending refund(s) reconciled`);
        }
      } catch (error) {
        console.error('Refund reconciliation sweep failed:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
