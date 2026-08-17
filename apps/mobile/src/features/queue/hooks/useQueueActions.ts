import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { QueueBoard, QueueEntryWithPet, QueueStatus } from '@breeyo/types';
import { applyOptimisticStatusChange } from '../lib/queue-optimistic';

interface StatusUpdateParams {
  entryId: string;
  status: QueueStatus;
}

export function useUpdateQueueStatus() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, status }: StatusUpdateParams) =>
      apiClient<{ data: QueueEntryWithPet }>(
        `/api/v1/queue/${entryId}/status`,
        {
          method: 'PATCH',
          token: accessToken!,
          body: JSON.stringify({ status }),
        },
      ),
    onMutate: async ({ entryId, status }) => {
      const today = new Date().toISOString().split('T')[0];
      const queryKey = ['queue', activeClinicId, today];
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<QueueBoard>(queryKey);
      if (previous) {
        queryClient.setQueryData<QueueBoard>(queryKey, (old) => {
          if (!old) return old;
          return applyOptimisticStatusChange(old, entryId, status);
        });
      }
      return { previous, queryKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      // Pitfall 3: Small delay to avoid flicker with Socket.IO broadcast
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
      }, 300);
    },
  });
}

export function useCallNext() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<{ data: QueueEntryWithPet }>('/api/v1/queue/call-next', {
        method: 'POST',
        token: accessToken!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });
}
