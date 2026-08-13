import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../../../providers/AuthProvider';
import { OfflineBarcodeCache } from '../services/offline-barcode-cache';
import { OfflineQueueService, isConnectivityError } from '../services/offline-queue.service';
import { useOfflineQueueStore } from '../stores/offline-queue.store';

/** How often to retry while offline or while operations are still pending
 *  (no push-based connectivity event is available -- see the NOTE below). */
const RETRY_INTERVAL_MS = 30_000;

export interface UseOfflineSyncResult {
  isOffline: boolean;
  lastSynced: Date | null;
  pendingCount: number;
  syncNow: () => Promise<void>;
}

/**
 * D-19: owns the offline barcode cache + pending operations queue lifecycle
 * for the barcode scanner feature. Initializes both expo-sqlite-backed
 * services once per app session, syncs the barcode catalog and replays
 * pending operations on app foreground (RESEARCH.md Pitfall 6) and on a
 * retry timer while offline or while operations remain queued, and exposes
 * `isOffline` derived from the outcome of those real sync attempts.
 *
 * NOTE on network detection: neither `@react-native-community/netinfo` nor
 * `expo-network` is installed anywhere in this monorepo (checked
 * apps/mobile/package.json and grepped the whole repo before writing this --
 * see the 05-05-SUMMARY.md Task 1 section for the exact commands run).
 * Rather than add a new native dependency, this hook classifies `isOffline`
 * from whether its own sync calls fail with a connectivity-level error (a
 * raw fetch-level TypeError, e.g. "Network request failed") vs. a
 * structured `ApiClientError` (the request reached the server and got a
 * real HTTP response, so the device IS online even though that particular
 * operation failed) -- see `isConnectivityError` in offline-queue.service.ts.
 *
 * `apps/mobile/src/features/inventory/screens/InventoryListScreen.tsx` (built
 * by Plan 05-04, out of this task's file scope) currently has a local
 * `useIsOffline()` stub hardcoded to always return `false` with a
 * `TODO(Plan 05-05)` comment pointing here. That screen should be updated to
 * call `useOfflineSync().isOffline` instead of its stub -- left untouched in
 * this task since screens/components are explicitly out of scope for Task 1
 * (see 05-05-SUMMARY.md for the full note to whoever wires that up).
 */
export function useOfflineSync(): UseOfflineSyncResult {
  const { accessToken } = useAuth();
  const cacheRef = useRef<OfflineBarcodeCache | null>(null);
  const queueRef = useRef<OfflineQueueService | null>(null);
  if (!cacheRef.current) cacheRef.current = new OfflineBarcodeCache();
  if (!queueRef.current) queueRef.current = new OfflineQueueService();

  const [isOffline, setIsOffline] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(cacheRef.current.getLastSyncTime());

  const pendingCount = useOfflineQueueStore((s) => s.pendingCount);
  const setPendingCount = useOfflineQueueStore((s) => s.setPendingCount);
  const setStoreLastSyncTime = useOfflineQueueStore((s) => s.setLastSyncTime);
  const setIsSyncing = useOfflineQueueStore((s) => s.setIsSyncing);
  const setLastError = useOfflineQueueStore((s) => s.setLastError);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(queueRef.current!.getPendingCount());
  }, [setPendingCount]);

  const syncNow = useCallback(async () => {
    if (!accessToken) return;
    setIsSyncing(true);
    try {
      await cacheRef.current!.syncFromServer(accessToken);
      const now = new Date();
      setLastSynced(now);
      setStoreLastSyncTime(now);
      setIsOffline(false);

      const result = await queueRef.current!.syncPending(accessToken);
      queueRef.current!.clearSynced();
      refreshPendingCount();

      if (result.failed && result.error) {
        setLastError(result.error);
        if (result.error.isConnectivityError) setIsOffline(true);
      } else {
        setLastError(null);
      }
    } catch (error) {
      // The barcode-catalog sync itself failed. A connectivity-level error
      // means the device has no path to the API at all; a structured
      // ApiClientError means we reached the server but the request failed
      // for some other reason (still "online", so isOffline stays false).
      if (isConnectivityError(error)) {
        setIsOffline(true);
      }
    } finally {
      setIsSyncing(false);
      refreshPendingCount();
    }
  }, [accessToken, refreshPendingCount, setIsSyncing, setLastError, setStoreLastSyncTime]);

  // Initial pending-count read + sync attempt on mount.
  useEffect(() => {
    refreshPendingCount();
    void syncNow();
    // Intentionally run once per mount -- syncNow is stable enough via
    // useCallback, but re-running on every accessToken refresh would
    // re-trigger a full catalog+queue sync more often than desired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync whenever the app returns to the foreground (RESEARCH.md Pitfall 6).
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void syncNow();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [syncNow]);

  // Retry loop while offline or while operations remain queued -- stands in
  // for a push-based "connectivity restored" event since no netinfo-style
  // library is installed (see the NOTE in this file's doc comment above).
  useEffect(() => {
    if (!isOffline && pendingCount === 0) return;
    const interval = setInterval(() => {
      void syncNow();
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOffline, pendingCount, syncNow]);

  return { isOffline, lastSynced, pendingCount, syncNow };
}
