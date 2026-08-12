import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type {
  InventoryItem,
  StockBatch,
  StockMovement,
  InventorySummary,
  LowStockItem,
  ExpiringBatchItem,
  BarcodeLookupResult,
  BarcodeConflict,
  BarcodeFormat,
  WantListItem,
} from '@breeyo/types';
// `CreateItemSchemaInput`/`UpdateItemSchemaInput` (the zod-inferred types), not
// `@breeyo/types`' `CreateItemInput`/`UpdateItemInput`: `barcodeEntrySchema.format`
// is `z.enum(BARCODE_FORMAT_VALUES as [string, ...string[]])`, which zod infers
// as plain `string`, not the `BarcodeFormat` literal union `CreateItemInput`
// expects. This is the same pre-existing type-inference gap Plan 05-02's API
// service layer already worked around (see 05-02-SUMMARY.md) -- these mutation
// hooks take the already-validated `createItemSchema`/`updateItemSchema` output
// straight from `ItemFormScreen`, so matching that shape avoids fighting a type
// mismatch with no runtime consequence.
import type {
  CreateItemSchemaInput,
  UpdateItemSchemaInput,
  StockReceiptSchemaInput,
  StockAdjustmentSchemaInput,
} from '@breeyo/validators';

// --- Response shapes (API-specific envelopes, not fully captured by @breeyo/types) ---

export type InventorySortOption =
  | 'name_asc'
  | 'stock_level_asc'
  | 'created_at_desc'
  | 'expiry_asc'
  | 'category_asc';

export interface InventoryCategoryOption {
  value: string;
  label: string;
  icon?: string;
}

export interface InventoryUnitOption {
  value: string;
  label: string;
}

export interface AlertCounts {
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
}

export interface InventoryAlerts {
  lowStock: LowStockItem[];
  expiringSoon: ExpiringBatchItem[];
  expired: ExpiringBatchItem[];
  counts: AlertCounts;
}

/** GET /inventory/items/:itemId returns barcodes + the item's currently-active batches (see repository.findById). */
export type InventoryItemDetail = InventoryItem & { batches: StockBatch[] };

interface ItemsListResponse {
  data: { items: InventoryItem[]; total: number; page: number; limit: number };
}
interface ItemResponse {
  data: InventoryItemDetail;
}
interface SummaryResponse {
  data: InventorySummary;
}
interface CategoriesResponse {
  data: InventoryCategoryOption[];
}
interface UnitsResponse {
  data: InventoryUnitOption[];
}
interface AlertsResponse {
  data: InventoryAlerts;
}
interface MovementsResponse {
  data: { movements: StockMovement[]; total: number; page: number; limit: number };
}
interface WantListResponse {
  data: WantListItem[];
}
interface MovementsExportResponse {
  data: StockMovement[];
}

interface UseInventoryItemsParams {
  search?: string;
  category?: string | null;
  sort?: InventorySortOption;
  page?: number;
  limit?: number;
}

// --- Query hooks ---

export function useInventoryItems(
  clinicId: string | null | undefined,
  params: UseInventoryItemsParams = {},
) {
  const { accessToken } = useAuth();
  const { search = '', category = null, sort = 'name_asc', page = 1, limit = 30 } = params;
  // Search only takes effect at 2+ chars per D-31; below that we fall back to the unfiltered list.
  const effectiveSearch = search.trim().length >= 2 ? search.trim() : '';

  return useQuery({
    queryKey: ['inventory', 'items', clinicId, effectiveSearch, category ?? '', sort, page, limit],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (effectiveSearch) qs.set('search', effectiveSearch);
      if (category) qs.set('category', category);
      if (sort) qs.set('sort', sort);
      qs.set('page', String(page));
      qs.set('limit', String(limit));
      return apiClient<ItemsListResponse>(`/api/v1/inventory/items?${qs.toString()}`, {
        token: accessToken!,
      });
    },
    enabled: !!accessToken && !!clinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export function useInventorySummary(clinicId: string | null | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['inventory', 'summary', clinicId],
    queryFn: () =>
      apiClient<SummaryResponse>('/api/v1/inventory/items/summary', { token: accessToken! }),
    enabled: !!accessToken && !!clinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export function useInventoryAlerts(clinicId: string | null | undefined, leadDays?: number) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['inventory', 'alerts', clinicId, leadDays ?? null],
    queryFn: () => {
      const qs = leadDays ? `?leadDays=${leadDays}` : '';
      return apiClient<AlertsResponse>(`/api/v1/inventory/alerts${qs}`, {
        token: accessToken!,
      });
    },
    enabled: !!accessToken && !!clinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export function useInventoryItem(clinicId: string | null | undefined, itemId: string | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['inventory', 'item', clinicId, itemId],
    queryFn: () =>
      apiClient<ItemResponse>(`/api/v1/inventory/items/${itemId}`, { token: accessToken! }),
    enabled: !!accessToken && !!clinicId && !!itemId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export function useItemMovements(
  clinicId: string | null | undefined,
  itemId: string | undefined,
  page: number = 1,
  limit: number = 30,
) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['inventory', 'movements', clinicId, itemId, page, limit],
    queryFn: () =>
      apiClient<MovementsResponse>(
        `/api/v1/inventory/items/${itemId}/movements?page=${page}&limit=${limit}`,
        { token: accessToken! },
      ),
    enabled: !!accessToken && !!clinicId && !!itemId,
    staleTime: 15_000,
    select: (response) => response.data,
  });
}

/**
 * D-47: fetches the flat, unpaginated movement rows CSV export needs. Not a
 * `useQuery` -- this is triggered on-demand ("Export CSV" tap), not cached
 * or re-rendered against, so a plain async function (used directly by
 * csv-export.service.ts's caller) is the right shape here, matching how
 * WhatsAppShareButton.tsx also calls `apiClient` directly for its one-shot
 * text fetch rather than wrapping it in a query hook.
 */
export function fetchMovementsForExport(
  accessToken: string | null | undefined,
  itemId: string,
): Promise<StockMovement[]> {
  return apiClient<MovementsExportResponse>(`/api/v1/inventory/items/${itemId}/movements/export`, {
    token: accessToken || undefined,
  }).then((response) => response.data);
}

export function useInventoryCategories(clinicId: string | null | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['inventory', 'categories', clinicId],
    queryFn: () =>
      apiClient<CategoriesResponse>('/api/v1/inventory/categories', { token: accessToken! }),
    enabled: !!accessToken && !!clinicId,
    staleTime: 60_000,
    select: (response) => response.data,
  });
}

/**
 * Want-list (D-06/D-24): items below par level, biggest deficit first
 * (server-sorted, see want-list.service.ts). Feeds WantListScreen; the
 * WhatsApp text share and CSV export use their own dedicated calls (the
 * text share needs the raw GET /want-list/text endpoint, and CSV export
 * needs only this same array), so no separate hook for those.
 */
export function useWantList(clinicId: string | null | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['inventory', 'want-list', clinicId],
    queryFn: () =>
      apiClient<WantListResponse>('/api/v1/inventory/want-list', { token: accessToken! }),
    enabled: !!accessToken && !!clinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export function useInventoryUnits(clinicId: string | null | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['inventory', 'units', clinicId],
    queryFn: () => apiClient<UnitsResponse>('/api/v1/inventory/units', { token: accessToken! }),
    enabled: !!accessToken && !!clinicId,
    staleTime: 60_000,
    select: (response) => response.data,
  });
}

// --- Mutation hooks ---

/**
 * Create an item. Invalidates items/summary/categories/units — creating an item can
 * silently register a new custom category or unit clinic-wide (D-61).
 */
export function useCreateItem(clinicId: string | null | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateItemSchemaInput) =>
      apiClient<ItemResponse>('/api/v1/inventory/items', {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(input),
      }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'summary', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'categories', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'units', clinicId] });
    },
  });
}

/**
 * Update an item. Same cache-invalidation rationale as useCreateItem (D-61: editing
 * an item's category/unit to a new custom value registers it clinic-wide too).
 */
export function useUpdateItem(clinicId: string | null | undefined, itemId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateItemSchemaInput) =>
      apiClient<ItemResponse>(`/api/v1/inventory/items/${itemId}`, {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify(input),
      }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'item', clinicId, itemId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'categories', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'units', clinicId] });
    },
  });
}

export type AddBarcodeMutationResult =
  | { success: true; barcode: { id: string; code: string; format: BarcodeFormat; itemId: string } }
  | { success: false; conflict: BarcodeConflict };

/**
 * Add a barcode to an item (D-16). Resolves to a typed conflict result instead of
 * throwing on a 409 (D-63) — see the deviation note in the summary: the shared
 * `apiClient` error wrapper only forwards `error.details`, not the `existingItem`
 * field this endpoint actually returns on conflict, so this hook talks to the
 * endpoint directly instead of going through `apiClient`.
 */
export function useAddItemBarcode(clinicId: string | null | undefined, itemId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { code: string; format: BarcodeFormat }): Promise<AddBarcodeMutationResult> => {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/v1/inventory/items/${itemId}/barcodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(input),
      });
      const json = await response.json();

      if (response.status === 409 && json?.error?.code === 'BARCODE_CONFLICT') {
        return { success: false, conflict: json.error.existingItem as BarcodeConflict };
      }

      if (!response.ok) {
        throw new ApiClientError(
          json.error?.message || 'Could not add barcode',
          json.error?.code || 'UNKNOWN_ERROR',
          response.status,
          json.error?.details,
        );
      }

      return { success: true, barcode: json.data };
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['inventory', 'item', clinicId, itemId] });
        queryClient.invalidateQueries({ queryKey: ['inventory', 'items', clinicId] });
      }
    },
  });
}

export function useRemoveItemBarcode(clinicId: string | null | undefined, itemId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    // Not using apiClient here: the endpoint replies 204 No Content on success,
    // and apiClient unconditionally calls response.json(), which throws on an
    // empty body. Raw fetch lets us skip parsing when there's nothing to parse.
    mutationFn: async (barcodeId: string) => {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/v1/inventory/barcodes/${barcodeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        let message = 'Could not remove barcode';
        let code = 'UNKNOWN_ERROR';
        try {
          const json = await response.json();
          message = json.error?.message || message;
          code = json.error?.code || code;
        } catch {
          // no JSON body on this error path — keep the defaults
        }
        throw new ApiClientError(message, code, response.status);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'item', clinicId, itemId] });
    },
  });
}

interface PhotoUploadUrlResponse {
  data: { uploadUrl: string; photoUrl: string; expiresIn: number };
}

export function useRequestPhotoUploadUrl(clinicId: string | null | undefined) {
  const { accessToken } = useAuth();

  return useMutation({
    mutationFn: (itemId: string) =>
      apiClient<PhotoUploadUrlResponse>(`/api/v1/inventory/items/${itemId}/photo-upload-url`, {
        method: 'POST',
        token: accessToken!,
      }).then((response) => response.data),
  });
}

interface ReceiveStockResponse {
  data: { batch: StockBatch; movement: StockMovement };
}

/**
 * Receive stock (Plan 06, D-01/D-03/D-09/D-11/D-27). Always creates a new
 * StockBatch + a 'received' StockMovement server-side. Invalidates the item
 * detail (currentStock/batches changed), summary (totals changed), and
 * movements (new history row) caches.
 */
export function useReceiveStock(clinicId: string | null | undefined, itemId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StockReceiptSchemaInput) =>
      apiClient<ReceiveStockResponse>(`/api/v1/inventory/items/${itemId}/receive`, {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(input),
      }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'item', clinicId, itemId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'summary', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'movements', clinicId, itemId] });
    },
  });
}

interface AdjustStockResponse {
  data: StockMovement;
}

/**
 * Adjust stock (Plan 06, D-04). Requires a preset reason (enforced by
 * stockAdjustmentSchema); invalidates item/summary/movements plus alerts,
 * since an adjustment can push an item above/below its par level.
 */
export function useAdjustStock(clinicId: string | null | undefined, itemId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StockAdjustmentSchemaInput) =>
      apiClient<AdjustStockResponse>(`/api/v1/inventory/items/${itemId}/adjust`, {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(input),
      }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'item', clinicId, itemId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'summary', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'movements', clinicId, itemId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'alerts', clinicId] });
    },
  });
}
