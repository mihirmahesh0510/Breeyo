import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockTakeSummary } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { useStockTakeStore } from '../stores/stock-take.store';
import { buildStockTakeSubmission, computeClientSummary } from '../lib/stock-take-logic';

interface StockTakeResponse {
  data: StockTakeSummary;
}

/**
 * Stock-take session hook (D-37, D-38, D-40). Wraps `useStockTakeStore`,
 * auto-discarding an expired (>24h) session on mount, and owns the
 * POST /inventory/stock-take submission + cache invalidation.
 */
export function useStockTakeSession() {
  const { activeClinicId, accessToken } = useAuth();
  const queryClient = useQueryClient();

  const entries = useStockTakeStore((s) => s.entries);
  const isActive = useStockTakeStore((s) => s.isActive);
  const startedAt = useStockTakeStore((s) => s.startedAt);
  const addEntry = useStockTakeStore((s) => s.addEntry);
  const updateCount = useStockTakeStore((s) => s.updateCount);
  const removeEntry = useStockTakeStore((s) => s.removeEntry);
  const clear = useStockTakeStore((s) => s.clear);
  const isExpired = useStockTakeStore((s) => s.isExpired);

  // Auto-discard a stale (>24h) session the moment the stock-take screen
  // mounts, before the vet sees any of its (now-unreliable) entries.
  useEffect(() => {
    if (isExpired()) {
      clear();
    }
    // Intentionally run once per mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = buildStockTakeSubmission(Array.from(entries.values()));
      const response = await apiClient<StockTakeResponse>('/api/v1/inventory/stock-take', {
        method: 'POST',
        token: accessToken || undefined,
        body: JSON.stringify(payload),
      });
      return response.data;
    },
    onSuccess: () => {
      // Discrepancies changed currentStock on every affected item -- refresh
      // the list, summary, and Attention alerts.
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items', activeClinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'summary', activeClinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'alerts', activeClinicId] });
      clear();
    },
  });

  const submitStockTake = () => submitMutation.mutateAsync();

  /** D-40: client-side discrepancy preview (see computeClientSummary's doc
   *  comment) -- computed from the current entries without calling the API. */
  const getPreviewSummary = () => computeClientSummary(Array.from(entries.values()));

  /** Discards the in-progress session. Confirmation UX (if any) is the
   *  caller's responsibility -- this just performs the discard. */
  const cancelStockTake = () => {
    clear();
  };

  return {
    entries,
    isActive,
    startedAt,
    addEntry,
    updateCount,
    removeEntry,
    submitStockTake,
    getPreviewSummary,
    cancelStockTake,
    isSubmitting: submitMutation.isPending,
    submitError: submitMutation.error,
    lastSummary: submitMutation.data,
    resetSubmission: submitMutation.reset,
  };
}
