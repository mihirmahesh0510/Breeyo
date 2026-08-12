import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { useOfflineSync } from './useOfflineSync';
import { useScannerStore, type ScannedItem, type ScannerMode } from '../stores/scanner.store';
import { useStockTakeStore } from '../stores/stock-take.store';
import {
  OfflineBarcodeCache,
  type CachedBarcodeItem,
} from '../services/offline-barcode-cache';
import { isConnectivityError } from '../services/offline-queue.service';
import type { InventoryItemDetail } from './useInventoryApi';
import type { BarcodeLookupResult, StockBatch } from '@breeyo/types';

/**
 * D-13/D-19: the common shape the scanner UI renders for a resolved barcode,
 * whether the lookup came from the live API (full `InventoryItemDetail`,
 * including active batches) or the offline `OfflineBarcodeCache` (Task 1's
 * reduced `CachedCatalogItem` -- no parLevel/batches, per its own doc
 * comment). `batchCount`/`nearestExpiry` are `null` when that information
 * simply isn't available (offline), not when there are zero batches.
 */
export interface ScanResultItemView {
  /** The exact barcode string that resolved to this item (for dedupe/keying). */
  code: string;
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  currentStock: number;
  parLevel: number | null;
  batchCount: number | null;
  nearestExpiry: string | null;
  source: 'online' | 'offline';
}

export type ScanOutcome =
  | { status: 'idle' }
  | { status: 'looking'; code: string }
  | { status: 'found'; code: string; item: ScanResultItemView }
  | { status: 'not_found'; code: string }
  | { status: 'duplicate'; code: string; itemName?: string };

export interface UseBarcodeScanOptions {
  mode: ScannerMode;
  /** Accepted per the plan's literal signature; not needed for the lookup
   *  calls themselves (the API infers clinic from the JWT, same as every
   *  other inventory endpoint), kept for forward-compat / caller clarity. */
  clinicId: string;
}

export interface UseBarcodeScanResult {
  /** Call with a scanned or manually-entered barcode string. */
  onBarcodeScanned: (code: string) => Promise<void>;
  /** Full-detail scan results, newest first -- for ContinuousScanList (D-18/D-38). */
  scannedItems: ScanResultItemView[];
  /** Most recent scan outcome -- drives the single-mode ScanResultCard / UnknownBarcodePrompt. */
  lastResult: ScanOutcome;
  isLooking: boolean;
  /** D-38: per-item "Actual Count" text entered during stock-take, keyed by itemId. */
  actualCounts: Record<string, string>;
  setActualCount: (itemId: string, value: string) => void;
  /** Resets `lastResult` to idle (e.g. "Try Again" on the unknown-barcode prompt). */
  dismissResult: () => void;
  /** Clears the accumulated scan session (continuous/stock-take reset). */
  clearScanned: () => void;
}

interface BarcodeLookupResponse {
  data: BarcodeLookupResult;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Earliest active-batch expiry among an item's batches, or null if none have one. */
function computeNearestExpiry(batches: StockBatch[] | undefined): string | null {
  if (!batches || batches.length === 0) return null;
  const expiries = batches
    .map((batch) => toIsoString(batch.expiryDate))
    .filter((value): value is string => value !== null)
    .sort();
  return expiries[0] ?? null;
}

function toOnlineItemView(code: string, item: InventoryItemDetail): ScanResultItemView {
  return {
    code,
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    unit: item.unit,
    currentStock: item.currentStock,
    parLevel: item.parLevel,
    batchCount: item.batches?.length ?? 0,
    nearestExpiry: computeNearestExpiry(item.batches),
    source: 'online',
  };
}

function toOfflineItemView(code: string, cached: CachedBarcodeItem): ScanResultItemView {
  const data = cached.itemData;
  return {
    code,
    itemId: data.id,
    itemName: data.name,
    category: data.category,
    unit: data.unit,
    currentStock: data.currentStock,
    // Not present in the reduced offline catalog shape (see offline-barcode-cache.ts).
    parLevel: null,
    batchCount: null,
    nearestExpiry: null,
    source: 'offline',
  };
}

/**
 * D-13/D-14/D-19: resolves a scanned or manually-entered barcode to an
 * inventory item, online or offline, applying the 1500ms duplicate-scan
 * window from `useScannerStore.isDuplicate` (RESEARCH.md Pitfall 2) before
 * doing any lookup at all. See 05-05-SUMMARY.md's "What Task 2 needs to
 * know" section for the recommended flow this hook implements.
 */
export function useBarcodeScan({ mode }: UseBarcodeScanOptions): UseBarcodeScanResult {
  const { accessToken } = useAuth();
  const { isOffline } = useOfflineSync();

  const offlineCacheRef = useRef<OfflineBarcodeCache | null>(null);
  if (!offlineCacheRef.current) {
    offlineCacheRef.current = new OfflineBarcodeCache();
  }

  const setMode = useScannerStore((state) => state.setMode);
  const addScannedItem = useScannerStore((state) => state.addScannedItem);

  const [scannedItems, setScannedItems] = useState<ScanResultItemView[]>([]);
  const [lastResult, setLastResult] = useState<ScanOutcome>({ status: 'idle' });
  const [isLooking, setIsLooking] = useState(false);
  const [actualCounts, setActualCounts] = useState<Record<string, string>>({});

  // Keep the shared scanner store's mode in sync with whichever screen/route
  // mounted this hook (single/continuous/stockTake, D-18/D-38).
  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);

  const scannedItemsRef = useRef<ScanResultItemView[]>(scannedItems);
  scannedItemsRef.current = scannedItems;

  const onBarcodeScanned = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      const store = useScannerStore.getState();
      if (store.isDuplicate(code)) {
        const existing = scannedItemsRef.current.find((item) => item.code === code);
        setLastResult({ status: 'duplicate', code, itemName: existing?.itemName });
        return;
      }

      store.setLastScanned(code);
      setIsLooking(true);
      setLastResult({ status: 'looking', code });

      try {
        let view: ScanResultItemView | null = null;

        const lookupOffline = () => {
          const cached = offlineCacheRef.current!.lookupBarcode(code);
          return cached ? toOfflineItemView(code, cached) : null;
        };

        if (isOffline) {
          view = lookupOffline();
        } else {
          try {
            const response = await apiClient<BarcodeLookupResponse>(
              `/api/v1/inventory/barcode-lookup?code=${encodeURIComponent(code)}`,
              { token: accessToken ?? undefined },
            );
            if (response.data.found && response.data.item) {
              // The wire response includes each item's active batches (see
              // inventory-item.repository.ts's findByBarcode), which
              // @breeyo/types's plain `InventoryItem` doesn't declare --
              // same `as unknown as` bridge barcode-lookup.service.ts
              // itself already uses for this exact response.
              view = toOnlineItemView(code, response.data.item as unknown as InventoryItemDetail);
            }
          } catch (err) {
            // The device *thinks* it's online (useOfflineSync says so) but
            // this particular request failed at the network level -- fall
            // back to the offline cache rather than surfacing an error for
            // what the user experiences as a normal scan.
            if (isConnectivityError(err)) {
              view = lookupOffline();
            } else {
              throw err;
            }
          }
        }

        if (view) {
          // D-13: Medium impact confirms a successful match, matching the
          // UI-SPEC's Haptic Feedback table (distinct from the "not found"
          // Warning notification below) -- the plan's inline pseudocode
          // sketch fires one generic haptic before the lookup; this hook
          // follows the UI-SPEC's more specific per-outcome table instead,
          // see 05-05-SUMMARY.md Task 2 Deviations.
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setScannedItems((prev) => [view!, ...prev]);
          addScannedItem({
            code,
            itemId: view.itemId,
            itemName: view.itemName,
            scannedAt: Date.now(),
          });
          // D-37/D-38: in stock-take mode, a found scan feeds directly into
          // the shared stock-take session store (Plan 05-07) -- the same
          // store StockTakeScreen reads from -- so scanning here and then
          // navigating back to StockTakeScreen shows the item as a row
          // ready for its actual count, rather than being stuck in this
          // hook's own local (session-less) `actualCounts` state.
          if (mode === 'stockTake') {
            useStockTakeStore
              .getState()
              .addEntry(view.itemId, view.itemName, view.unit, view.currentStock);
          }
          setLastResult({ status: 'found', code, item: view });
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setLastResult({ status: 'not_found', code });
        }
      } finally {
        setIsLooking(false);
      }
    },
    [accessToken, isOffline, addScannedItem, mode],
  );

  const setActualCount = useCallback((itemId: string, value: string) => {
    setActualCounts((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const dismissResult = useCallback(() => {
    setLastResult({ status: 'idle' });
  }, []);

  const clearScanned = useCallback(() => {
    setScannedItems([]);
    setActualCounts({});
    setLastResult({ status: 'idle' });
    useScannerStore.getState().clearScannedItems();
  }, []);

  return {
    onBarcodeScanned,
    scannedItems,
    lastResult,
    isLooking,
    actualCounts,
    setActualCount,
    dismissResult,
    clearScanned,
  };
}

// Exported for the pure-logic unit test (no camera/native module involved).
export const __testables = {
  toOnlineItemView,
  toOfflineItemView,
  computeNearestExpiry,
};

// Re-exported for convenience so screens/components don't need to reach into
// the scanner store module directly just to type a `ScannedItem` prop.
export type { ScannedItem };
