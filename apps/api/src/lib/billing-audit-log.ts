import type { Prisma } from '@prisma/client';
import type { DbClient, TenantTransactionClient } from './prisma-rls.js';

/**
 * Append-only audit log for financial events (D-32).
 *
 * ## Why this is not `auth_audit_log`
 *
 * D-32: financial events are kept in their own table, separate from the
 * auth-centric log, because they have a different retention obligation. GST
 * Section 36 requires six years of retention for records of account; auth audit
 * retention is a security policy that should be free to change independently.
 * Mixing them would force the stricter of the two on both.
 *
 * ## Append-only is enforced in the database, not here
 *
 * `billing_audit_log` has SELECT and INSERT policies and deliberately no UPDATE
 * and no DELETE policy (`prisma/post-migrate.sql`). A financial audit row that
 * can be edited or removed proves nothing. This module correspondingly exports
 * no update, delete or upsert path — but the guarantee comes from the missing
 * policies, so that even a compromised application role cannot rewrite history.
 *
 * ## Never put credential material in metadata (ASVS V7)
 *
 * No decrypted secret, no raw Razorpay payload, and nothing carrying card
 * metadata may reach the `metadata` column. Audit rows are long-lived by
 * design, which makes them the worst possible place for a leak.
 */
export enum BillingAuditEvent {
  // Invoicing & Payments (Phase 6) — D-32
  INVOICE_DRAFT_CREATED = 'INVOICE_DRAFT_CREATED',
  INVOICE_FINALIZED = 'INVOICE_FINALIZED',
  INVOICE_VOIDED = 'INVOICE_VOIDED',
  PAYMENT_RECORDED = 'PAYMENT_RECORDED',
  PAYMENT_LINK_CREATED = 'PAYMENT_LINK_CREATED',
  PAYMENT_LINK_EXPIRED = 'PAYMENT_LINK_EXPIRED',
  REFUND_INITIATED = 'REFUND_INITIATED',
  REFUND_PROCESSED = 'REFUND_PROCESSED',
  REFUND_FAILED = 'REFUND_FAILED',
  CREDIT_NOTE_ISSUED = 'CREDIT_NOTE_ISSUED',
  /**
   * Metadata for this event records ONLY which fields changed, as booleans —
   * `{ keyIdChanged: true, secretChanged: true, webhookChanged: false }`.
   * Never a value, encrypted or otherwise.
   */
  RAZORPAY_CREDENTIALS_UPDATED = 'RAZORPAY_CREDENTIALS_UPDATED',
  BILLING_SETTINGS_UPDATED = 'BILLING_SETTINGS_UPDATED',
  /**
   * The opt-in SAC correction (follow-up A1). Metadata records the row count
   * and the target code, never row contents.
   *
   * Audited because it rewrites a field printed on a legal document, and the
   * six-year GST retention obligation means someone may need to establish, in
   * 2032, who changed the SAC on a 2026 invoice's source row and when.
   */
  SERVICE_SAC_CODES_UPDATED = 'SERVICE_SAC_CODES_UPDATED',
  WEBHOOK_SIGNATURE_REJECTED = 'WEBHOOK_SIGNATURE_REJECTED',
}

export interface BillingAuditLogData {
  /**
   * Required, unlike `AuditLogData.clinicId` which is optional because auth
   * events can precede clinic selection. Every financial event belongs to
   * exactly one clinic, and the `billing_audit_log` INSERT policy admits only
   * rows whose `clinic_id` matches the bound tenant.
   */
  clinicId: string;
  userId?: string;
  /** Absent for clinic-level events such as a settings or credential change. */
  invoiceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Any Prisma handle that can insert an audit row.
 *
 * Typed structurally rather than as a union of the concrete client types
 * because `Prisma.TransactionClient` (the unextended client's transaction
 * handle) and `TenantTransactionClient` (the RLS-extended one's) are not
 * mutually assignable — see the note in `prisma-rls.ts`. Both satisfy this
 * contract, as do the two non-transactional clients, and so does a test double.
 */
export interface BillingAuditClient {
  billingAuditLog: {
    create(args: {
      data: {
        clinicId: string;
        userId?: string;
        event: string;
        invoiceId?: string;
        ipAddress?: string;
        userAgent?: string;
        metadata?: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
}

/**
 * Compile-time proof that every handle a caller might hold satisfies
 * {@link BillingAuditClient}. If a Prisma upgrade changes one of these shapes,
 * this fails to compile here rather than at each of the dozen call sites.
 */
type SatisfiesAuditClient<T extends BillingAuditClient> = T;
export type _AcceptsTransactionClient = SatisfiesAuditClient<Prisma.TransactionClient>;
export type _AcceptsTenantTransactionClient = SatisfiesAuditClient<TenantTransactionClient>;
export type _AcceptsDbClient = SatisfiesAuditClient<DbClient>;

/**
 * Writes one financial audit row.
 *
 * Pass the caller's transaction handle wherever the event accompanies a state
 * change — finalize, void, refund, credit note. That is the whole point of
 * accepting a transaction client: the audit row then commits or rolls back with
 * the change it records, so an audit row can never describe an operation that
 * was rolled back, and a committed financial change can never be unlogged.
 *
 * This throws on failure, deliberately. Inside a transaction that is correct:
 * a financial state change that cannot be audited should not commit. For the
 * handful of events emitted outside a transaction, use
 * {@link writeBillingAuditLogSafe}.
 */
export async function writeBillingAuditLog(
  prisma: BillingAuditClient,
  event: BillingAuditEvent,
  data: BillingAuditLogData,
): Promise<void> {
  await prisma.billingAuditLog.create({
    data: {
      clinicId: data.clinicId,
      userId: data.userId,
      event,
      invoiceId: data.invoiceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Best-effort variant for events emitted outside a transaction — currently the
 * webhook signature rejection and the payment-link expiry sweep.
 *
 * Rejecting a forged webhook must not fail because the audit insert failed, so
 * this swallows the error. It does not swallow it silently: following the
 * precedent in `emr.service.ts`, the failure is surfaced through the logger.
 *
 * Do not reach for this variant inside a transaction. There, a failed audit
 * write is a reason to roll back, not a reason to continue.
 */
export async function writeBillingAuditLogSafe(
  prisma: BillingAuditClient,
  event: BillingAuditEvent,
  data: BillingAuditLogData,
  logger?: { error: (obj: unknown, msg: string) => void },
): Promise<void> {
  try {
    await writeBillingAuditLog(prisma, event, data);
  } catch (err) {
    // The event name and clinic are safe to log; `data.metadata` is not
    // included, because a caller could have put an unreviewed payload in it.
    logger?.error({ err, event, clinicId: data.clinicId }, 'billing audit write failed');
  }
}
