import { useCallback, useEffect } from 'react';
import {
  countPendingSyncOperations,
  getOfflineSyncDb,
  listUnresolvedSyncConflicts,
  listUnresolvedSyncFailureTasks,
} from '../db/offlineDb';
import { toFailureCenterItemFromConflict, toFailureCenterItemFromTask } from '../lib/sync-status';
import { useSyncUiStore } from '../store/syncUiStore';

const REFRESH_INTERVAL_MS = 5000;

/**
 * Aggregates the on-device replay ledger (`sync_operations`), conflict
 * table (`sync_conflicts`), and failure-task table (`sync_failure_tasks`)
 * into the shared `syncUiStore` (Plan 10-05 Task 1, D-18 to D-24).
 *
 * `SyncStatusBadge.tsx` and `SyncFailureCenterScreen.tsx` both read from
 * `useSyncUiStore` rather than calling this hook's return value directly --
 * this hook's only job is keeping that shared store current, polling on a
 * calm interval (D-19: no push infrastructure exists for local SQLite
 * writes, so a short poll is the same "cheap, good-enough" choice
 * `useOfflineQueueActions.ts`/`syncCoordinator.ts` already make elsewhere in
 * this feature for on-device state).
 */
export function useSyncStatus(): void {
  const refresh = useCallback(async () => {
    const db = await getOfflineSyncDb();

    const [pendingCount, failureTasks, conflicts] = await Promise.all([
      countPendingSyncOperations(db),
      listUnresolvedSyncFailureTasks(db),
      listUnresolvedSyncConflicts(db),
    ]);

    useSyncUiStore.getState().setSummary({
      pendingCount,
      // No live coordinator signal is wired into this on-device aggregate
      // yet (REPLAYING is transient, in-memory-only state on
      // `syncCoordinator.ts`'s side) -- 0 here means "not currently known
      // to be replaying," never a false claim that nothing is pending.
      replayingCount: 0,
      conflictCount: conflicts.length,
      failedCount: failureTasks.length,
    });

    useSyncUiStore.getState().setFailureItems([
      ...failureTasks.map(toFailureCenterItemFromTask),
      ...conflicts.map(toFailureCenterItemFromConflict),
    ]);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);
}
