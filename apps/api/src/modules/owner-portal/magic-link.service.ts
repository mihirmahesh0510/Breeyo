import type { PrismaClient } from '@prisma/client';
import { resolveOwnerPortalSessionState } from '@breeyo/types';
import { hashMagicLinkToken } from '../../lib/magic-link-hash.js';
import { AccessScopeService, type OwnerPortalMagicLinkRow, type OwnerPortalTokenScope } from './access-scope.service.js';

/**
 * Server-authoritative resolution of a presented magic-link token (D-64,
 * D-67, OWN-04, OWN-06). `INVALID` carries no data at all — a tampered,
 * missing, revoked, or (structurally, since the hash is globally unique)
 * cross-clinic token is indistinguishable from any other mismatch.
 *
 * `EXPIRED` carries the bare ids the reissue flow needs (`magicLinkId`,
 * `clinicId`, `ownerId`) but deliberately nothing scope-shaped — these are
 * internal-only fields for `PortalReissueService`, never serialized directly
 * as a public response body (see `magicLinkValidationResultSchema` in
 * `@breeyo/validators`, whose `EXPIRED` variant is `.strict()` with no extra
 * scope fields).
 *
 * `clinicPhone` (finding 9.9) is the one exception: it graduated to
 * "serializable" alongside the `READY` path's `data.clinicPhone` for the
 * identical reason (`portal-session.service.ts`'s header comment) — the
 * holder of an expired token already received it from this exact clinic, so
 * naming the clinic back to them leaks nothing an `INVALID` token's holder
 * (who never reaches this branch) could use. It is looked up here rather
 * than left for each caller to fetch separately, so `owner-portal.routes.ts`'s
 * `requirePortalScope` and `reissue.controller.ts` -- the two callers that
 * ever see an `EXPIRED` resolution -- both get it for free.
 */
export type MagicLinkResolution =
  | { state: 'INVALID' }
  | { state: 'EXPIRED'; magicLinkId: string; clinicId: string; ownerId: string; clinicPhone: string }
  | { state: 'READY'; data: OwnerPortalTokenScope };

/**
 * Hashes and validates owner-portal magic-link tokens (T-09-02, D-64,
 * OWN-04, OWN-06).
 *
 * Constructed with the ADMIN `PrismaClient` (`getBasePrisma()`), not a
 * `TenantPrismaClient` — exactly like `webhook.service.ts`'s
 * `resolveClinicByWebhookToken` (D-30's documented exemption). The clinic is
 * not known until the token is looked up, so this lookup structurally cannot
 * run under a tenant-bound RLS handle; every subsequent read of pet/invoice/
 * visit data uses `createTenantClient(scope.clinicId)` once the token has
 * resolved.
 */
export class MagicLinkService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async validate(rawToken: string, now: Date = new Date()): Promise<MagicLinkResolution> {
    if (!rawToken) {
      return { state: 'INVALID' };
    }

    const tokenHash = hashMagicLinkToken(rawToken);
    const row = (await this.prisma.ownerPortalMagicLink.findUnique({
      where: { tokenHash },
    })) as OwnerPortalMagicLinkRow & { revokedAt: Date | null } | null;

    if (!row) {
      return { state: 'INVALID' };
    }

    const state = resolveOwnerPortalSessionState({
      matchesHash: true,
      revokedAt: row.revokedAt,
      expiresAt: row.expiresAt,
      now,
    });

    if (state === 'INVALID') {
      return { state: 'INVALID' };
    }

    if (state === 'EXPIRED') {
      // Separate query rather than an `include` on the row lookup above:
      // keeps the READY/INVALID paths (the overwhelming majority of calls)
      // free of an extra join, mirroring `portal-session.service.ts`'s own
      // separate `clinic.findUnique` for the READY path's `clinicPhone`.
      const clinic = (await this.prisma.clinic.findUnique({
        where: { id: row.clinicId },
        select: { contactPhone: true },
      })) as { contactPhone: string } | null;

      return {
        state: 'EXPIRED',
        magicLinkId: row.id,
        clinicId: row.clinicId,
        ownerId: row.ownerId,
        clinicPhone: clinic?.contactPhone ?? '',
      };
    }

    return { state: 'READY', data: this.accessScopeService.deriveScope(row) };
  }
}
