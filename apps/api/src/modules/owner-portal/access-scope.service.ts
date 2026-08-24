import type { OwnerPortalDeepLinkType, OwnerPortalTabId } from '@breeyo/types';

/**
 * The columns `MagicLinkService` reads off `OwnerPortalMagicLink` to derive a
 * scope from. Kept narrow (not the full Prisma row) so this service stays
 * testable without a Prisma type import, and so a column this service does
 * not use (e.g. `tokenHash`) is never accidentally threaded through it.
 */
export interface OwnerPortalMagicLinkRow {
  id: string;
  clinicId: string;
  ownerId: string;
  defaultTab: string;
  deepLinkType: string | null;
  deepLinkEntityId: string | null;
  allowedPetIdsJson: unknown;
  allowedInvoiceIdsJson: unknown;
  expiresAt: Date;
}

/**
 * The server-derived, request-scoped authority for a validated magic link
 * (D-64, OWN-06). Every owner-portal service that reads or mutates pet- or
 * invoice-scoped data is handed one of these — never a client-supplied
 * ownerId/petId/invoiceId — because this is the ONLY place `allowedPetIdsJson`
 * / `allowedInvoiceIdsJson` are parsed off the link row.
 */
export interface OwnerPortalTokenScope {
  magicLinkId: string;
  clinicId: string;
  ownerId: string;
  allowedPetIds: string[];
  allowedInvoiceIds: string[];
  defaultTab: OwnerPortalTabId;
  deepLinkType: OwnerPortalDeepLinkType | null;
  deepLinkEntityId: string | null;
  expiresAt: Date;
}

function parseIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Derives explicit owner/pet/invoice scope from a validated magic-link row,
 * and re-checks every subsequent request against that scope — never against
 * anything the client sends (T-09-14, T-09-15).
 *
 * This is the ONLY place `allowedPetIdsJson` / `allowedInvoiceIdsJson` get
 * parsed from JSON. `MagicLinkService` calls `deriveScope` once per validated
 * `READY` request; `portal-records`, `portal-invoices`, and
 * `portal-checkout` services call `isPetInScope` / `areInvoicesInScope`
 * before ever querying the database for a client-supplied id.
 */
export class AccessScopeService {
  deriveScope(row: OwnerPortalMagicLinkRow): OwnerPortalTokenScope {
    return {
      magicLinkId: row.id,
      clinicId: row.clinicId,
      ownerId: row.ownerId,
      allowedPetIds: parseIdArray(row.allowedPetIdsJson),
      allowedInvoiceIds: parseIdArray(row.allowedInvoiceIdsJson),
      defaultTab: row.defaultTab as OwnerPortalTabId,
      deepLinkType: (row.deepLinkType as OwnerPortalDeepLinkType | null) ?? null,
      deepLinkEntityId: row.deepLinkEntityId ?? null,
      expiresAt: row.expiresAt,
    };
  }

  isPetInScope(scope: OwnerPortalTokenScope, petId: string): boolean {
    return scope.allowedPetIds.includes(petId);
  }

  isInvoiceInScope(scope: OwnerPortalTokenScope, invoiceId: string): boolean {
    return scope.allowedInvoiceIds.includes(invoiceId);
  }

  /** Every id in `invoiceIds` must be in scope; an empty list is never "in scope". */
  areInvoicesInScope(scope: OwnerPortalTokenScope, invoiceIds: string[]): boolean {
    return invoiceIds.length > 0 && invoiceIds.every((id) => this.isInvoiceInScope(scope, id));
  }
}
