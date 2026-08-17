'use client';

// The first Socket.IO client in `apps/web`. Ported from
// `apps/mobile/src/features/scheduling/hooks/useScheduleSocket.ts` with
// exactly three changes: `'use client'` at the top (Next.js App Router),
// `NEXT_PUBLIC_API_URL` in place of `EXPO_PUBLIC_API_URL`, and no
// `expo-haptics` (there is no haptic feedback API on web). The client
// handshake auth token and websocket-only transport option below are kept
// verbatim: the server (`apps/api/src/realtime/socket.ts:34-49`) requires
// the handshake token and rejects anything but a websocket transport, so
// dropping either breaks the connection outright.
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@breeyo/types';
import { useAuth } from './AuthProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export type ConnectionState = 'connected' | 'reconnecting';

/**
 * Subscribes to the four scheduling realtime events in the clinic's
 * Socket.IO room and calls `onEvent` (the page's own `refetch`) for each.
 * Returns the connection state for the header's "Live updates paused"
 * caption strip (SCH-04 / UI-SPEC § Error states).
 */
export function useScheduleSocket(onEvent: () => void): ConnectionState {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

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

    const notify = () => onEventRef.current();

    socket.on(SOCKET_EVENTS.APPOINTMENT_CREATED, notify);
    socket.on(SOCKET_EVENTS.APPOINTMENT_UPDATED, notify);
    socket.on(SOCKET_EVENTS.APPOINTMENT_CANCELLED, notify);
    socket.on(SOCKET_EVENTS.AVAILABILITY_UPDATED, notify);

    socket.on('connect', () => {
      setConnectionState('connected');
      notify();
    });

    socket.on('connect_error', () => {
      setConnectionState('reconnecting');
    });

    socket.on('disconnect', () => {
      setConnectionState('reconnecting');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, activeClinicId]);

  return connectionState;
}
