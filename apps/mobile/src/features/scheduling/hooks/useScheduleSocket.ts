import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events';
import { useScheduleUIStore } from '../store/scheduleUIStore';
import { useAuth } from '../../../providers/AuthProvider';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * SCH-04: realtime agenda sync, ported line-for-line from
 * `useQueueSocket.ts` with the queue events swapped for Phase 8's
 * appointment/availability events and `scheduleUIStore` in place of
 * `queueUIStore`. Same authenticated `clinic:{clinicId}` room, same
 * reconnection policy -- there is no separate socket connection to spoof.
 */
export function useScheduleSocket() {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const setOffline = useScheduleUIStore((s) => s.setOffline);

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

    const invalidateSchedule = () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] });
    };

    socket.on(SOCKET_EVENTS.APPOINTMENT_CREATED, invalidateSchedule);
    socket.on(SOCKET_EVENTS.APPOINTMENT_UPDATED, invalidateSchedule);
    socket.on(SOCKET_EVENTS.APPOINTMENT_CANCELLED, invalidateSchedule);
    socket.on(SOCKET_EVENTS.AVAILABILITY_UPDATED, invalidateSchedule);

    socket.on('connect', () => {
      setOffline(false);
      invalidateSchedule();
    });

    socket.on('connect_error', () => {
      setOffline(true);
    });

    socket.on('disconnect', () => {
      setOffline(true);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [accessToken, activeClinicId, queryClient, setOffline]);

  return socketRef;
}
