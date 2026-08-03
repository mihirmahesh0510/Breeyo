import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { QueueBoard, QueueEntryWithPet, QueueStatus } from '@breeyo/types';

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
          const allEntries = [
            ...old.inConsult,
            ...old.waiting,
            ...old.done,
          ];
          const entry = allEntries.find((e) => e.id === entryId);
          if (!entry) return old;

          const updated = { ...entry, status: status as string } as QueueEntryWithPet;
          const removeEntry = (list: QueueEntryWithPet[]) =>
            list.filter((e) => e.id !== entryId);

          const newBoard: QueueBoard = {
            inConsult: removeEntry(old.inConsult),
            waiting: removeEntry(old.waiting),
            done: removeEntry(old.done),
          };

          if (status === 'IN_CONSULT') {
            newBoard.inConsult.push(updated);
          } else if (status === 'WAITING') {
            newBoard.waiting.push(updated);
          } else {
            newBoard.done.push(updated);
          }

          return newBoard;
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
