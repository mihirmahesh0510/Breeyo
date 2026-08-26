import { useCallback } from 'react';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { buildRetryRequest, buildEscalateRequest } from '../lib/syncFailureActions';
import type { FailureCenterItem } from '../lib/sync-status';

export interface UseSyncFailureActionsResult {
  /** D-22: the current owner's own guided retry. Real implementation for
   *  `SyncFailureCenterScreen.tsx`'s `onRetry` prop (verify-fix 10.6) --
   *  that prop was a dead callback with nothing behind it before this. */
  retryFailureItem: (item: FailureCenterItem) => Promise<unknown>;
  /** D-23/D-24/D-36: hand off to the next owner. Real implementation for
   *  `SyncFailureCenterScreen.tsx`'s `onEscalate` prop (verify-fix 10.6). */
  escalateFailureItem: (item: FailureCenterItem) => Promise<unknown>;
}

/**
 * Verify-fix 10.6: thin `apiClient` wrapper around `syncFailureActions.ts`'s
 * RN-free request builders -- matches `useOfflineStockActions.ts`'s
 * established shape (`useAuth` for the bearer token, `apiClient` for the
 * actual fetch), kept untested directly the same way that hook is (only its
 * underlying decision layer -- here, `buildRetryRequest`/
 * `buildEscalateRequest` -- is unit tested; `apps/mobile` has no working
 * React renderer to exercise a hook against, see this feature's other test
 * file headers).
 *
 * Neither the retry nor the escalate route has a network-failure/offline
 * fallback the way `useOfflineStockActions.ts`'s mutations do -- retrying or
 * escalating a sync failure is itself a piece of sync-recovery machinery, so
 * queuing it as another offline operation would be circular. Both simply
 * propagate a request failure to the caller (`ApiClientError`), the same as
 * every other read/mutation hook in this codebase that has no offline
 * fallback of its own.
 */
export function useSyncFailureActions(): UseSyncFailureActionsResult {
  const { accessToken } = useAuth();

  const retryFailureItem = useCallback(
    async (item: FailureCenterItem) => {
      const req = buildRetryRequest(item);
      return apiClient(req.path, {
        method: req.method,
        token: accessToken!,
        body: JSON.stringify(req.body),
      });
    },
    [accessToken],
  );

  const escalateFailureItem = useCallback(
    async (item: FailureCenterItem) => {
      const req = buildEscalateRequest(item);
      return apiClient(req.path, {
        method: req.method,
        token: accessToken!,
        body: JSON.stringify(req.body),
      });
    },
    [accessToken],
  );

  return { retryFailureItem, escalateFailureItem };
}
