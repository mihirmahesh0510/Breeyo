import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { showToast } from '@breeyo/ui';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { whatsappKeys } from './whatsapp-query-keys';
import type { BookingCancelInput, BookingMoveInput, WaBookingState } from '@breeyo/types';

/** Mobile-side read shape for a booking record (D-09, D-25). No dedicated
 * shared type exists yet in `@breeyo/types` for the booking response --
 * this mirrors `BookingServiceDeps`'s row shape in `apps/api/src/modules/
 * whatsapp/booking/booking.service.ts`. */
export interface WhatsAppBookingView {
  id: string;
  threadId: string;
  ownerId: string;
  petId: string;
  state: WaBookingState;
  reference: string;
  slotDate: string | null;
  slotStartMinutes: number | null;
  slotDurationMinutes: number | null;
}

const SLOT_TAKEN_COPY = 'That slot was just taken. Pick another time.';
const RESOLVE_ERROR_COPY = 'Could not mark this resolved. Try again.';

/**
 * WHA-03 / D-09: booking cancel/move/resolve. These are staff-only actions
 * (D-09 -- no owner self-service quick-reply exists to construct any of
 * these payloads), so every mutation here writes only staff-authored data.
 * Every mutation copies `useQueueActions.ts:1-99`'s shape: optimistic-safe
 * cancel of in-flight queries, error haptics, and the 300ms-delayed
 * invalidation the queue precedent uses to avoid a Socket.IO race.
 */
function invalidateBookingCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  activeClinicId: string | null,
  threadId?: string,
) {
  setTimeout(() => {
    if (!activeClinicId) return;
    queryClient.invalidateQueries({ queryKey: whatsappKeys.bookings(activeClinicId) });
    queryClient.invalidateQueries({ queryKey: whatsappKeys.threadsRoot(activeClinicId) });
    if (threadId) {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.thread(activeClinicId, threadId) });
    }
  }, 300);
}

export function useCancelBooking(threadId?: string) {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, ...input }: BookingCancelInput & { bookingId: string }) =>
      apiClient<{ data: WhatsAppBookingView }>(
        `/api/v1/whatsapp/bookings/${bookingId}/cancel`,
        {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify(input),
        },
      ),
    onMutate: async ({ bookingId }) => {
      if (!activeClinicId) return undefined;
      const queryKey = whatsappKeys.booking(activeClinicId, bookingId);
      await queryClient.cancelQueries({ queryKey });
      return { queryKey };
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      invalidateBookingCaches(queryClient, activeClinicId, threadId);
    },
  });
}

export function useMoveBooking(threadId?: string) {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, ...input }: BookingMoveInput & { bookingId: string }) =>
      apiClient<{ data: WhatsAppBookingView }>(
        `/api/v1/whatsapp/bookings/${bookingId}/move`,
        {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify(input),
        },
      ),
    onMutate: async ({ bookingId }) => {
      if (!activeClinicId) return undefined;
      const queryKey = whatsappKeys.booking(activeClinicId, bookingId);
      await queryClient.cancelQueries({ queryKey });
      return { queryKey };
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // SLOT_TAKEN (409): the requested slot was claimed by another request
      // between the staff picking it and the server committing the move --
      // surface a pick-another-time message rather than a generic failure.
      if (err instanceof ApiClientError && err.status === 409 && err.code === 'SLOT_TAKEN') {
        showToast('error', SLOT_TAKEN_COPY);
        return;
      }
      showToast('error', err instanceof ApiClientError ? err.message : 'Could not move booking.');
    },
    onSettled: () => {
      invalidateBookingCaches(queryClient, activeClinicId, threadId);
    },
  });
}

export function useMarkResolved() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) =>
      apiClient<{ data: unknown }>(`/api/v1/whatsapp/threads/${threadId}/resolve`, {
        method: 'POST',
        token: accessToken!,
      }),
    onMutate: async (threadId: string) => {
      if (!activeClinicId) return undefined;
      const queryKey = whatsappKeys.thread(activeClinicId, threadId);
      await queryClient.cancelQueries({ queryKey });
      return { queryKey };
    },
    onSuccess: () => {
      showToast('success', 'Action marked resolved');
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('error', RESOLVE_ERROR_COPY);
    },
    onSettled: (_data, _err, threadId) => {
      invalidateBookingCaches(queryClient, activeClinicId, threadId);
    },
  });
}
