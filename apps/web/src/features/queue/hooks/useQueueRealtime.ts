'use client';

// Ported from `apps/web/src/lib/useScheduleSocket.ts` (itself ported from
// mobile's `useScheduleSocket.ts`) -- same handshake auth token, same
// websocket-only transport, same reconnection policy. The one difference:
// this subscribes to the browser-only `browser:queue-board-sync` event
// (`apps/api/src/realtime/socket.events.ts`'s `BROWSER_SYNC_EVENTS
// .QUEUE_BOARD_SYNC`) instead of the shared mobile `SOCKET_EVENTS`. That
// event name is duplicated here as a literal rather than imported from
// `@breeyo/types`, because it deliberately is NOT part of that shared
// mobile/web contract -- see `socket.events.ts`'s header for why.
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../../lib/AuthProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const QUEUE_BOARD_SYNC_EVENT = 'browser:queue-board-sync';

export type ConnectionState = 'connected' | 'reconnecting';

/** Mirrors `BrowserSyncChangeMetadata & { entryId: string }` from `apps/api/src/realtime/browser-sync.service.ts`. */
export interface QueueBoardSyncPayload {
  entryId: string;
  staleVersion: number;
  changedByUser: string | null;
  changedAt: string;
  reviewPath: string;
}

/**
 * D-40, D-42: subscribes to per-entry browser-sync pushes for a browser tab
 * that is already open when a change happens elsewhere (mobile, or another
 * browser session). Deliberately narrow -- one named event, one payload
 * shape -- rather than re-emitting the shared `QUEUE_UPDATED` event louder;
 * see `browser-sync.service.ts`'s header for why a blanket re-broadcast
 * would violate D-42.
 */
export function useQueueRealtime(onSync: (payload: QueueBoardSyncPayload) => void): ConnectionState {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

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

    socket.on(QUEUE_BOARD_SYNC_EVENT, (payload: QueueBoardSyncPayload) => onSyncRef.current(payload));

    socket.on('connect', () => setConnectionState('connected'));
    socket.on('connect_error', () => setConnectionState('reconnecting'));
    socket.on('disconnect', () => setConnectionState('reconnecting'));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, activeClinicId]);

  return connectionState;
}
