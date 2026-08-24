import type { Server } from 'socket.io';
import { BROWSER_SYNC_EVENTS, type BrowserSyncChangeMetadata } from './socket.events.js';

export interface BuildChangeMetadataInput {
  updatedAt: Date;
  changedByUserId?: string | null;
  changedByName?: string | null;
  reviewPath: string;
}

export type StaleStatus = 'fresh' | 'stale';

/** `WriteVersionCheck` result for `BrowserSyncService.checkWriteVersion` -- see that method's header. */
export type WriteVersionCheck = 'ok' | 'stale';

/**
 * Plan 10-05: a `no-mistakes` review of the merged Phase 9 branch found that
 * `knownVersion` (`resolveStaleStatus` above) is READ-ONLY -- no browser
 * mutation endpoint ever verified a caller's claimed version before
 * writing, so `StaleStateBanner`'s "conflict" state was never backed by a
 * real server-side rejection (a stale browser tab could silently clobber a
 * row a mobile replay or another browser session just changed). This is
 * the shape a rejected write reports back, deliberately mirroring
 * `SyncConflictEnvelope`'s (`@breeyo/types`) domain/entityType/entityId/
 * severity fields -- `currentVersion`/`expectedVersion` stand in for that
 * envelope's `localPayload`/`serverPayload` because this rejection happens
 * BEFORE any write is attempted, so there is no local-payload-that-was-applied
 * to snapshot, only the version mismatch that stopped it.
 */
export interface BrowserWriteConflictInfo {
  domain: string;
  entityType: string;
  entityId: string;
  currentVersion: number;
  expectedVersion: number;
}

export interface BrowserWriteConflictError extends Error {
  statusCode: number;
  code: string;
  conflict: BrowserWriteConflictInfo & { severity: 'OPERATIONAL' };
}

/**
 * D-05: review before overwrite, not silent last-write-wins -- for the
 * browser mutation side of an offline-recovery race, same as
 * `ReplayIngestService`'s `openConflict` deferral does for mobile replay.
 * `severity` is always `'OPERATIONAL'`: a browser tab racing a stale write
 * against another session's edit is an operational conflict (D-10), never
 * the clinical/safety-critical kind `SyncConflictRecord` reserves for EMR.
 */
export function staleWriteConflictError(info: BrowserWriteConflictInfo): BrowserWriteConflictError {
  const error = new Error(
    'This record changed elsewhere while you were viewing it. Refresh and review before retrying.',
  ) as BrowserWriteConflictError;
  error.statusCode = 409;
  error.code = 'STALE_WRITE_CONFLICT';
  error.conflict = { ...info, severity: 'OPERATIONAL' };
  return error;
}

/**
 * Browser-only stale-state mapping and realtime fan-out for the queue and
 * billing workbenches (Plan 09-04, D-40, D-42, D-43).
 *
 * Two independent jobs live here, both driven by the same
 * `BrowserSyncChangeMetadata` shape:
 *
 *  1. `buildChangeMetadata`/`resolveStaleStatus` -- pure functions that
 *     `web-queue.service.ts` and `billing-workbench.service.ts` call on every
 *     read to attach per-row "who changed this, and is my copy stale"
 *     metadata to their responses, so a stale/conflict prompt can render on
 *     the very first load with no realtime connection required.
 *  2. `emitQueueSync`/`emitBillingSync` -- an optional realtime push on top
 *     of that, for a browser tab that is already open when the change
 *     happens. D-42: these are narrow, per-record events on their own
 *     browser-only channel (`socket.events.ts`), not a blanket toast fired
 *     for every write the way a naive "just re-emit QUEUE_UPDATED louder"
 *     approach would.
 *
 * `io` is optional and may be `null` (unit tests, or a caller that only
 * wants the pure metadata mapping) -- every emit method is a no-op in that
 * case rather than throwing, matching `QueueService`'s own `io: Server |
 * null` constructor parameter.
 */
export class BrowserSyncService {
  constructor(private readonly io: Server | null = null) {}

  /**
   * D-40/D-43: maps a record's own `updatedAt` and actor into the four
   * inline fields every browser row/banner renders. `changedByUser` prefers
   * a resolved display name, falls back to the raw user id when no name
   * lookup succeeded, and is `null` (never a placeholder string) when no
   * actor is known at all.
   */
  buildChangeMetadata(input: BuildChangeMetadataInput): BrowserSyncChangeMetadata {
    return {
      staleVersion: input.updatedAt.getTime(),
      changedByUser: input.changedByName ?? input.changedByUserId ?? null,
      changedAt: input.updatedAt.toISOString(),
      reviewPath: input.reviewPath,
    };
  }

  /**
   * D-40: `undefined`/`null` means the caller has never seen a version of
   * this record yet (first load), which is `fresh` by definition -- there is
   * nothing to be behind. Otherwise `stale` the moment the caller's known
   * version is older than the server's, so a write against outdated state
   * surfaces a prompt instead of silently overwriting what changed elsewhere.
   */
  resolveStaleStatus(serverVersion: number, clientKnownVersion?: number | null): StaleStatus {
    if (clientKnownVersion === undefined || clientKnownVersion === null) {
      return 'fresh';
    }
    return clientKnownVersion >= serverVersion ? 'fresh' : 'stale';
  }

  /**
   * Plan 10-05, D-05: the write-side counterpart to `resolveStaleStatus`.
   * `undefined`/`null` means the caller sent no `expectedVersion` claim at
   * all -- always `'ok'`, so this is a strictly additive check that never
   * breaks an existing caller that has not adopted `expectedVersion` yet.
   */
  checkWriteVersion(currentVersion: number, expectedVersion?: number | null): WriteVersionCheck {
    if (expectedVersion === undefined || expectedVersion === null) {
      return 'ok';
    }
    return expectedVersion < currentVersion ? 'stale' : 'ok';
  }

  /** D-42: one queue entry's change, on the browser-only queue channel -- never the shared mobile `QUEUE_UPDATED` event. */
  emitQueueSync(clinicId: string, payload: BrowserSyncChangeMetadata & { entryId: string }): void {
    this.io?.to(`clinic:${clinicId}`).emit(BROWSER_SYNC_EVENTS.QUEUE_BOARD_SYNC, payload);
  }

  /** D-42: one invoice's change, on the browser-only billing channel. */
  emitBillingSync(clinicId: string, payload: BrowserSyncChangeMetadata & { invoiceId: string }): void {
    this.io?.to(`clinic:${clinicId}`).emit(BROWSER_SYNC_EVENTS.BILLING_WORKBENCH_SYNC, payload);
  }
}
