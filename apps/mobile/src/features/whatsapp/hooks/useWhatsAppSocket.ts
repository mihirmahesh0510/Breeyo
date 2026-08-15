import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events';
import { useWhatsAppUIStore } from '../store/whatsappUIStore';
import { useAuth } from '../../../providers/AuthProvider';
import { whatsappKeys } from './whatsapp-query-keys';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * WHA-05: realtime inbox/thread updates, copying `useQueueSocket.ts`
 * verbatim with the events and cache keys swapped for WhatsApp's. The
 * server broadcasts into the `clinic:{clinicId}` room (same JWT handshake
 * as the queue socket, so no separate auth path exists to spoof), and this
 * hook invalidates `whatsappKeys.threadsRoot(...)` -- a strict prefix of
 * every filter/search variant -- plus the specific `whatsappKeys.thread(...)`
 * entry when the payload names a thread, so an open thread and the inbox
 * both refresh without a manual pull-to-refresh.
 */
export function useWhatsAppSocket() {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const setOffline = useWhatsAppUIStore((s) => s.setOffline);

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

    const invalidateThread = (payload?: { threadId?: string }) => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.threadsRoot(activeClinicId) });
      if (payload?.threadId) {
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.thread(activeClinicId, payload.threadId),
        });
      }
    };

    socket.on(SOCKET_EVENTS.WHATSAPP_MESSAGE_CREATED, (payload?: { threadId?: string }) => {
      invalidateThread(payload);
    });

    socket.on(SOCKET_EVENTS.WHATSAPP_MESSAGE_STATUS_CHANGED, (payload?: { threadId?: string }) => {
      invalidateThread(payload);
    });

    socket.on(SOCKET_EVENTS.WHATSAPP_THREAD_UPDATED, (payload?: { threadId?: string }) => {
      invalidateThread(payload);
    });

    socket.on('connect', () => {
      setOffline(false);
      queryClient.invalidateQueries({ queryKey: whatsappKeys.threadsRoot(activeClinicId) });
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
