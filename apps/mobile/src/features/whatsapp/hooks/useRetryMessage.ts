import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { showToast } from '@breeyo/ui';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { whatsappKeys } from './whatsapp-query-keys';

/**
 * WHA-05 / audit requirement: retry a failed message. Copies
 * `useQueueActions.ts:1-99`'s optimistic/rollback/delayed-invalidation
 * shape, but there is nothing to optimistically insert here -- the server
 * creates a brand-new message row on retry and the original failed bubble
 * stays visible with its reason (per UI-SPEC and the repudiation mitigation
 * in the plan's threat model), so `onMutate` only cancels in-flight queries
 * rather than mutating the cache.
 */
export function useRetryMessage(threadId: string | undefined) {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) =>
      apiClient<{ data: { messageId: string } }>(
        `/api/v1/whatsapp/messages/${messageId}/retry`,
        {
          method: 'POST',
          token: accessToken!,
        },
      ),
    onMutate: async () => {
      if (!threadId || !activeClinicId) return undefined;
      const queryKey = whatsappKeys.thread(activeClinicId, threadId);
      await queryClient.cancelQueries({ queryKey });
      return { queryKey };
    },
    onSuccess: () => {
      showToast('success', 'Retry queued');
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      // Pitfall 3 (queue precedent): small delay to avoid flicker with the
      // Socket.IO broadcast -- the thread cache is socket-driven too.
      setTimeout(() => {
        if (activeClinicId) {
          queryClient.invalidateQueries({ queryKey: whatsappKeys.threadsRoot(activeClinicId) });
          if (threadId) {
            queryClient.invalidateQueries({ queryKey: whatsappKeys.thread(activeClinicId, threadId) });
          }
        }
      }, 300);
    },
  });
}
