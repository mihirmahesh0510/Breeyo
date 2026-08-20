import type { z } from 'zod';
import type { sessionRestoreStateSchema } from '@breeyo/validators';
import type { OwnerPortalDeepLinkTarget, OwnerPortalPetSummary, OwnerPortalTabId } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { OwnerPortalTokenScope } from './access-scope.service.js';

export type SessionRestoreState = z.infer<typeof sessionRestoreStateSchema>;

const EMPTY_RESTORE_STATE: SessionRestoreState = {
  lastTab: null,
  lastPetId: null,
  lastInvoiceId: null,
  lastVisitId: null,
  lastCheckoutSessionId: null,
  lastReturnState: null,
};

export interface PortalSessionData {
  magicLinkId: string;
  defaultTab: OwnerPortalTabId;
  ownerName: string;
  pets: OwnerPortalPetSummary[];
  totalDuePaise: number;
  deepLink: OwnerPortalDeepLinkTarget | null;
  restore: SessionRestoreState;
}

/**
 * Assembles the owner-portal overview/session payload and persists the D-53
 * session-restore state (`OwnerPortalSessionState`).
 *
 * Constructed with a `TenantPrismaClient` already scoped to the validated
 * link's `clinicId` — every query here is clinic-RLS-bound, and every id it
 * queries by (`scope.ownerId`, `scope.allowedPetIds`, `scope.allowedInvoiceIds`)
 * came from `AccessScopeService.deriveScope`, never from the client.
 */
export class PortalSessionService {
  constructor(private readonly db: TenantPrismaClient) {}

  async getSession(scope: OwnerPortalTokenScope): Promise<PortalSessionData> {
    const [owner, pets, invoices, restore] = await Promise.all([
      this.db.petOwner.findUnique({ where: { id: scope.ownerId }, select: { name: true } }),
      this.db.pet.findMany({
        where: { id: { in: scope.allowedPetIds } },
        select: { id: true, name: true, species: true, photoUrl: true },
      }),
      this.db.invoice.findMany({
        where: { id: { in: scope.allowedInvoiceIds } },
        select: { id: true, petId: true, balancePaise: true },
      }),
      this.loadRestoreState(scope.magicLinkId),
    ]);

    // Best-effort: a failed touch must never fail the session read (D-53's
    // "remember where the owner left off" is a nice-to-have, not a gate).
    await this.touchLastViewedAt(scope.magicLinkId).catch(() => undefined);

    const balanceByPet = new Map<string, number>();
    for (const invoice of invoices as Array<{ id: string; petId: string | null; balancePaise: number }>) {
      if (!invoice.petId) continue;
      balanceByPet.set(invoice.petId, (balanceByPet.get(invoice.petId) ?? 0) + invoice.balancePaise);
    }

    const petList = pets as Array<{
      id: string;
      name: string;
      species: string;
      photoUrl: string | null;
    }>;

    const petSummaries: OwnerPortalPetSummary[] = petList.map((pet) => ({
      petId: pet.id,
      name: pet.name,
      species: pet.species,
      photoUrl: pet.photoUrl,
      hasUnpaidInvoice: (balanceByPet.get(pet.id) ?? 0) > 0,
    }));

    const totalDuePaise = (invoices as Array<{ balancePaise: number }>).reduce(
      (sum, invoice) => sum + invoice.balancePaise,
      0,
    );

    const deepLink: OwnerPortalDeepLinkTarget | null = scope.deepLinkType
      ? scope.deepLinkType === 'OVERVIEW'
        ? { type: 'OVERVIEW' }
        : { type: scope.deepLinkType, entityId: scope.deepLinkEntityId ?? undefined }
      : null;

    return {
      magicLinkId: scope.magicLinkId,
      defaultTab: scope.defaultTab,
      ownerName: (owner as { name: string } | null)?.name ?? '',
      pets: petSummaries,
      totalDuePaise,
      deepLink,
      restore,
    };
  }

  /** D-53: persists last tab/pet/invoice/visit/checkout/return-state, upsert-by-hand
   * because `OwnerPortalSessionState.magicLinkId` is indexed but not unique. */
  async updateRestoreState(magicLinkId: string, patch: Partial<SessionRestoreState>): Promise<void> {
    const existing = await this.db.ownerPortalSessionState.findFirst({
      where: { magicLinkId },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      await this.db.ownerPortalSessionState.update({
        where: { id: (existing as { id: string }).id },
        data: patch,
      });
      return;
    }

    await this.db.ownerPortalSessionState.create({
      data: { magicLinkId, ...EMPTY_RESTORE_STATE, ...patch },
    });
  }

  private async loadRestoreState(magicLinkId: string): Promise<SessionRestoreState> {
    const row = await this.db.ownerPortalSessionState.findFirst({
      where: { magicLinkId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!row) {
      return { ...EMPTY_RESTORE_STATE };
    }

    const restoreRow = row as {
      lastTab: string | null;
      lastPetId: string | null;
      lastInvoiceId: string | null;
      lastVisitId: string | null;
      lastCheckoutSessionId: string | null;
      lastReturnState: string | null;
    };

    return {
      lastTab: restoreRow.lastTab as SessionRestoreState['lastTab'],
      lastPetId: restoreRow.lastPetId,
      lastInvoiceId: restoreRow.lastInvoiceId,
      lastVisitId: restoreRow.lastVisitId,
      lastCheckoutSessionId: restoreRow.lastCheckoutSessionId,
      lastReturnState: restoreRow.lastReturnState as SessionRestoreState['lastReturnState'],
    };
  }

  private async touchLastViewedAt(magicLinkId: string): Promise<void> {
    await this.db.ownerPortalMagicLink.update({
      where: { id: magicLinkId },
      data: { lastViewedAt: new Date() },
    });
  }
}
