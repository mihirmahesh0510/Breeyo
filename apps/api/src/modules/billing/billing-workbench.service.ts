import type { RefundInput, VoidInvoiceInput } from '@breeyo/validators';
import type { InvoiceListItem } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { AccessPolicyService } from '../web-dashboard/access-policy.service.js';
import { BrowserSyncService, staleWriteConflictError } from '../../realtime/browser-sync.service.js';
import type { BrowserSyncChangeMetadata } from '../../realtime/socket.events.js';
import type { InvoiceService } from './invoice.service.js';
import type { PaymentService } from './payment.service.js';
import type { RefundService } from './refund.service.js';
import type { BillingActor } from './invoice.repository.js';

function forbiddenError(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  return error;
}

export interface BillingWorkbenchInvoiceRow extends InvoiceListItem {
  /** D-40/D-43: per-invoice stale/actor metadata. */
  changeMetadata: BrowserSyncChangeMetadata;
}

export interface BillingWorkbenchRecentPayment {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  petName: string | null;
  ownerName: string | null;
  amountPaise: number;
  method: string;
  paidAt: string | null;
  recordedByName: string | null;
}

export interface BillingWorkbenchResponse {
  unpaid: BillingWorkbenchInvoiceRow[];
  overdue: BillingWorkbenchInvoiceRow[];
  recentPayments: BillingWorkbenchRecentPayment[];
  /**
   * D-22: derived fresh from `AccessPolicyService.getRoleCodeForUser` on
   * every call -- NEVER a client-trusted flag. The browser renders refund
   * and void actions only when this is true; the `refundInvoice`/
   * `voidInvoice` methods below re-check the same thing before touching
   * `RefundService`/`InvoiceService`, so this flag is a hint for the UI, not
   * the authorization boundary itself.
   */
  refundAllowed: boolean;
  voidAllowed: boolean;
  staleState: 'fresh' | 'stale';
  serverUpdatedAt: string;
}

interface InvoiceMetaRow {
  id: string;
  updatedAt: Date;
  createdById: string;
}

interface RawPaymentRow {
  id: string;
  invoiceId: string;
  amountPaise: number;
  method: string;
  paidAt: Date | null;
  invoice?: { invoiceNumber: string | null; pet?: { name: string } | null; owner?: { name: string } | null } | null;
  recordedBy?: { fullName: string } | null;
}

/**
 * Browser billing workbench (Plan 09-04, D-22, D-40, D-42, D-43).
 *
 * Extends the Phase 6 billing module rather than replacing it: every
 * mutation delegates to the existing `PaymentService`/`RefundService`/
 * `InvoiceService`, so the money-state invariants those files already
 * enforce (recompute-from-rows, the reserve/send/record refund split, the
 * void-then-cancel-gateway-links sequence) stay identical between mobile and
 * browser. This class adds the one thing those files don't have: a browser
 * role check on the two highest-risk actions.
 *
 * ## D-22 is enforced twice, deliberately
 *
 * `billing.routes.ts` gates collect/refund/void alike behind
 * `MANAGE_PAYMENTS`, which Front Desk holds (D-05) -- that permission model
 * predates this plan and is not touched here. D-22 narrows refund/void
 * further, to Admin only, specifically for the *browser* surface. Rather
 * than adding a second Fastify preHandler that only this module needs, the
 * check lives here, in the service both new browser routes call through:
 * `refundInvoice`/`voidInvoice` resolve the caller's current
 * `BrowserRoleCode` via `AccessPolicyService` (the same D-19/D-83 fresh-read
 * mechanism the cockpit and inventory workbenches already use) and throw a
 * 403 before ever reaching `RefundService`/`InvoiceService` when the caller
 * is not Admin. `getWorkbench`'s `refundAllowed`/`voidAllowed` flags are the
 * UI-hiding half of D-22 (D-20's "hidden, not disabled"); the throw here is
 * the half that makes the flag non-optional to honor.
 */
export class BillingWorkbenchService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessPolicyService: AccessPolicyService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
    private readonly browserSyncService: BrowserSyncService = new BrowserSyncService(null),
  ) {}

  private async isAdmin(clinicId: string, userId: string): Promise<boolean> {
    const roleCode = await this.accessPolicyService.getRoleCodeForUser(clinicId, userId);
    return roleCode === 'ADMIN';
  }

  /** D-22, D-40, D-43: the one browser billing read. */
  async getWorkbench(clinicId: string, userId: string, clientKnownVersion?: number): Promise<BillingWorkbenchResponse> {
    const [unpaid, overdue, recentPayments, refundAllowed] = await Promise.all([
      this.buildInvoiceRows(clinicId, 'unpaid'),
      this.buildInvoiceRows(clinicId, 'overdue'),
      this.getRecentPayments(clinicId),
      this.isAdmin(clinicId, userId),
    ]);

    const serverVersion = Math.max(
      0,
      ...[...unpaid, ...overdue].map((row) => row.changeMetadata.staleVersion),
    );

    return {
      unpaid,
      overdue,
      recentPayments,
      // D-22: refund and void share one authorization question ("is this
      // caller Admin"), so both flags come from the same resolved boolean.
      refundAllowed,
      voidAllowed: refundAllowed,
      staleState: this.browserSyncService.resolveStaleStatus(serverVersion, clientKnownVersion),
      serverUpdatedAt: new Date(serverVersion).toISOString(),
    };
  }

  /**
   * Plan 10-05, D-05: rejects with a 409 `STALE_WRITE_CONFLICT` when the
   * caller's `expectedVersion` is behind the invoice's LIVE `updatedAt`,
   * instead of letting `collectPayment`/`refundInvoice`/`voidInvoice` apply
   * a write against a view the caller has not refreshed since another
   * session changed this invoice. A no-op whenever `expectedVersion` is
   * omitted -- every caller before this plan is unaffected.
   */
  private async assertInvoiceVersionCurrent(invoiceId: string, expectedVersion?: number): Promise<void> {
    if (expectedVersion === undefined) return;

    const current = (await this.db.invoice.findUnique({
      where: { id: invoiceId },
      select: { updatedAt: true },
    })) as { updatedAt: Date } | null;
    if (!current) return;

    if (this.browserSyncService.checkWriteVersion(current.updatedAt.getTime(), expectedVersion) === 'stale') {
      throw staleWriteConflictError({
        domain: 'billing',
        entityType: 'INVOICE',
        entityId: invoiceId,
        currentVersion: current.updatedAt.getTime(),
        expectedVersion,
      });
    }
  }

  /** D-05: cash quick-collection, open to Front Desk and Admin alike -- delegates to the existing cash-payment path unchanged. */
  async collectPayment(
    clinicId: string,
    actor: BillingActor,
    invoiceId: string,
    amountPaise?: number,
    expectedVersion?: number,
  ) {
    await this.assertInvoiceVersionCurrent(invoiceId, expectedVersion);
    return this.paymentService.recordCashPayment(clinicId, invoiceId, actor, amountPaise);
  }

  /** D-22: Admin-only. Throws 403 FORBIDDEN before touching `RefundService` for any other role. */
  async refundInvoice(
    clinicId: string,
    userId: string,
    actor: BillingActor,
    invoiceId: string,
    input: RefundInput,
    expectedVersion?: number,
  ) {
    if (!(await this.isAdmin(clinicId, userId))) {
      throw forbiddenError('Refunds are Admin-only in the browser, even with routine billing access (D-22)');
    }
    await this.assertInvoiceVersionCurrent(invoiceId, expectedVersion);
    return this.refundService.createRefund(clinicId, invoiceId, actor, input);
  }

  /** D-22: Admin-only. Throws 403 FORBIDDEN before touching `InvoiceService.voidInvoice` for any other role. */
  async voidInvoice(
    clinicId: string,
    userId: string,
    actor: BillingActor,
    invoiceId: string,
    input: VoidInvoiceInput,
    expectedVersion?: number,
  ) {
    if (!(await this.isAdmin(clinicId, userId))) {
      throw forbiddenError('Voiding an invoice is Admin-only in the browser, even with routine billing access (D-22)');
    }
    await this.assertInvoiceVersionCurrent(invoiceId, expectedVersion);
    return this.invoiceService.voidInvoice(clinicId, invoiceId, actor, input);
  }

  /**
   * D-40/D-43: `InvoiceService.list` already has the correct filter/sort
   * semantics for the `unpaid`/`overdue` chips (`InvoiceRepository`'s
   * `LIST_FILTER_STATUSES`), but its narrow `select` has no `updatedAt` or
   * actor column -- both are fetched here in one extra batched round trip
   * per section rather than widening the shared list projection for every
   * other caller of `InvoiceService.list`.
   */
  private async buildInvoiceRows(clinicId: string, filter: 'unpaid' | 'overdue'): Promise<BillingWorkbenchInvoiceRow[]> {
    const { items } = await this.invoiceService.list(clinicId, {
      status: filter,
      sort: 'due_date',
      limit: 50,
    });

    if (items.length === 0) {
      return [];
    }

    const ids = items.map((item) => item.id);
    const metaRows = (await this.db.invoice.findMany({
      where: { id: { in: ids } },
      select: { id: true, updatedAt: true, createdById: true },
    })) as InvoiceMetaRow[];
    const metaById = new Map(metaRows.map((row) => [row.id, row]));

    const actorIds = Array.from(new Set(metaRows.map((row) => row.createdById)));
    const nameById = await this.resolveActorNames(actorIds);

    return items.map((item) => {
      const meta = metaById.get(item.id);
      const updatedAt = meta?.updatedAt ?? new Date();
      const createdById = meta?.createdById ?? null;

      return {
        ...item,
        changeMetadata: this.browserSyncService.buildChangeMetadata({
          updatedAt,
          changedByUserId: createdById,
          changedByName: createdById ? nameById.get(createdById) ?? null : null,
          reviewPath: `/billing?invoiceId=${item.id}`,
        }),
      };
    });
  }

  /** D-42: recent captured payments, most recent first -- the payment-history section beside the risky-action history. */
  private async getRecentPayments(clinicId: string): Promise<BillingWorkbenchRecentPayment[]> {
    const payments = (await this.db.payment.findMany({
      where: { clinicId, status: 'captured' },
      orderBy: { paidAt: 'desc' },
      take: 20,
      include: {
        invoice: { select: { invoiceNumber: true, pet: { select: { name: true } }, owner: { select: { name: true } } } },
        recordedBy: { select: { fullName: true } },
      },
    })) as RawPaymentRow[];

    return payments.map((payment) => ({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoice?.invoiceNumber ?? null,
      petName: payment.invoice?.pet?.name ?? null,
      ownerName: payment.invoice?.owner?.name ?? null,
      amountPaise: payment.amountPaise,
      method: payment.method,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      recordedByName: payment.recordedBy?.fullName ?? null,
    }));
  }

  private async resolveActorNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const users = (await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    })) as Array<{ id: string; fullName: string }>;

    return new Map(users.map((user) => [user.id, user.fullName]));
  }
}
