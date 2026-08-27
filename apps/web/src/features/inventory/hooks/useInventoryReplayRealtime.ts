'use client';

// Plan 10-05 Task 2: scoped mobile-replay broadcasts reaching the browser
// inventory workbench. Same shape as `useQueueReplayRealtime.ts` (see that
// file's header for the shared rationale) -- the only difference is the
// `'inventory'` domain filter.
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const REPLAY_APPLIED_EVENT = 'replay:applied';
const REPLAY_CONFLICT_OPENED_EVENT = 'replay:conflict-opened';

interface ReplayBroadcastPayload {
  clinicId: string;
  domain: string;
  entityIds: string[];
}

const INVENTORY_DOMAIN = 'inventory';

/**
 * Subscribes to scoped replay-broadcast events and forwards only the ones
 * whose `domain` is `'inventory'` to the caller (defense in depth beyond
 * the server's own `clinic:${clinicId}` room scoping, T-10-09) -- pairs
 * with `useReplayStaleState`'s `onReplayApplied`/`onReplayConflictOpened`.
 */
export function useInventoryReplayRealtime(
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
      if (payload.domain !== INVENTORY_DOMAIN) return;
      onReplayAppliedRef.current(payload.entityIds);
    });

    socket.on(REPLAY_CONFLICT_OPENED_EVENT, (payload: ReplayBroadcastPayload) => {
      if (payload.domain !== INVENTORY_DOMAIN) return;
      onReplayConflictOpenedRef.current(payload.entityIds);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, activeClinicId]);
}
