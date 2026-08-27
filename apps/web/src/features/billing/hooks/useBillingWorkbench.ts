'use client';

// Same shape as `useQueueBoard.ts`/`useInventoryWorkbench.ts`. This hook
// also owns the realtime subscription directly (unlike queue, billing has
// no separate `useBillingRealtime.ts` -- Plan 09-04 keeps billing's
// browser-sync push folded into its one workbench hook rather than a
// second file, since nothing else on this page needs it split out).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth, handleUnauthorized } from '../../../lib/AuthProvider';
import { useReplayStaleState } from '../../dashboard/hooks/useReplayStaleState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const BILLING_WORKBENCH_SYNC_EVENT = 'browser:billing-workbench-sync';

/** Mirrors `BrowserSyncChangeMetadata` (`apps/api/src/realtime/socket.events.ts`). */
export interface BillingChangeMetadata {
  staleVersion: number;
  changedByUser: string | null;
  changedAt: string;
  reviewPath: string;
}

export interface BillingInvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  grandTotalPaise: number;
  balancePaise: number;
  createdAt: string;
  dueDate: string | null;
  petName: string | null;
  ownerName: string | null;
  exceptionFlag: string | null;
  changeMetadata: BillingChangeMetadata;
}

export interface BillingRecentPayment {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  petName: string | null;
  ownerName: string | null;
  amountPaise: number;
  method: string;
  paidAt: string | null;
  recordedByName: string | null;
}

export interface BillingWorkbenchResponse {
  unpaid: BillingInvoiceRow[];
  overdue: BillingInvoiceRow[];
  recentPayments: BillingRecentPayment[];
  /** D-22: server-derived -- the UI hides refund/void entirely when false, it never merely disables them. */
  refundAllowed: boolean;
  voidAllowed: boolean;
  staleState: 'fresh' | 'stale';
  serverUpdatedAt: string;
}

export interface BillingWorkbenchSyncPayload {
  invoiceId: string;
  staleVersion: number;
  changedByUser: string | null;
  changedAt: string;
  reviewPath: string;
}

/**
 * `GET /api/v1/billing/web/workbench` plus the three write actions
 * (collect-payment, refund, void). D-22: `refundAllowed`/`voidAllowed` come
 * straight from the server payload and are never overridden or assumed
 * client-side -- this hook does not, for example, default them to `true`
 * while loading.
 */
export function useBillingWorkbench() {
  const { accessToken, activeClinicId } = useAuth();
  const [data, setData] = useState<BillingWorkbenchResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);
  const [realtimeNotice, setRealtimeNotice] = useState<BillingWorkbenchSyncPayload | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const knownVersionRef = useRef<number | undefined>(undefined);
  const socketRef = useRef<Socket | null>(null);

  // Verify-fix 10.3 (D-05): billing has no dedicated mobile-replay socket
  // hook (billing invoices are never captured offline in the first place --
  // Phase 6 D-41), so its own offline-recovery race is a stale BROWSER write
  // racing another session, caught by `billing-workbench.service.ts`'s
  // `expectedVersion` check and surfaced as a 409 `.conflict` payload
  // (`collectPayment` below). Mounted here rather than in
  // `BillingWorkbench.tsx` because that write-rejection handler lives in
  // this hook, matching this file's own header: billing folds its realtime/
  // mutation state into the one workbench hook rather than a second file.
  const watchedInvoiceIds = useMemo(
    () => (data ? [...data.unpaid, ...data.overdue].map((row) => row.id) : []),
    [data],
  );
  const replayStale = useReplayStaleState(watchedInvoiceIds);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!accessToken) return;
      setIsLoading(true);
      setError(null);
      try {
        const query = knownVersionRef.current !== undefined ? `?knownVersion=${knownVersionRef.current}` : '';
        const response = await apiClient<{ data: BillingWorkbenchResponse }>(`/api/v1/billing/web/workbench${query}`, {
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

  // D-40/D-42: a browser-sync push while this tab is open sets an inline
  // stale notice rather than silently re-rendering the workbench.
  useEffect(() => {
    if (!accessToken || !activeClinicId) return;

    const socket = io(API_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on(BILLING_WORKBENCH_SYNC_EVENT, (payload: BillingWorkbenchSyncPayload) => {
      setRealtimeNotice(payload);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, activeClinicId]);

  const refetch = useCallback(() => setRefetchToken((n) => n + 1), []);

  const acknowledgeAndRefetch = useCallback(() => {
    if (data) {
      const versions = [...data.unpaid, ...data.overdue].map((row) => row.changeMetadata.staleVersion);
      knownVersionRef.current = Math.max(0, ...versions);
    }
    setRealtimeNotice(null);
    // Verify-fix 10.3: the same "Refresh" action also clears an open
    // write-rejection conflict prompt -- D-11 says unresolved conflicts stay
    // visible until actually cleared, and this IS that explicit clearing.
    replayStale.acknowledge();
    refetch();
  }, [data, refetch, replayStale]);

  const dismissRealtimeNotice = useCallback(() => setRealtimeNotice(null), []);

  const dismissMutationError = useCallback(() => setMutationError(null), []);

  /**
   * D-42/D-43: a rejected mutation is exactly the "action-blocking exception"
   * case toasts are reserved for -- this is the one place that message gets
   * surfaced instead of propagating as an unhandled rejection from an
   * unawaited `onClick`.
   */
  function describeMutationFailure(err: unknown, fallback: string): string {
    return err instanceof ApiClientError ? err.message : fallback;
  }

  /** D-05: Front Desk and Admin both call this. */
  const collectPayment = useCallback(
    async (invoiceId: string, amountPaise?: number) => {
      if (!accessToken) return;
      try {
        await apiClient(`/api/v1/billing/web/invoices/${invoiceId}/collect-payment`, {
          method: 'POST',
          token: accessToken,
          body: JSON.stringify(amountPaise !== undefined ? { amountPaise } : {}),
        });
        await load();
      } catch (err) {
        // Verify-fix 10.3 (D-05): a 409 STALE_WRITE_CONFLICT is a real,
        // review-before-overwrite conflict, not a generic mutation failure --
        // routes through the same stale-state mechanism a mobile-replay
        // broadcast would use so `StaleStateBanner` can render
        // `status="conflict"` instead of only a toast the caller could miss
        // or dismiss without ever seeing the other session's edit.
        if (err instanceof ApiClientError && err.conflict) {
          replayStale.onReplayConflictOpened([err.conflict.entityId]);
        }
        setMutationError(describeMutationFailure(err, 'Could not collect payment. Try again.'));
      }
    },
    [accessToken, load, replayStale],
  );

  /** D-22: the server re-checks Admin-only itself; a 403 here means the flag was stale or bypassed and propagates as an error, never a silent success. */
  const refundInvoice = useCallback(
    async (invoiceId: string, amountPaise: number, reason: string) => {
      if (!accessToken) return;
      try {
        await apiClient(`/api/v1/billing/web/invoices/${invoiceId}/refund`, {
          method: 'POST',
          token: accessToken,
          body: JSON.stringify({ amountPaise, reason }),
        });
        await load();
      } catch (err) {
        setMutationError(describeMutationFailure(err, 'Could not process refund. Try again.'));
      }
    },
    [accessToken, load],
  );

  const voidInvoice = useCallback(
    async (invoiceId: string, reason: string) => {
      if (!accessToken) return;
      try {
        await apiClient(`/api/v1/billing/web/invoices/${invoiceId}/void`, {
          method: 'POST',
          token: accessToken,
          body: JSON.stringify({ reason, restoreStock: true }),
        });
        await load();
      } catch (err) {
        setMutationError(describeMutationFailure(err, 'Could not void invoice. Try again.'));
      }
    },
    [accessToken, load],
  );

  return {
    data,
    isLoading,
    error,
    refetch,
    acknowledgeAndRefetch,
    realtimeNotice,
    dismissRealtimeNotice,
    mutationError,
    dismissMutationError,
    collectPayment,
    refundInvoice,
    voidInvoice,
    // Verify-fix 10.3: drives `StaleStateBanner`'s real status prop on
    // `BillingWorkbench` -- `'conflict'` after a rejected stale write,
    // `'stale'`/`'fresh'` otherwise.
    replayStatus: replayStale.status,
  };
}
