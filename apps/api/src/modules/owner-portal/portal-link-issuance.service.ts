import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { computeMagicLinkExpiry } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { hashMagicLinkToken } from '../../lib/magic-link-hash.js';
import type { WhatsAppService, WaActor } from '../whatsapp/whatsapp.service.js';

export type PortalLinkIssuanceResult =
  | { status: 'ISSUED'; whatsappMessageId: string }
  | { status: 'ALREADY_ACTIVE' }
  | { status: 'NO_PHONE' };

/**
 * Issues an owner's FIRST-EVER `OwnerPortalMagicLink` (D-84,
 * PHASE-09-VERIFY-FIX-PLAN.md finding 9.1). Before this service existed, no
 * production code path ever created a link outside `PortalReissueService`'s
 * rotation of an already-expired one — there was no trigger for the very
 * first link at all, so the entire owner portal was unreachable by any real
 * owner.
 *
 * D-84 piggybacks this on invoice finalization (`InvoiceService.finalize`)
 * rather than a separate staff-triggered action or firing on every completed
 * consultation. Callers pass only `clinicId`/`ownerId` — this service is the
 * ONLY place that decides the new link's scope, by querying the owner's
 * CURRENT pet/invoice rows itself (never a caller-supplied list), so a
 * returning owner with multiple pets/invoices sees all of them, not just
 * whichever invoice happened to trigger issuance (T-09-14, T-09-15's
 * "server-authoritative scope" invariant, applied at issuance time instead
 * of at read time).
 *
 * Idempotent per owner: if the owner already holds a non-revoked,
 * non-expired link, this is a no-op (`ALREADY_ACTIVE`) — a returning owner
 * with several invoices must not get a new WhatsApp message and a new link
 * on every single one.
 *
 * Shaped after `PortalReissueService`'s create-and-send pipeline (same raw
 * token generation, same `owner_portal_link` template, same
 * `WhatsAppService.sendTemplate` delegation) — this is a sibling trigger for
 * the same kind of row, not a second send pipeline.
 */
export class PortalLinkIssuanceService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly whatsAppService: Pick<WhatsAppService, 'sendTemplate'>,
    private readonly portalBaseUrl: string,
  ) {}

  async issueFirstLinkIfNeeded(
    clinicId: string,
    ownerId: string,
    now: Date = new Date(),
  ): Promise<PortalLinkIssuanceResult> {
    const existingActive = await this.db.ownerPortalMagicLink.findFirst({
      where: {
        clinicId,
        ownerId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });

    if (existingActive) {
      return { status: 'ALREADY_ACTIVE' };
    }

    const owner = (await this.db.petOwner.findUnique({
      where: { id: ownerId },
      select: { name: true, mobile: true },
    })) as { name: string; mobile: string } | null;

    const waPhone = owner?.mobile ?? '';
    if (!waPhone) {
      // No WhatsApp number on file: nothing to send to, and creating a link
      // nobody can reach would just be a dead row. Finalize must not fail
      // over this (T-09's owner-portal issuance is a side effect, never a
      // billing invariant) — the clinic can still issue a link once the
      // owner's number is corrected, on their next finalized invoice.
      return { status: 'NO_PHONE' };
    }

    // Fresh, server-side queries for the owner's CURRENT full pet/invoice
    // set — never the single invoice that triggered this call, and never
    // anything a caller supplies. `status: { not: 'DRAFT' }` excludes
    // invoices the owner has never actually been billed for (a DRAFT is
    // internal front-desk state); every other status (FINALIZED, UNPAID,
    // PARTIALLY_PAID, PAID, OVERDUE, VOIDED) is a document the clinic has
    // already produced for this owner and belongs in their portal history.
    const [pets, invoices] = await Promise.all([
      this.db.pet.findMany({ where: { clinicId, ownerId }, select: { id: true } }),
      this.db.invoice.findMany({
        where: { clinicId, ownerId, status: { not: 'DRAFT' } },
        select: { id: true },
      }),
    ]);

    const rawToken = randomBytes(32).toString('hex');
    const issuedAt = now;
    const expiresAt = computeMagicLinkExpiry(issuedAt);

    await this.db.ownerPortalMagicLink.create({
      data: {
        clinicId,
        ownerId,
        tokenHash: hashMagicLinkToken(rawToken),
        defaultTab: 'OVERVIEW',
        deepLinkType: null,
        deepLinkEntityId: null,
        allowedPetIdsJson: pets.map((pet) => pet.id) as Prisma.InputJsonValue,
        allowedInvoiceIdsJson: invoices.map((invoice) => invoice.id) as Prisma.InputJsonValue,
        issuedAt,
        expiresAt,
      },
    });

    const ownerName = owner?.name ?? 'there';
    const portalLink = `${this.portalBaseUrl}/${rawToken}`;
    const actor: WaActor = { clinicId, userId: null };

    const { messageId } = await this.whatsAppService.sendTemplate(
      {
        ownerId,
        waPhone,
        templateKey: 'owner_portal_link',
        variables: { owner_name: ownerName, portal_link: portalLink },
        contextType: 'GENERAL',
      },
      actor,
    );

    return { status: 'ISSUED', whatsappMessageId: messageId };
  }
}
