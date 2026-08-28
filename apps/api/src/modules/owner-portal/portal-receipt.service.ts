import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PaymentService } from '../billing/payment.service.js';
import { AccessScopeService, type OwnerPortalTokenScope } from './access-scope.service.js';

export interface PortalReceiptData {
  invoiceId: string;
  receiptNumber: string;
  amountPaise: number;
  method: string;
  transactionRef: string | null;
  issuedAt: string;
}

export type PortalReceiptResult =
  | { status: 'OUT_OF_SCOPE' }
  | { status: 'NOT_FOUND' }
  | { status: 'FOUND'; receipt: PortalReceiptData };

interface ReceiptRow {
  receiptNumber: string;
  amountPaise: number;
  method: string;
  transactionRef: string | null;
  issuedAt: Date;
}

/**
 * Finding 9.3 (PHASE-09-VERIFY-FIX-PLAN.md): `PaymentResultBanner` and
 * `InvoiceDetailSheet` were both built to render a `receiptUrl` that no
 * backend contract ever produced -- D-71's "receipt access before
 * navigating elsewhere" was UI scaffolding with no data behind it, since the
 * real `PaymentReceipt` route (`GET /billing/invoices/:invoiceId/receipts/
 * :receiptId`) is staff-only/authenticated and takes a `receiptId` the owner
 * portal's contract never exposed.
 *
 * This service is the scoped read that backs the new owner-portal route:
 * re-checks `invoiceId` against the owner's LIVE invoices (WR-9:
 * `AccessScopeService.isInvoiceInScope`'s live `ownerId`/`clinicId` query,
 * the same pattern every other 09-05 service uses) BEFORE ever calling
 * billing, then delegates to
 * `PaymentService.getLatestReceiptForInvoice` -- the real receipt lookup --
 * rather than a second one. Finds "most recent receipt for this invoice"
 * rather than "this exact receipt" because the owner has no `receiptId` to
 * present, unlike staff.
 */
export class PortalReceiptService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessScopeService: AccessScopeService,
    private readonly paymentService: Pick<PaymentService, 'getLatestReceiptForInvoice'>,
  ) {}

  async getReceipt(scope: OwnerPortalTokenScope, invoiceId: string): Promise<PortalReceiptResult> {
    if (!(await this.accessScopeService.isInvoiceInScope(this.db, scope, invoiceId))) {
      return { status: 'OUT_OF_SCOPE' };
    }

    const receipt = (await this.paymentService.getLatestReceiptForInvoice(
      scope.clinicId,
      invoiceId,
    )) as ReceiptRow | null;

    if (!receipt) {
      return { status: 'NOT_FOUND' };
    }

    return {
      status: 'FOUND',
      receipt: {
        invoiceId,
        receiptNumber: receipt.receiptNumber,
        amountPaise: receipt.amountPaise,
        method: receipt.method,
        transactionRef: receipt.transactionRef,
        issuedAt: receipt.issuedAt.toISOString(),
      },
    };
  }
}
