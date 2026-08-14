import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
// Deep import, matching the shipped `useQueueSocket.ts`. Two import styles for
// the same module would be the only difference between these two hooks, and the
// difference would carry no meaning.
import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events';
import { useBillingUIStore } from '../store/billingUIStore';
import { useAuth } from '../../../providers/AuthProvider';
import { BILLING_DASHBOARD_QUERY_KEY } from './useBillingDashboard';
import { INVOICES_QUERY_KEY } from './useInvoices';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Keeps the Billing tab live off the server's invoice events.
 *
 * ## Why this exists rather than polling
 *
 * A Razorpay webhook lands on the server while the front desk is looking at the
 * dashboard. Without this subscription the only thing that would move the
 * invoice out of `UNPAID` on screen is a manual pull-to-refresh — so the front
 * desk's view of whether money arrived is a function of whether someone
 * happened to swipe down. That is how an invoice gets collected twice
 * (T-06-94). Pull-to-refresh is the fallback here, not the mechanism.
 *
 * `INVOICE_UPDATED` covers every lifecycle change (finalize, void, status
 * recompute); `PAYMENT_RECEIVED` covers a captured payment, including one
 * originating from a webhook. Both invalidate the invoice list *and* the
 * dashboard aggregate, because a payment moves a row's badge and the Today's
 * Revenue / Unpaid Total cards at the same time — refreshing only one of them
 * leaves the screen internally inconsistent.
 *
 * ## The early return is a security control, not an optimisation
 *
 * T-06-93: connecting without an `accessToken` would attempt an unauthenticated
 * handshake, and connecting without an `activeClinicId` would leave the client
 * with no clinic to scope its invalidations to. The server joins a socket only
 * to its own clinic's room at handshake, so this is defence in depth on the
 * client side of that boundary.
 *
 * The invoice list key is invalidated without `activeClinicId` on purpose: the
 * list key carries a serialised filter string as its last segment, so a prefix
 * match on `['invoices']` is what reaches every filter/sort combination
 * currently in cache. The dashboard key is clinic-scoped exactly.
 */
export function useInvoiceSocket() {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const setOffline = useBillingUIStore((s) => s.setOffline);

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

    const refreshBilling = () => {
      queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [...BILLING_DASHBOARD_QUERY_KEY, activeClinicId],
      });
    };

    socket.on(SOCKET_EVENTS.INVOICE_UPDATED, refreshBilling);
    socket.on(SOCKET_EVENTS.PAYMENT_RECEIVED, refreshBilling);

    socket.on('connect', () => {
      setOffline(false);
      // Anything that changed while the socket was down was never delivered, so
      // reconnecting has to refetch rather than trust the cache.
      refreshBilling();
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
