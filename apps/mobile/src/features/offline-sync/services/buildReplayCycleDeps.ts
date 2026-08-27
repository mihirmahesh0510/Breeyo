/**
 * F2 (Phase 10 review-fix): real `ReplayCycleDeps` for `runReplayCycle`
 * (syncCoordinator.ts), which previously had zero production callers. Kept
 * as a plain function of `{ db, deviceId, accessToken }` rather than a hook
 * -- `ConnectivityReplayProvider.tsx` is the only caller and it already has
 * `useAuth()`'s `accessToken` and a resolved on-device `db`/`deviceId`; this
 * module just assembles them into the shape `runReplayCycle` expects.
 *
 * No `react-native`/NetInfo import here -- only `expo-sqlite` (via
 * `offlineDb.ts`, type-only here) and this app's own `apiClient`/zustand
 * stores, matching `offlineStockActionStore.ts`'s / `offlineConsultationDraftStore.ts`'s
 * own "no RN import needed" convention.
 */
import type * as SQLite from 'expo-sqlite';
import type { ReplayPriority } from '@breeyo/types';
import { apiClient, ApiClientError } from '../../../lib/api';
import {
  clearWorkingSetAnchor,
  listPendingSyncOperationsByPriority,
  markSyncOperationSynced,
} from '../db/offlineDb';
import { useQueueOfflineStore } from '../../queue/store/queueOfflineStore';
import { QUEUE_SYNC_DOMAIN } from '../../queue/lib/queue-offline-utils';
import { useInventoryOfflineSyncStore } from '../../inventory/store/inventoryOfflineSyncStore';
import { INVENTORY_SYNC_DOMAIN } from '../../inventory/services/offlineStockActionStore';
import { EMR_SYNC_DOMAIN } from '../../consultation/services/offlineConsultationDraftStore';
import type { ReplayableOperation, ReplayCycleDeps, ReplayOperationOutcome } from './syncCoordinator';

/**
 * Wire contract with each domain's own `*Sync.controller.ts` (apps/api):
 * `POST { deviceId, operations: [envelope] }` -> `{ data: { acknowledgedOperationIds, rejectedOperations } }`.
 * `sendOperation` below only ever sends ONE envelope per call (matching
 * `ReplayCycleDeps.sendOperation`'s "sends exactly one operation" contract),
 * so only that one operationId is ever looked up in the response.
 */
const REPLAY_PATH_BY_DOMAIN: Record<string, string> = {
  [QUEUE_SYNC_DOMAIN]: '/api/v1/queue/sync/replay',
  [INVENTORY_SYNC_DOMAIN]: '/api/v1/inventory/sync/replay',
  [EMR_SYNC_DOMAIN]: '/api/v1/consultations/sync/replay',
};

interface DomainReplayResponse {
  data: {
    acknowledgedOperationIds: string[];
    rejectedOperations?: { operationId: string; message?: string }[];
  };
}

export interface BuildReplayCycleDepsInput {
  db: SQLite.SQLiteDatabase;
  deviceId: string;
  accessToken: string;
}

function failOperation(operation: ReplayableOperation, errorCode: string): ReplayOperationOutcome {
  // D-18/D-19: only the queue domain has a per-entry local projection
  // (`queueOfflineStore.ts`) an optimistic card renders off of -- inventory
  // and EMR have no analogous per-entry store to update on a failed replay
  // (the on-device working-set snapshot they DO have is left untouched here,
  // matching D-10's lighter operational-review posture for those domains).
  if (operation.envelope.domain === QUEUE_SYNC_DOMAIN) {
    useQueueOfflineStore.getState().markReplayFailed(operation.envelope.entityId);
  }
  return { operationId: operation.operationId, succeeded: false, errorCode };
}

async function sendOperation(
  operation: ReplayableOperation,
  input: BuildReplayCycleDepsInput,
): Promise<ReplayOperationOutcome> {
  const path = REPLAY_PATH_BY_DOMAIN[operation.envelope.domain];
  if (!path) {
    return failOperation(operation, 'UNKNOWN_DOMAIN');
  }

  let response: DomainReplayResponse;
  try {
    response = await apiClient<DomainReplayResponse>(path, {
      method: 'POST',
      token: input.accessToken,
      body: JSON.stringify({ deviceId: input.deviceId, operations: [operation.envelope] }),
    });
  } catch (error) {
    // A non-2xx response (including the EMR replay route's 409 for a newly
    // created clinical conflict) is indistinguishable here from a genuine
    // rejection -- `apiClient` only surfaces `error.error.*`, not the
    // `{ data: ... }` body the 409 case actually carries. Treating it as
    // not-succeeded is safe either way: the operation stays in the local
    // ledger and is retried next cycle, and every domain's replay service
    // records a receipt before returning a conflict/review outcome, so the
    // retry resolves as an idempotent acknowledged duplicate rather than
    // creating a second conflict.
    return failOperation(operation, error instanceof ApiClientError ? error.code : 'NETWORK_ERROR');
  }

  if (!response.data.acknowledgedOperationIds.includes(operation.operationId)) {
    const rejected = response.data.rejectedOperations?.find(
      (entry) => entry.operationId === operation.operationId,
    );
    return failOperation(operation, rejected?.message ?? 'DEFERRED');
  }

  await markSyncOperationSynced(input.db, operation.operationId);

  if (operation.envelope.domain === QUEUE_SYNC_DOMAIN) {
    // A confirmed replay means the server now holds this queue entry as its
    // own authoritative record -- clear the optimistic local override so the
    // card stops showing PENDING and the next board fetch renders the real
    // synced copy instead (this is the exact gap F2 flags: without a real
    // caller wiring `markReplaySucceeded`/`clearLocalEntry` in, an offline
    // check-in stayed PENDING forever even after the server had it).
    useQueueOfflineStore.getState().markReplaySucceeded(operation.envelope.entityId);
    useQueueOfflineStore.getState().clearLocalEntry(operation.envelope.entityId);
  }

  if (operation.envelope.domain === INVENTORY_SYNC_DOMAIN) {
    // F8: `useOfflineStockActions.ts` increments this counter the moment a
    // stock action is captured offline (`BarcodeScannerScreen.tsx`'s
    // "N stock update(s) pending sync" banner reads it) but nothing ever
    // decremented it -- a confirmed replay is exactly the event that should.
    useInventoryOfflineSyncStore.getState().decrementPending();
  }

  return { operationId: operation.operationId, succeeded: true };
}

export function buildReplayCycleDeps(input: BuildReplayCycleDepsInput): ReplayCycleDeps {
  return {
    getPendingOperations: (priority: ReplayPriority) => listPendingSyncOperationsByPriority(input.db, priority),
    sendOperation: (operation) => sendOperation(operation, input),
    clearWorkingSetAnchor: () => clearWorkingSetAnchor(input.db),
  };
}
