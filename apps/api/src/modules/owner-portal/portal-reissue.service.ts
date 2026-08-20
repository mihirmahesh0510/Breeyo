import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { computeMagicLinkExpiry, OWNER_PORTAL_REISSUE_DAILY_LIMIT } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { hashMagicLinkToken } from '../../lib/magic-link-hash.js';
import type { WhatsAppService, WaActor } from '../whatsapp/whatsapp.service.js';
import type { MagicLinkResolution } from './magic-link.service.js';

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PortalReissueResult =
  | { status: 'REISSUED'; whatsappMessageId: string }
  | { status: 'LIMIT_REACHED' }
  | { status: 'NOT_EXPIRED' }
  | { status: 'INVALID' };

interface OldLinkRow {
  id: string;
  clinicId: string;
  ownerId: string;
  defaultTab: string;
  allowedPetIdsJson: unknown;
  allowedInvoiceIdsJson: unknown;
}

/**
 * WhatsApp-driven expired-link recovery, capped at
 * `OWNER_PORTAL_REISSUE_DAILY_LIMIT` (3) per owner per rolling 24 hours
 * (D-82). Only ever called for an `EXPIRED` resolution — `owner-portal.
 * routes.ts`'s reissue route does NOT run the shared `requirePortalScope`
 * preHandler (that one only accepts `READY`), so this service re-checks the
 * resolution's state itself rather than trusting the caller.
 *
 * Delegates the actual send to `WhatsAppService.sendTemplate` — the same
 * persist-then-enqueue pipeline every other outbound message uses
 * (07-RESEARCH § Pattern 2) — rather than building a second send path.
 */
export class PortalReissueService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly whatsAppService: Pick<WhatsAppService, 'sendTemplate'>,
    private readonly portalBaseUrl: string,
  ) {}

  async reissue(resolution: MagicLinkResolution): Promise<PortalReissueResult> {
    if (resolution.state === 'READY') {
      return { status: 'NOT_EXPIRED' };
    }
    if (resolution.state === 'INVALID') {
      return { status: 'INVALID' };
    }

    const since = new Date(Date.now() - ROLLING_WINDOW_MS);
    const recentReissueCount = await this.db.ownerPortalMagicLink.count({
      where: {
        ownerId: resolution.ownerId,
        reissuedFromLinkId: { not: null },
        issuedAt: { gte: since },
      },
    });

    if (recentReissueCount >= OWNER_PORTAL_REISSUE_DAILY_LIMIT) {
      return { status: 'LIMIT_REACHED' };
    }

    const oldLink = (await this.db.ownerPortalMagicLink.findUnique({
      where: { id: resolution.magicLinkId },
    })) as OldLinkRow | null;

    if (!oldLink) {
      return { status: 'INVALID' };
    }

    const rawToken = randomBytes(32).toString('hex');
    const issuedAt = new Date();
    const expiresAt = computeMagicLinkExpiry(issuedAt);

    const newLink = (await this.db.ownerPortalMagicLink.create({
      data: {
        clinicId: oldLink.clinicId,
        ownerId: oldLink.ownerId,
        tokenHash: hashMagicLinkToken(rawToken),
        defaultTab: oldLink.defaultTab,
        deepLinkType: null,
        deepLinkEntityId: null,
        allowedPetIdsJson: oldLink.allowedPetIdsJson as Prisma.InputJsonValue,
        allowedInvoiceIdsJson: oldLink.allowedInvoiceIdsJson as Prisma.InputJsonValue,
        issuedAt,
        expiresAt,
        reissuedFromLinkId: oldLink.id,
      },
    })) as { id: string };

    // Best-effort forward pointer on the old row (D-67 lineage). Never fails
    // the reissue itself — the new link is already live even if this write
    // does not land.
    await this.db.ownerPortalMagicLink
      .update({ where: { id: oldLink.id }, data: { latestReissueLinkId: newLink.id } })
      .catch(() => undefined);

    const owner = await this.db.petOwner.findUnique({
      where: { id: oldLink.ownerId },
      select: { name: true, mobile: true },
    });

    const ownerName = (owner as { name: string } | null)?.name ?? 'there';
    const waPhone = (owner as { mobile: string } | null)?.mobile ?? '';
    const portalLink = `${this.portalBaseUrl}/${rawToken}`;

    const actor: WaActor = { clinicId: oldLink.clinicId, userId: null };
    const { messageId } = await this.whatsAppService.sendTemplate(
      {
        ownerId: oldLink.ownerId,
        waPhone,
        templateKey: 'owner_portal_link',
        variables: { owner_name: ownerName, portal_link: portalLink },
        contextType: 'GENERAL',
      },
      actor,
    );

    return { status: 'REISSUED', whatsappMessageId: messageId };
  }
}
