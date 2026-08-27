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
 * WR-9: the query filters by `petId` AND a LIVE `ownerId`/`clinicId`/
 * DRAFT-exclusion check — never a frozen allow-list snapshotted once at
 * issuance (`AccessScopeService.deriveScope` no longer produces one). A pet
 * being in scope does not by itself imply every invoice on that pet is in
 * scope: an invoice with no `ownerId` set, or still `DRAFT`, must still be
 * excluded even though it shares the pet.
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
    if (!(await this.accessScopeService.isPetInScope(this.db, scope, petId))) {
      return null;
    }

    const invoices = (await this.db.invoice.findMany({
      where: { petId, ownerId: scope.ownerId, clinicId: scope.clinicId, status: { not: 'DRAFT' } },
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
