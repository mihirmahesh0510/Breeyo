import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { DispenseResult } from '@breeyo/types';
import type { DispenseSchemaInput } from '@breeyo/validators';

interface DispenseResponse {
  data: DispenseResult;
}

/**
 * FIFO dispense (Plan 06 Task 2). Calls POST /inventory/items/:itemId/dispense
 * with `{ quantity, overrideBatchId?, consultationId?, invoiceId?, ownerId? }`
 * -- `overrideBatchId` for D-22's manual batch override, `consultationId` for
 * D-49's EMR-linked dispensing, `ownerId` for D-60's counter-sale owner
 * attribution. The server (FifoDispenseService) is the actual FIFO/expiry
 * authority; `overrideBatchId` just tells it which batch to deduct from
 * instead of auto-picking the oldest non-expired one.
 *
 * Invalidates item detail (currentStock/batches changed), summary (totals
 * changed), movements (new history row) -- same shape as
 * useReceiveStock/useAdjustStock (Plan 06 Task 1, useInventoryApi.ts) -- plus
 * 'alerts', since dispensing is the operation most likely to push an item
 * below its par level (D-06/D-21).
 *
 * Kept in its own file per this task's file list, rather than appended to
 * useInventoryApi.ts alongside useReceiveStock/useAdjustStock, but mirrors
 * that same mutation-hook shape (returns the raw useMutation object, used as
 * `dispenseStock.mutateAsync(...)`) for consistency with Task 1's convention.
 */
export function useFifoDispense(clinicId: string | null | undefined, itemId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DispenseSchemaInput) =>
      apiClient<DispenseResponse>(`/api/v1/inventory/items/${itemId}/dispense`, {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(input),
      }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'item', clinicId, itemId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'summary', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'alerts', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'movements', clinicId, itemId] });
    },
  });
}
