import { useCallback } from 'react';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { SyncVisibilityState } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { getOfflineSyncDb } from '../../offline-sync/db/offlineDb';
import {
  recordOfflineStockReceive,
  recordOfflineStockDispense,
  recordOfflineStockAdjust,
  recordOfflineStockReturn,
  readStockWorkingSetItem,
  cacheScannedStockItem,
  isNetworkFailure,
  INVENTORY_MEDIUM,
  type StockActionKnownItem,
  type StockReceivePayload,
  type StockDispensePayload,
  type StockAdjustPayload,
  type StockReturnPayload,
  type CachedStockWorkingSetItem,
} from '../services/offlineStockActionStore';

/**
 * Plan 10-04 Task 1 (D-04, D-10, D-15 to D-17): scan/receive/dispense/adjust/
 * return all try the normal online request first -- this hook changes
 * nothing about behavior on a healthy connection. Only when `apiClient`
 * fails WITHOUT a server response (`isNetworkFailure`, same classification
 * `useOfflineQueueActions.ts`/`useAutoSave.ts` use) does a mutation fall back
 * to recording it into the offline-sync working-set cache + replay ledger
 * (`offlineStockActionStore.ts`, tagged `INVENTORY_MEDIUM`) so the action is
 * operationally real on-device immediately, not blocked or queued invisibly.
 */

const DEVICE_ID_SECURE_STORE_KEY = 'breeyo-offline-sync-device-id';

/** Same per-installation id, same secure-store key, as
 *  `useOfflineQueueActions.ts`/`useAutoSave.ts` -- duplicated here rather
 *  than imported cross-feature, matching this repo's established
 *  per-feature-scoping convention for this exact helper. */
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_SECURE_STORE_KEY);
  if (existing) return existing;
  const generated = generateLocalId();
  await SecureStore.setItemAsync(DEVICE_ID_SECURE_STORE_KEY, generated);
  return generated;
}

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * D-18 to D-21: a calm, per-domain pending-sync counter using the SAME
 * shared `SyncVisibilityState` vocabulary Plan 10-02's `queueOfflineStore.ts`
 * uses for its own pending marker -- not a bespoke inventory-only state enum.
 * A dedicated inventory store (like queue's own `queueOfflineStore.ts`) is
 * appropriate here; it is the STATE ENUM that must stay shared, not
 * necessarily a single cross-domain store instance.
 */
interface InventoryOfflineSyncState {
  pendingCount: number;
  incrementPending: () => void;
  reset: () => void;
}

export const useInventoryOfflineSyncStore = create<InventoryOfflineSyncState>((set) => ({
  pendingCount: 0,
  incrementPending: () => set((state) => ({ pendingCount: state.pendingCount + 1 })),
  reset: () => set({ pendingCount: 0 }),
}));

export interface UseOfflineStockActionsResult {
  /** Reads the local same-day working-set cache for an item -- what the
   *  barcode scanner falls back to when disconnected. */
  getCachedItem: (itemId: string) => Promise<CachedStockWorkingSetItem | null>;
  /** Seeds the working-set cache from a resolved scan (online or Phase 5's
   *  offline barcode cache) so the item has local stock-in-motion data from
   *  the moment it is first scanned this session (D-15 to D-17). */
  cacheScannedItem: (item: StockActionKnownItem) => Promise<CachedStockWorkingSetItem>;
  receiveStock: (itemId: string, knownItem: StockActionKnownItem, payload: StockReceivePayload) => Promise<unknown>;
  dispenseStock: (itemId: string, knownItem: StockActionKnownItem, payload: StockDispensePayload) => Promise<unknown>;
  adjustStock: (itemId: string, knownItem: StockActionKnownItem, payload: StockAdjustPayload) => Promise<unknown>;
  returnToStock: (itemId: string, knownItem: StockActionKnownItem, payload: StockReturnPayload) => Promise<unknown>;
  /**
   * D-04, D-10: captures the action straight into the offline-sync ledger
   * with NO online attempt of its own -- for a caller (e.g. `DispenseScreen`)
   * that already made its own primary online attempt and got a network
   * failure. Unlike `dispenseStock` above (which tries `apiClient` itself
   * before falling back), calling `dispenseStock` from that catch block
   * would be a second, independent, non-idempotent POST to the same
   * mutating endpoint. Matches `useOfflineQueueActions.checkIn`'s
   * single-attempt convention: exactly one network attempt per user action,
   * made by whichever layer owns it.
   */
  dispenseOffline: (itemId: string, knownItem: StockActionKnownItem, payload: StockDispensePayload) => Promise<unknown>;
  /** Same single-attempt reasoning as `dispenseOffline`, for `StockReceiptScreen`. */
  receiveOffline: (itemId: string, knownItem: StockActionKnownItem, payload: StockReceivePayload) => Promise<unknown>;
  /** Same single-attempt reasoning as `dispenseOffline`, for `StockAdjustmentSheet`. */
  adjustOffline: (itemId: string, knownItem: StockActionKnownItem, payload: StockAdjustPayload) => Promise<unknown>;
  /** D-18: PENDING while any INVENTORY_MEDIUM action this session is still
   *  awaiting replay, CAUGHT_UP otherwise -- the shared sync UX vocabulary,
   *  not a bespoke inventory-only status. */
  pendingCount: number;
  visibilityState: SyncVisibilityState;
}

export function useOfflineStockActions(): UseOfflineStockActionsResult {
  const { accessToken, activeClinicId, user } = useAuth();
  const pendingCount = useInventoryOfflineSyncStore((state) => state.pendingCount);
  const incrementPending = useInventoryOfflineSyncStore((state) => state.incrementPending);

  const getCachedItem = useCallback(async (itemId: string) => {
    const db = await getOfflineSyncDb();
    return readStockWorkingSetItem(db, itemId);
  }, []);

  const cacheScannedItem = useCallback(
    async (item: StockActionKnownItem) => {
      const db = await getOfflineSyncDb();
      const deviceId = await getOrCreateDeviceId();
      return cacheScannedStockItem(db, {
        ...item,
        clinicId: activeClinicId!,
        deviceId,
      });
    },
    [activeClinicId],
  );

  const captureOffline = useCallback(
    async <TPayload>(
      itemId: string,
      knownItem: StockActionKnownItem,
      payload: TPayload,
      recorder: (
        db: Awaited<ReturnType<typeof getOfflineSyncDb>>,
        input: {
          itemId: string;
          clinicId: string;
          deviceId: string;
          userId: string;
          knownItem: StockActionKnownItem;
          payload: TPayload;
        },
      ) => Promise<{ operationId: string; item: CachedStockWorkingSetItem }>,
    ) => {
      const db = await getOfflineSyncDb();
      const deviceId = await getOrCreateDeviceId();
      const result = await recorder(db, {
        itemId,
        clinicId: activeClinicId!,
        deviceId,
        userId: user!.id,
        knownItem,
        payload,
      });
      incrementPending();
      return result;
    },
    [activeClinicId, user, incrementPending],
  );

  const receiveStock = useCallback(
    async (itemId: string, knownItem: StockActionKnownItem, payload: StockReceivePayload) => {
      try {
        return await apiClient(`/api/v1/inventory/items/${itemId}/receive`, {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return captureOffline(itemId, knownItem, payload, recordOfflineStockReceive);
      }
    },
    [accessToken, captureOffline],
  );

  const dispenseStock = useCallback(
    async (itemId: string, knownItem: StockActionKnownItem, payload: StockDispensePayload) => {
      try {
        return await apiClient(`/api/v1/inventory/items/${itemId}/dispense`, {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return captureOffline(itemId, knownItem, payload, recordOfflineStockDispense);
      }
    },
    [accessToken, captureOffline],
  );

  const adjustStock = useCallback(
    async (itemId: string, knownItem: StockActionKnownItem, payload: StockAdjustPayload) => {
      try {
        return await apiClient(`/api/v1/inventory/items/${itemId}/adjust`, {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return captureOffline(itemId, knownItem, payload, recordOfflineStockAdjust);
      }
    },
    [accessToken, captureOffline],
  );

  const returnToStock = useCallback(
    async (itemId: string, knownItem: StockActionKnownItem, payload: StockReturnPayload) => {
      try {
        return await apiClient(`/api/v1/inventory/movements/${payload.movementId}/return`, {
          method: 'POST',
          token: accessToken!,
        });
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return captureOffline(itemId, knownItem, payload, recordOfflineStockReturn);
      }
    },
    [accessToken, captureOffline],
  );

  const dispenseOffline = useCallback(
    (itemId: string, knownItem: StockActionKnownItem, payload: StockDispensePayload) =>
      captureOffline(itemId, knownItem, payload, recordOfflineStockDispense),
    [captureOffline],
  );

  const receiveOffline = useCallback(
    (itemId: string, knownItem: StockActionKnownItem, payload: StockReceivePayload) =>
      captureOffline(itemId, knownItem, payload, recordOfflineStockReceive),
    [captureOffline],
  );

  const adjustOffline = useCallback(
    (itemId: string, knownItem: StockActionKnownItem, payload: StockAdjustPayload) =>
      captureOffline(itemId, knownItem, payload, recordOfflineStockAdjust),
    [captureOffline],
  );

  return {
    getCachedItem,
    cacheScannedItem,
    receiveStock,
    dispenseStock,
    adjustStock,
    returnToStock,
    dispenseOffline,
    receiveOffline,
    adjustOffline,
    pendingCount,
    visibilityState: pendingCount > 0 ? SyncVisibilityState.PENDING : SyncVisibilityState.CAUGHT_UP,
  };
}

// Re-exported so callers (BarcodeScannerScreen.tsx) never need to import the
// INVENTORY_MEDIUM priority constant from the store module directly just to
// tag a manually-built envelope of their own.
export { INVENTORY_MEDIUM };
