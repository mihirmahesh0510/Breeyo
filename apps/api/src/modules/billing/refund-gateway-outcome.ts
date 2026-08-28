import type { TenantPrismaClient, TenantTransactionClient } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import { StockMovementService } from '../inventory/stock-movement.service.js';
import { InvoiceRepository } from './invoice.repository.js';
import { StockValidatorService } from './stock-validator.service.js';

/**
 * Applying a confirmed Razorpay refund outcome (WR-3).
 *
 * `refund.service.ts`'s `reserveDigitalLeg` writes a digital refund `pending`
 * and never touches it again by design — only a CONFIRMED gateway outcome may
 * complete it (see that file's header for why). Two things learn that outcome
 * on two different schedules:
 *
 *  - `webhook.worker.ts`'s `refund.processed`/`refund.failed` handlers, the
 *    moment Razorpay pushes the event.
 *  - `refund-reconciliation.job.ts`'s poll-based sweep, for the rare case
 *    where that webhook is never delivered (endpoint downtime, a rotated
 *    secret, a dropped delivery) and the row would otherwise stay `pending`
 *    forever with no reconciliation path.
 *
 * Both must trigger IDENTICAL side effects — the refund row, the recomputed
 * invoice balance, and the audit trail cannot depend on which of the two
 * channels happened to notice first — so both call this one function rather
 * than each carrying their own copy of the transition logic.
 */

/** The refund fields recording a gateway outcome needs, and no others. */
export interface ReconcilableRefund {
  id: string;
  invoiceId: string;
  amountPaise: number;
}

/** What changed on the invoice a refund outcome was applied to. */
export interface RefundOutcomeTouch {
  invoiceId: string;
  status: string;
  balancePaise: number;
  exceptionFlag: string | null;
}

/**
 * Writes a CONFIRMED gateway outcome back to one refund row: the row itself,
 * the invoice's recomputed payment state, and the audit log entry.
 *
 * Takes an already-open `tx` and opens no transaction of its own — both
 * callers run their OTHER statements for the same unit of work in the same
 * transaction (the webhook handler's `webhookEvent.processedAt` write; the
 * reconciliation job has nothing extra), so this function's writes commit or
 * roll back together with them.
 *
 * `db` is the tenant-scoped, non-transactional handle, needed only to satisfy
 * `InvoiceRepository`'s constructor — `recomputePaymentState` itself takes
 * `tx` as an explicit argument regardless of what the repository was built
 * with. `webhook.worker.ts`'s own `buildRepository` follows the identical
 * pattern for the same reason.
 */
export async function applyRefundGatewayOutcome(
  db: TenantPrismaClient,
  tx: TenantTransactionClient,
  clinicId: string,
  refund: ReconcilableRefund,
  outcome: 'processed' | 'failed',
  razorpayRefundId: string,
  failureReason: string,
): Promise<RefundOutcomeTouch> {
  const now = new Date();

  await tx.refund.update({
    where: { id: refund.id },
    data:
      outcome === 'processed'
        ? { status: 'processed', processedAt: now, failureReason: null }
        : { status: 'failed', failureReason: failureReason.slice(0, 500) },
  });

  // Runs for a failure too: a refund that was optimistically counted against
  // the balance must be taken back out of it, and the derivation is what does
  // that.
  const repository = new InvoiceRepository(
    db,
    new StockValidatorService(db, new StockMovementService(db)),
  );
  await repository.recomputePaymentState(tx, clinicId, refund.invoiceId);

  await writeBillingAuditLog(
    tx,
    outcome === 'processed' ? BillingAuditEvent.REFUND_PROCESSED : BillingAuditEvent.REFUND_FAILED,
    {
      clinicId,
      invoiceId: refund.invoiceId,
      metadata: {
        razorpayRefundId,
        amountPaise: refund.amountPaise,
        ...(outcome === 'failed' ? { failureReason } : {}),
      },
    },
  );

  const invoice = await tx.invoice.findFirstOrThrow({
    where: { id: refund.invoiceId, clinicId },
    select: { status: true, balancePaise: true, exceptionFlag: true },
  });

  return {
    invoiceId: refund.invoiceId,
    status: invoice.status,
    balancePaise: invoice.balancePaise,
    exceptionFlag: invoice.exceptionFlag,
  };
}
