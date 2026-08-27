'use client';

// Plan 10-05 Task 2: scoped mobile-replay broadcasts reaching the browser
// queue board. Ported from `useQueueRealtime.ts`'s own socket setup (same
// handshake auth token, same websocket-only transport, same reconnection
// policy) -- the one difference is the event names/payload shape, which
// come from `apps/api/src/modules/sync/services/replayBroadcast.service.ts`'s
// `REPLAY_BROADCAST_EVENTS` rather than the browser-sync `QUEUE_BOARD_SYNC`
// event `useQueueRealtime.ts` already owns. Both hooks are meant to run
// side by side on the same queue board: `useQueueRealtime` for a same-tab
// mutation's own change metadata, this hook for a REPLAYED mobile change
// landing on a row this tab is showing.
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/** Mirrors `REPLAY_BROADCAST_EVENTS` (`apps/api/src/modules/sync/services/replayBroadcast.service.ts`) -- duplicated as a literal for the same reason `useQueueRealtime.ts` duplicates `QUEUE_BOARD_SYNC_EVENT`: this is a browser-only consumer, not the shared mobile `SOCKET_EVENTS` contract. */
const REPLAY_APPLIED_EVENT = 'replay:applied';
const REPLAY_CONFLICT_OPENED_EVENT = 'replay:conflict-opened';

interface ReplayBroadcastPayload {
  clinicId: string;
  domain: string;
  entityIds: string[];
}

const QUEUE_DOMAIN = 'queue';

/**
 * Subscribes to scoped replay-broadcast events and forwards only the ones
 * whose `domain` is `'queue'` to the caller (defense in depth beyond the
 * server's own `clinic:${clinicId}` room scoping, T-10-09) -- pairs with
 * `useReplayStaleState`'s `onReplayApplied`/`onReplayConflictOpened`.
 */
export function useQueueReplayRealtime(
  accessToken: string | null,
  activeClinicId: string | null,
  onReplayApplied: (entityIds: string[]) => void,
  onReplayConflictOpened: (entityIds: string[]) => void,
): void {
  const socketRef = useRef<Socket | null>(null);
  const onReplayAppliedRef = useRef(onReplayApplied);
  onReplayAppliedRef.current = onReplayApplied;
  const onReplayConflictOpenedRef = useRef(onReplayConflictOpened);
  onReplayConflictOpenedRef.current = onReplayConflictOpened;

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

    socket.on(REPLAY_APPLIED_EVENT, (payload: ReplayBroadcastPayload) => {
      if (payload.domain !== QUEUE_DOMAIN) return;
      onReplayAppliedRef.current(payload.entityIds);
    });

    socket.on(REPLAY_CONFLICT_OPENED_EVENT, (payload: ReplayBroadcastPayload) => {
      if (payload.domain !== QUEUE_DOMAIN) return;
      onReplayConflictOpenedRef.current(payload.entityIds);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, activeClinicId]);
}
