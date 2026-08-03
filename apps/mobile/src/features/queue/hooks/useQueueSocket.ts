import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events';
import * as Haptics from 'expo-haptics';
import { useQueueUIStore } from '../store/queueUIStore';
import { useAuth } from '../../../providers/AuthProvider';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export function useQueueSocket() {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const soundEnabled = useQueueUIStore((s) => s.soundEnabled);
  const setOffline = useQueueUIStore((s) => s.setOffline);

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

    socket.on(SOCKET_EVENTS.PATIENT_CHECKED_IN, () => {
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
      if (soundEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    });

    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
      if (soundEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    });

    socket.on(SOCKET_EVENTS.QUEUE_ARCHIVED, () => {
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
    });

    socket.on('connect', () => {
      setOffline(false);
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
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
  }, [accessToken, activeClinicId, queryClient, soundEnabled, setOffline]);

  return socketRef;
}
