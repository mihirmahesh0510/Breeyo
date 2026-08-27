import type { OwnerPortalDeepLinkType, OwnerPortalTabId } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

/**
 * The columns `MagicLinkService` reads off `OwnerPortalMagicLink` to derive a
 * scope from. Kept narrow (not the full Prisma row) so this service stays
 * testable without a Prisma type import, and so a column this service does
 * not use (e.g. `tokenHash`) is never accidentally threaded through it.
 *
 * WR-9: this row intentionally no longer carries `allowedPetIdsJson` /
 * `allowedInvoiceIdsJson`. Those columns still exist on the table (see
 * `portal-link-issuance.service.ts` / `portal-reissue.service.ts` — they
 * still write a legacy snapshot to them for historical/debugging purposes),
 * but nothing in this module reads them anymore: every pet/invoice-scope
 * decision below is a live database query, never a JSON blob frozen at
 * issuance time.
 */
export interface OwnerPortalMagicLinkRow {
  id: string;
  clinicId: string;
  ownerId: string;
  defaultTab: string;
  deepLinkType: string | null;
  deepLinkEntityId: string | null;
  expiresAt: Date;
}

/**
 * The server-derived, request-scoped authority for a validated magic link
 * (D-64, OWN-06). Every owner-portal service that reads or mutates pet- or
 * invoice-scoped data is handed one of these — never a client-supplied
 * ownerId/petId/invoiceId.
 *
 * WR-9: this no longer carries `allowedPetIds`/`allowedInvoiceIds` arrays.
 * Pre-fix, those were a JSON snapshot parsed off the link row once at
 * issuance and trusted verbatim for the link's entire life (and every
 * reissue of it) — a pet or invoice created after issuance simply never
 * appeared, because nothing ever re-queried the database. `ownerId` and
 * `clinicId` are now the ONLY identity this scope carries; every pet/invoice
 * check queries current database state by those two ids at request time
 * (see `isPetInScope` / `isInvoiceInScope` / `areInvoicesInScope` below).
 */
export interface OwnerPortalTokenScope {
  magicLinkId: string;
  clinicId: string;
  ownerId: string;
  defaultTab: OwnerPortalTabId;
  deepLinkType: OwnerPortalDeepLinkType | null;
  deepLinkEntityId: string | null;
  expiresAt: Date;
}

/**
 * Derives explicit owner scope from a validated magic-link row, and re-checks
 * every subsequent request against LIVE `pet`/`invoice` rows for that owner —
 * never against a snapshot taken once at issuance (T-09-14, T-09-15).
 *
 * WR-9 fix: pre-fix, `isPetInScope`/`isInvoiceInScope` were synchronous
 * array-membership checks against `allowedPetIdsJson`/`allowedInvoiceIdsJson`,
 * frozen on the link row at issuance and copied forward verbatim on every
 * reissue. A new pet or invoice for the same owner never appeared through an
 * existing (or reissued) link for its entire life. These are now async,
 * take the request's `TenantPrismaClient`, and query `pet`/`invoice` by
 * (`ownerId`, `clinicId`) at request time — mirroring the live
 * `status: 'finalized'` filter `portal-records.service.ts` already uses for
 * consultation finalization, rather than trusting any cached list.
 *
 * `MagicLinkService` calls `deriveScope` once per validated `READY` request;
 * `portal-records`, `portal-invoices`, `portal-care-dates`, `portal-checkout`,
 * and `portal-receipt` services call `isPetInScope` / `isInvoiceInScope` /
 * `areInvoicesInScope` before ever querying the database for a
 * client-supplied id.
 */
export class AccessScopeService {
  deriveScope(row: OwnerPortalMagicLinkRow): OwnerPortalTokenScope {
    return {
      magicLinkId: row.id,
      clinicId: row.clinicId,
      ownerId: row.ownerId,
      defaultTab: row.defaultTab as OwnerPortalTabId,
      deepLinkType: (row.deepLinkType as OwnerPortalDeepLinkType | null) ?? null,
      deepLinkEntityId: row.deepLinkEntityId ?? null,
      expiresAt: row.expiresAt,
    };
  }

  /** A pet is in scope iff it currently belongs to this owner in this clinic. */
  async isPetInScope(db: TenantPrismaClient, scope: OwnerPortalTokenScope, petId: string): Promise<boolean> {
    const pet = await db.pet.findFirst({
      where: { id: petId, ownerId: scope.ownerId, clinicId: scope.clinicId },
      select: { id: true },
    });
    return pet !== null;
  }

  /**
   * An invoice is in scope iff it currently belongs to this owner in this
   * clinic AND is not a DRAFT — a DRAFT is internal front-desk state the
   * owner was never billed for and must never be reachable through the
   * portal (same invariant `portal-link-issuance.service.ts`'s
   * `status: { not: 'DRAFT' }` filter already enforced at issuance; now
   * enforced live, on every request, instead of once at issuance).
   */
  async isInvoiceInScope(db: TenantPrismaClient, scope: OwnerPortalTokenScope, invoiceId: string): Promise<boolean> {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, ownerId: scope.ownerId, clinicId: scope.clinicId, status: { not: 'DRAFT' } },
      select: { id: true },
    });
    return invoice !== null;
  }

  /** Every id in `invoiceIds` must currently resolve in scope; an empty list is never "in scope". */
  async areInvoicesInScope(
    db: TenantPrismaClient,
    scope: OwnerPortalTokenScope,
    invoiceIds: string[],
  ): Promise<boolean> {
    if (invoiceIds.length === 0) return false;
    const count = await db.invoice.count({
      where: {
        id: { in: invoiceIds },
        ownerId: scope.ownerId,
        clinicId: scope.clinicId,
        status: { not: 'DRAFT' },
      },
    });
    return count === invoiceIds.length;
  }
}
