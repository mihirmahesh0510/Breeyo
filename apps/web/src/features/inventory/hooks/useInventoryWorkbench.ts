'use client';

// Same `useState` + `useEffect` + `AbortController` shape as
// `useDashboardCockpit.ts` -- see that file's header for why `apps/web` has
// no React Query yet. Response shapes here mirror
// `apps/api/.../inventory-web.service.ts`'s exported interfaces by hand
// (not imported from `@breeyo/types`) -- Plan 09-03 keeps this contract
// local to the API module and this hook, the same choice
// `useDashboardCockpit.ts`'s local `CockpitResponse` already made for the
// cockpit endpoint.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryCategory, LowStockItem, WantListItem } from '@breeyo/types';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth, handleUnauthorized } from '../../../lib/AuthProvider';
import { useReplayStaleState } from '../../dashboard/hooks/useReplayStaleState';
import { useInventoryReplayRealtime } from './useInventoryReplayRealtime';

export type InventoryWebTab = 'stock' | 'reordering' | 'analytics';

export interface InventoryBatchSummary {
  batchId: string;
  lotNumber: string | null;
  expiryDate: string | null;
  currentQty: number;
}

export interface InventoryStockRow {
  itemId: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  currentStock: number;
  parLevel: number | null;
  isLowStock: boolean;
  nextExpiry: string | null;
  batches: InventoryBatchSummary[];
  /** D-18/D-20: empty (never omitted) when the caller cannot write. */
  safeActions: string[];
}

export interface StockAndBatchesPayload {
  tab: 'stock';
  tabLabel: 'Stock & Batches';
  writeAllowed: boolean;
  rows: InventoryStockRow[];
}

export interface ReorderRow extends WantListItem {
  urgency: 'critical' | 'warning';
}

export interface WorkbenchAction {
  actionId: string;
  label: string;
}

export interface ReorderingPayload {
  tab: 'reordering';
  tabLabel: 'Reordering';
  groups: Array<{ urgency: 'critical' | 'warning'; items: ReorderRow[] }>;
  actions: WorkbenchAction[];
}

export interface AnalyticsTurnoverRow {
  itemId: string;
  itemName: string;
  dispensedLast30Days: number;
}

export interface AnalyticsExpiryRiskRow {
  batchId: string;
  itemId: string;
  itemName: string;
  lotNumber: string | null;
  expiryDate: string;
  currentQty: number;
}

export interface AnalyticsPayload {
  tab: 'analytics';
  tabLabel: 'Analytics';
  stockTurnover: AnalyticsTurnoverRow[];
  expiryRisk: AnalyticsExpiryRiskRow[];
  lowStock: LowStockItem[];
  exportActions: WorkbenchAction[];
}

export interface WorkbenchResponse {
  tab: InventoryWebTab;
  scanningBoundaryMessage: string;
  stockAndBatches?: StockAndBatchesPayload;
  reordering?: ReorderingPayload;
  analytics?: AnalyticsPayload;
}

export interface AdjustStockInput {
  quantity: number;
  type: 'add' | 'remove';
  reason: string;
  notes?: string;
}

/** Mirrors `apiClient`'s private `API_BASE_URL` -- duplicated here only for the two export downloads below, which need a raw `fetch` (binary body) rather than `apiClient`'s JSON parsing. */
function resolveApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
}

/**
 * `GET /api/v1/inventory/web/workbench?tab=...` -- the browser inventory
 * workbench's one data source across all three tabs (D-31, D-32), plus the
 * write action (`adjustStock`, D-18/D-34) and the two analytics export
 * downloads (D-36).
 */
export function useInventoryWorkbench(tab: InventoryWebTab) {
  const { accessToken, activeClinicId } = useAuth();
  const [data, setData] = useState<WorkbenchResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // Finding 10.3 residual gap (F6): `useInventoryReplayRealtime` existed but
  // was never called from anywhere, so a mobile inventory replay conflict
  // was silently dropped in the browser even though the server already
  // broadcasts it -- wired the same way `useBillingWorkbench.ts` folds its
  // own realtime subscription directly into the one workbench hook, since
  // inventory (like billing) has no separate top-level composing component.
  const watchedItemIds = useMemo(
    () => (data?.stockAndBatches ? data.stockAndBatches.rows.map((row) => row.itemId) : []),
    [data],
  );
  const replayStale = useReplayStaleState(watchedItemIds);
  useInventoryReplayRealtime(accessToken, activeClinicId, replayStale.onReplayApplied, replayStale.onReplayConflictOpened);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!accessToken) {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient<{ data: WorkbenchResponse }>(
          `/api/v1/inventory/web/workbench?tab=${tabRef.current}`,
          { token: accessToken, signal },
        );
        setData(response.data);
      } catch (err) {
        if (signal?.aborted) return;
        if (!handleUnauthorized(err)) {
          setError(err as Error);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, tab, refetchToken]);

  const refetch = useCallback(() => setRefetchToken((n) => n + 1), []);

  const acknowledgeAndRefetch = useCallback(() => {
    replayStale.acknowledge();
    refetch();
  }, [refetch, replayStale]);

  /** D-18: the server 403s when the caller's role lacks `inventoryWriteEnabled` -- this surfaces that error to the caller rather than swallowing it. */
  const adjustStock = useCallback(
    async (itemId: string, input: AdjustStockInput) => {
      if (!accessToken) return;
      await apiClient(`/api/v1/inventory/web/items/${itemId}/adjust-stock`, {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify(input),
      });
      await load();
    },
    [accessToken, load],
  );

  /** D-36: downloads the analytics export as a file -- `apiClient` can't be reused here since it always parses the response as JSON. */
  const exportAnalytics = useCallback(
    async (format: 'csv' | 'pdf') => {
      if (!accessToken) return;
      const response = await fetch(`${resolveApiBaseUrl()}/api/v1/inventory/web/exports/analytics.${format}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-analytics.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    },
    [accessToken],
  );

  return {
    data,
    isLoading,
    error,
    refetch,
    acknowledgeAndRefetch,
    adjustStock,
    exportAnalytics,
    // Drives a `StaleStateBanner` the same way `useBillingWorkbench.ts`'s
    // `replayStatus` does -- `'conflict'` once a mobile replay conflict
    // opens for a currently-rendered item, `'stale'`/`'fresh'` otherwise.
    replayStatus: replayStale.status,
  };
}
