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
  // WR-9: vestigial — carried forward below only as a legacy/debug snapshot.
  // `AccessScopeService` never reads these; scope is derived live from
  // `ownerId`/`clinicId` on every request, so a reissued link has exactly
  // the same (current, not frozen) access as the link it replaces.
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

    // PHASE-09-VERIFY-FIX-PLAN.md finding 9.4 / D-82: the count check and the
    // new-link create used to be two independent, unwrapped queries on
    // `this.db`. Two concurrent reissue calls for the same owner could each
    // read "count < limit" before either one's `create` committed, letting
    // more than `OWNER_PORTAL_REISSUE_DAILY_LIMIT` links through in the
    // rolling window. Serialized here the same way `queue.repository.ts`'s
    // `createEntryIfNoneActive` and `appointment.service.ts`'s D-34 slot
    // lock serialize their own check-then-create races: one `$transaction`
    // callback, with a `pg_advisory_xact_lock` keyed on `ownerId` taken
    // before the count read, so only reissue attempts for the SAME owner
    // ever block each other.
    const txOutcome = await this.db.$transaction(async (tx) => {
      const lockKey = `owner-portal-reissue|${resolution.ownerId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const since = new Date(Date.now() - ROLLING_WINDOW_MS);
      const recentReissueCount = await tx.ownerPortalMagicLink.count({
        where: {
          ownerId: resolution.ownerId,
          reissuedFromLinkId: { not: null },
          issuedAt: { gte: since },
        },
      });

      if (recentReissueCount >= OWNER_PORTAL_REISSUE_DAILY_LIMIT) {
        return { status: 'LIMIT_REACHED' as const };
      }

      const oldLink = (await tx.ownerPortalMagicLink.findUnique({
        where: { id: resolution.magicLinkId },
      })) as OldLinkRow | null;

      if (!oldLink) {
        return { status: 'INVALID' as const };
      }

      const rawToken = randomBytes(32).toString('hex');
      const issuedAt = new Date();
      const expiresAt = computeMagicLinkExpiry(issuedAt);

      const newLink = (await tx.ownerPortalMagicLink.create({
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

      return { status: 'CREATED' as const, oldLink, newLink, rawToken };
    });

    if (txOutcome.status === 'LIMIT_REACHED') {
      return { status: 'LIMIT_REACHED' };
    }
    if (txOutcome.status === 'INVALID') {
      return { status: 'INVALID' };
    }

    const { oldLink, newLink, rawToken } = txOutcome;

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
