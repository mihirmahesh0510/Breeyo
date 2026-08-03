import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { QueueEntryWithPet } from '@breeyo/types';

interface CheckInParams {
  petId: string;
  visitReason?: string;
  isEmergency?: boolean;
  reCheckIn?: boolean;
}

export function useCheckIn() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CheckInParams) =>
      apiClient<{ data: QueueEntryWithPet }>('/api/v1/queue/check-in', {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // SAME_DAY_RECHECK and 409 conflict handled by caller
      if (error instanceof ApiClientError) {
        // Re-throw so caller can inspect error.code
        throw error;
      }
    },
  });
}
