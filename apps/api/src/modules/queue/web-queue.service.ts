import type { QueueStatus } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { BrowserSyncChangeMetadata } from '../../realtime/socket.events.js';
import { BrowserSyncService } from '../../realtime/browser-sync.service.js';
import type { QueueService } from './queue.service.js';

/** A raw queue entry as `QueueService.getQueueBoard`/`updateStatus` return it (pet + owner included). */
interface RawQueueEntry {
  id: string;
  petId: string;
  checkedInBy: string;
  treatingVetId: string | null;
  status: string;
  isEmergency: boolean;
  visitReason: string | null;
  checkedInAt: Date | null;
  queuePriorityAt: Date;
  updatedAt: Date;
  computedPosition?: number;
  estimatedWaitSeconds?: number;
  pet?: { name: string; owner?: { name: string } | null } | null;
}

export interface WebQueueEntry {
  id: string;
  petId: string;
  petName: string | null;
  ownerName: string | null;
  status: string;
  isEmergency: boolean;
  visitReason: string | null;
  checkedInAt: string | null;
  queuePriorityAt: string;
  computedPosition?: number;
  estimatedWaitSeconds?: number;
  /** D-07/D-41: true only for the `expectedArrivals` section -- never merged into `waiting`. */
  isExpectedArrival: boolean;
  /** D-40/D-43: per-entry stale/actor metadata. */
  changeMetadata: BrowserSyncChangeMetadata;
}

export interface WebQueueBoard {
  expectedArrivals: WebQueueEntry[];
  waiting: WebQueueEntry[];
  inConsult: WebQueueEntry[];
  done: WebQueueEntry[];
  /** D-40: whole-board freshness relative to the caller's last known version. */
  staleState: 'fresh' | 'stale';
  serverUpdatedAt: string;
}

/**
 * Browser queue workbench (Plan 09-04, D-07, D-40, D-41, D-43): wraps the
 * existing Phase 3/8 `QueueService` rather than replacing it -- every
 * mutation still runs through `QueueService.updateStatus`, so the state
 * machine, socket broadcast, and push-trigger side effects it already owns
 * stay identical between mobile and browser. This class only adds what the
 * browser workbench needs on top: a distinct expected-arrivals section
 * (D-07: queue stays queue-first, never a week calendar), actor display
 * names, and D-40 stale-version metadata per row.
 */
export class WebQueueService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly queueService: QueueService,
    private readonly browserSyncService: BrowserSyncService = new BrowserSyncService(null),
  ) {}

  /** D-07, D-40, D-41, D-43: the one browser queue read. */
  async getBoard(clinicId: string, userId: string, clientKnownVersion?: number): Promise<WebQueueBoard> {
    const board = (await this.queueService.getQueueBoard({ clinicId })) as {
      expected: RawQueueEntry[];
      waiting: RawQueueEntry[];
      inConsult: RawQueueEntry[];
      done: RawQueueEntry[];
    };

    const allEntries = [...board.expected, ...board.waiting, ...board.inConsult, ...board.done];
    const nameByUserId = await this.resolveActorNames(allEntries);

    const toEntry = (entry: RawQueueEntry, isExpectedArrival: boolean): WebQueueEntry => {
      const actorUserId = entry.treatingVetId ?? entry.checkedInBy;
      return {
        id: entry.id,
        petId: entry.petId,
        petName: entry.pet?.name ?? null,
        ownerName: entry.pet?.owner?.name ?? null,
        status: entry.status,
        isEmergency: entry.isEmergency,
        visitReason: entry.visitReason,
        checkedInAt: entry.checkedInAt ? entry.checkedInAt.toISOString() : null,
        queuePriorityAt: entry.queuePriorityAt.toISOString(),
        computedPosition: entry.computedPosition,
        estimatedWaitSeconds: entry.estimatedWaitSeconds,
        isExpectedArrival,
        changeMetadata: this.browserSyncService.buildChangeMetadata({
          updatedAt: entry.updatedAt,
          changedByUserId: actorUserId,
          changedByName: nameByUserId.get(actorUserId) ?? null,
          reviewPath: `/queue?entryId=${entry.id}`,
        }),
      };
    };

    const expectedArrivals = board.expected.map((entry) => toEntry(entry, true));
    const waiting = board.waiting.map((entry) => toEntry(entry, false));
    const inConsult = board.inConsult.map((entry) => toEntry(entry, false));
    const done = board.done.map((entry) => toEntry(entry, false));

    const serverVersion = Math.max(
      0,
      ...[...expectedArrivals, ...waiting, ...inConsult, ...done].map((entry) => entry.changeMetadata.staleVersion),
    );

    return {
      expectedArrivals,
      waiting,
      inConsult,
      done,
      staleState: this.browserSyncService.resolveStaleStatus(serverVersion, clientKnownVersion),
      serverUpdatedAt: new Date(serverVersion).toISOString(),
    };
  }

  /**
   * D-43: status change, same state machine as mobile, plus browser-sync
   * metadata on the response and a realtime push.
   *
   * Plan 10-05, D-05: when the caller sends `expectedVersion` (the last
   * `staleVersion` it rendered for this row), the write only applies if the
   * row's LIVE `updatedAt` still matches it -- a stale claim is rejected
   * with a 409 `STALE_WRITE_CONFLICT` instead of silently applying a write
   * against a view the caller has not refreshed since another session
   * (mobile replay or another browser tab) changed this row. Omitting
   * `expectedVersion` (every caller before this plan) is unaffected.
   *
   * Verify-fix 10.10: the check used to be a separate `findUnique` read
   * followed, several awaits later, by `QueueService.updateStatus`'s own
   * write -- two genuinely concurrent callers with the same stale
   * `expectedVersion` could both read the row BEFORE either had written,
   * both see themselves as current, and both proceed.
   *
   * That was tightened to an atomic conditional `updateMany` claim run
   * BEFORE `QueueService.updateStatus`, but that introduced a different gap:
   * the claim always committed a fresh `updatedAt`, even when the
   * downstream state-machine transition then turned out to be invalid --
   * bumping the version with no real change applied, so a second, genuinely
   * current caller got a false 409. `QueueService.updateStatus` now takes
   * `expectedVersion` itself and folds the version check into the SAME
   * conditional `updateMany` that applies the real field changes
   * (`QueueRepository.updateEntry`) -- there is no longer a separate write
   * that can commit ahead of (or independent of) the real mutation, so the
   * version only ever advances when a real change lands.
   */
  async updateEntryStatus(
    clinicId: string,
    userId: string,
    entryId: string,
    status: QueueStatus,
    expectedVersion?: number,
  ): Promise<WebQueueEntry & { changeMetadata: BrowserSyncChangeMetadata }> {
    const updated = (await this.queueService.updateStatus({
      clinicId,
      entryId,
      status,
      userId,
      expectedVersion,
    })) as RawQueueEntry;

    const changeMetadata = this.browserSyncService.buildChangeMetadata({
      updatedAt: updated.updatedAt,
      changedByUserId: userId,
      reviewPath: `/queue?entryId=${entryId}`,
    });

    this.browserSyncService.emitQueueSync(clinicId, { entryId, ...changeMetadata });

    return {
      id: updated.id,
      petId: updated.petId,
      petName: updated.pet?.name ?? null,
      ownerName: updated.pet?.owner?.name ?? null,
      status: updated.status,
      isEmergency: updated.isEmergency,
      visitReason: updated.visitReason,
      checkedInAt: updated.checkedInAt ? updated.checkedInAt.toISOString() : null,
      queuePriorityAt: updated.queuePriorityAt.toISOString(),
      isExpectedArrival: updated.status === 'EXPECTED',
      changeMetadata,
    };
  }

  /** Batches a name lookup for every distinct treating-vet/checked-in-by user id on the board, in one round trip. */
  private async resolveActorNames(entries: RawQueueEntry[]): Promise<Map<string, string>> {
    const ids = Array.from(new Set(entries.map((entry) => entry.treatingVetId ?? entry.checkedInBy)));
    if (ids.length === 0) {
      return new Map();
    }

    const users = (await this.db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    })) as Array<{ id: string; fullName: string }>;

    return new Map(users.map((user) => [user.id, user.fullName]));
  }
}
