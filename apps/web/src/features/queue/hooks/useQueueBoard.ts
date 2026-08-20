'use client';

// Same `useState` + `useEffect` + `AbortController` shape as
// `useInventoryWorkbench.ts` -- see that file's header for why `apps/web`
// has no React Query yet. The response shape mirrors
// `apps/api/.../web-queue.service.ts`'s exported interfaces by hand, the
// same local-contract choice that file's header documents.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth, handleUnauthorized } from '../../../lib/AuthProvider';

/** Mirrors `BrowserSyncChangeMetadata` (`apps/api/src/realtime/socket.events.ts`). */
export interface QueueChangeMetadata {
  staleVersion: number;
  changedByUser: string | null;
  changedAt: string;
  reviewPath: string;
}

export interface QueueEntry {
  id: string;
  petId: string;
  petName: string | null;
  ownerName: string | null;
  status: string;
  isEmergency: boolean;
  visitReason: string | null;
  checkedInAt: string | null;
  queuePriorityAt: string;
  computedPosition?: number;
  estimatedWaitSeconds?: number;
  /** D-07/D-41: true only in `expectedArrivals` -- never true for a `waiting` row. */
  isExpectedArrival: boolean;
  changeMetadata: QueueChangeMetadata;
}

export interface QueueBoardResponse {
  expectedArrivals: QueueEntry[];
  waiting: QueueEntry[];
  inConsult: QueueEntry[];
  done: QueueEntry[];
  /** D-40: server-computed freshness relative to the `knownVersion` this hook last acknowledged. */
  staleState: 'fresh' | 'stale';
  serverUpdatedAt: string;
}

/**
 * `GET /api/v1/queue/web/board` -- the browser queue workbench's one data
 * source (D-07, D-41), plus the one write path (`updateStatus`, D-43).
 *
 * D-40: `knownVersionRef` is only advanced when the caller explicitly
 * acknowledges the current board (`acknowledgeAndRefetch`, wired to the
 * `StaleStateBanner`'s "Refresh" action) -- a background poll or realtime
 * nudge alone never marks the board "seen," so a genuinely stale read stays
 * flagged until the caller actively refreshes it.
 */
export function useQueueBoard() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<QueueBoardResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);
  const knownVersionRef = useRef<number | undefined>(undefined);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!accessToken) {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const query = knownVersionRef.current !== undefined ? `?knownVersion=${knownVersionRef.current}` : '';
        const response = await apiClient<{ data: QueueBoardResponse }>(`/api/v1/queue/web/board${query}`, {
          token: accessToken,
          signal,
        });
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
  }, [load, refetchToken]);

  const refetch = useCallback(() => setRefetchToken((n) => n + 1), []);

  /** D-40: marks the currently rendered board as "seen" and re-fetches -- the `StaleStateBanner` "Refresh" action. */
  const acknowledgeAndRefetch = useCallback(() => {
    if (data) {
      const allVersions = [...data.expectedArrivals, ...data.waiting, ...data.inConsult, ...data.done].map(
        (entry) => entry.changeMetadata.staleVersion,
      );
      knownVersionRef.current = Math.max(0, ...allVersions);
    }
    refetch();
  }, [data, refetch]);

  /** D-43: same state-machine transition mobile uses, via the browser route. */
  const updateStatus = useCallback(
    async (entryId: string, status: string) => {
      if (!accessToken) return;
      await apiClient(`/api/v1/queue/web/entries/${entryId}/status`, {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({ status }),
      });
      await load();
    },
    [accessToken, load],
  );

  return { data, isLoading, error, refetch, acknowledgeAndRefetch, updateStatus };
}
