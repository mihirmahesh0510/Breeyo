import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../../providers/AuthProvider';
import { countPendingSyncOperations, getOfflineSyncDb } from '../db/offlineDb';
import { runReplayCycle } from '../services/syncCoordinator';
import { buildReplayCycleDeps } from '../services/buildReplayCycleDeps';
import { createConnectivityReplayDriver, type ConnectivitySnapshot } from '../services/connectivityReplayDriver';
import { useSyncStatus } from '../hooks/useSyncStatus';

/** Same key `useOfflineQueueActions.ts` / `useOfflineStockActions.ts` /
 *  `useAutoSave.ts` each already generate-once-and-persist under -- this is
 *  the SAME device id those envelopes were enqueued with, not a second,
 *  differently-scoped one. */
const DEVICE_ID_SECURE_STORE_KEY = 'breeyo-offline-sync-device-id';

/** D-19-style "cheap, good-enough" fallback for a missed OS reconnect event
 *  (finding F2's explicit remediation ask), matching this feature's other
 *  polling intervals (`useSyncStatus.ts`'s 5s) being short but not tight. */
const PERIODIC_RECHECK_INTERVAL_MS = 60_000;

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_SECURE_STORE_KEY);
  if (existing) {
    return existing;
  }
  const generated = generateLocalId();
  await SecureStore.setItemAsync(DEVICE_ID_SECURE_STORE_KEY, generated);
  return generated;
}

function toConnectivitySnapshot(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): ConnectivitySnapshot {
  return { isConnected: state.isConnected, isInternetReachable: state.isInternetReachable };
}

/**
 * F2 (Phase 10 review-fix): mounts the ONE real production caller of
 * `runReplayCycle` -- until now nothing in the app ever constructed real
 * `ReplayCycleDeps` or triggered a replay cycle, so an offline-queued
 * operation could sit PENDING forever even after reconnect. Subscribes to
 * NetInfo, drives exactly one replay cycle per genuine offline->online
 * transition (via the RN-free, directly-tested `connectivityReplayDriver.ts`),
 * and re-checks on a periodic interval in case a reconnect event from the OS
 * is missed. Also runs `useSyncStatus()` so `syncUiStore` -- and the badge/
 * failure-center screen it feeds -- stays current from one mounted root, per
 * D-18 (sync state must always be visible during normal clinic use).
 *
 * Returns `null`: this is a mounted-effect component, not a visual one,
 * matching `useSyncStatus.ts`'s own "just an effect" precedent in this
 * feature. Rendered inside `AuthProvider` (see app/_layout.tsx) so
 * `useAuth()` is available; the listener itself only starts once the user is
 * authenticated AND has an active clinic -- no offline replay makes sense
 * pre-login.
 */
export function ConnectivityReplayProvider(): null {
  const { accessToken, activeClinicId, isAuthenticated } = useAuth();
  useSyncStatus();

  const contextRef = useRef({ accessToken, activeClinicId });
  contextRef.current = { accessToken, activeClinicId };

  const driverRef = useRef<ReturnType<typeof createConnectivityReplayDriver> | null>(null);
  if (!driverRef.current) {
    driverRef.current = createConnectivityReplayDriver({
      runReplayCycle: async () => {
        const { accessToken: token, activeClinicId: clinicId } = contextRef.current;
        if (!token || !clinicId) {
          return;
        }
        const db = await getOfflineSyncDb();
        const deviceId = await getOrCreateDeviceId();
        await runReplayCycle(buildReplayCycleDeps({ db, deviceId, accessToken: token }));
      },
      hasPendingWork: async () => {
        const db = await getOfflineSyncDb();
        return (await countPendingSyncOperations(db)) > 0;
      },
    });
  }

  const canReplay = isAuthenticated && !!accessToken && !!activeClinicId;

  useEffect(() => {
    if (!canReplay) {
      return undefined;
    }

    const driver = driverRef.current!;

    const unsubscribe = NetInfo.addEventListener((state) => {
      driver.handleConnectivityChange(toConnectivitySnapshot(state));
    });

    const interval = setInterval(() => {
      NetInfo.fetch()
        .then((state) => driver.handleConnectivityChange(toConnectivitySnapshot(state)))
        .catch(() => undefined);
    }, PERIODIC_RECHECK_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [canReplay]);

  return null;
}
