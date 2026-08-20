import type { OwnerPortalInvoiceSummary } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { AccessScopeService, type OwnerPortalTokenScope } from './access-scope.service.js';

export interface PortalInvoicesResult {
  invoices: OwnerPortalInvoiceSummary[];
}

interface InvoiceSummaryRow {
  id: string;
  petId: string | null;
  invoiceNumber: string | null;
  status: string;
  grandTotalPaise: number;
  balancePaise: number;
  dueDate: Date | null;
}

/**
 * Pet-scoped invoice browsing (OWN-02, D-59). Invoice navigation stays
 * nested under a single pet even though later checkout (D-59, D-69, D-70)
 * can combine invoices across pets — that combination is
 * `PortalCheckoutService`'s job, not this one's.
 *
 * The query filters by BOTH `petId` and `scope.allowedInvoiceIds` — never
 * `petId` alone. A pet being in scope does not by itself imply every invoice
 * on that pet is in scope (the link's allow-list is the source of truth,
 * derived once at issuance by `AccessScopeService.deriveScope`).
 */
export class PortalInvoicesService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async getInvoicesForPet(
    scope: OwnerPortalTokenScope,
    petId: string,
  ): Promise<PortalInvoicesResult | null> {
    if (!this.accessScopeService.isPetInScope(scope, petId)) {
      return null;
    }

    const invoices = (await this.db.invoice.findMany({
      where: { petId, id: { in: scope.allowedInvoiceIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        petId: true,
        invoiceNumber: true,
        status: true,
        grandTotalPaise: true,
        balancePaise: true,
        dueDate: true,
      },
    })) as InvoiceSummaryRow[];

    return {
      invoices: invoices.map((invoice) => ({
        invoiceId: invoice.id,
        petId: invoice.petId ?? petId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        grandTotalPaise: invoice.grandTotalPaise,
        balancePaise: invoice.balancePaise,
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      })),
    };
  }
}
