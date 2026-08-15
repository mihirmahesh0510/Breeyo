import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { showToast } from '@breeyo/ui';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { whatsappKeys } from './whatsapp-query-keys';
import type { ClinicConfigInput } from '@breeyo/types';

const ADMIN_ONLY_COPY = 'Only an Admin can change WhatsApp simulator settings.';

/**
 * WHA-05 / D-20: per-clinic simulator/provider config. `useSimulatorConfig`
 * is a plain `useQuery` following `useQueue.ts`'s auth-guard shape;
 * `useUpdateSimulatorConfig` follows `useQueueActions.ts:1-99`'s optimistic/
 * rollback/delayed-invalidation shape. Non-Admin roles are refused by
 * `MANAGE_CLINIC_SETTINGS` server-side (D-20) -- a 403 here is surfaced as a
 * clear Admin-only message rather than a generic failure toast.
 */
export function useSimulatorConfig() {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: whatsappKeys.config(activeClinicId ?? ''),
    queryFn: () =>
      apiClient<{ data: ClinicConfigInput }>('/api/v1/whatsapp/config', {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export function useUpdateSimulatorConfig() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<ClinicConfigInput>) =>
      apiClient<{ data: ClinicConfigInput }>('/api/v1/whatsapp/config', {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      if (!activeClinicId) return undefined;
      const queryKey = whatsappKeys.config(activeClinicId);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<{ data: ClinicConfigInput }>(queryKey);
      if (previous) {
        queryClient.setQueryData<{ data: ClinicConfigInput }>(queryKey, (old) =>
          old ? { data: { ...old.data, ...input } } : old,
        );
      }
      return { previous, queryKey };
    },
    onError: (err, _vars, context) => {
      if (context?.previous && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (err instanceof ApiClientError && err.status === 403) {
        showToast('error', ADMIN_ONLY_COPY);
        return;
      }
      showToast('error', err instanceof ApiClientError ? err.message : 'Could not update simulator settings.');
    },
    onSettled: () => {
      setTimeout(() => {
        if (activeClinicId) {
          queryClient.invalidateQueries({ queryKey: whatsappKeys.config(activeClinicId) });
        }
      }, 300);
    },
  });
}
