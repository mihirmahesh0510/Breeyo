import { create } from 'zustand';
import type { PendingOperationError } from '../services/offline-queue.service';

interface OfflineQueueState {
  pendingCount: number;
  lastSyncTime: Date | null;
  isSyncing: boolean;
  /** D-59: most recent per-operation failure from `OfflineQueueService.syncPending`,
   *  surfaced by the retry banner ("N operations pending -- Tap to review"). */
  lastError: PendingOperationError | null;

  setPendingCount: (count: number) => void;
  setLastSyncTime: (time: Date) => void;
  setIsSyncing: (syncing: boolean) => void;
  setLastError: (error: PendingOperationError | null) => void;
}

/**
 * Note on persistence: the plan sketch for this store mentioned zustand's
 * `persist` middleware. Not applied here -- `pendingCount`/`lastSyncTime`
 * are always recomputed from `OfflineQueueService`'s sqlite table on every
 * app start (see useOfflineSync.ts), which is the actual source of truth,
 * and `@react-native-async-storage/async-storage` (the storage adapter
 * `persist` needs) is not installed anywhere in this monorepo. Persisting a
 * derived value with a new dependency would add no correctness benefit over
 * re-deriving it from sqlite on mount.
 */
export const useOfflineQueueStore = create<OfflineQueueState>((set) => ({
  pendingCount: 0,
  lastSyncTime: null,
  isSyncing: false,
  lastError: null,

  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setLastError: (lastError) => set({ lastError }),
}));
