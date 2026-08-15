import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { whatsappKeys } from './whatsapp-query-keys';
import type { OwnerPreferenceInput } from '@breeyo/types';

/**
 * WHA-05 / D-11: single global per-owner reminder opt-out toggle, used both
 * for the owner-initiated STOP path (`source: 'OWNER_STOP'`) and for staff
 * manually marking a number invalid (`source: 'STAFF'`, `numberStatus:
 * 'INVALID'`). Copies `useQueueActions.ts:1-99`'s optimistic/rollback/
 * delayed-invalidation shape.
 *
 * D-24 (locked after 07-14-PLAN.md was written): WhatsApp consent capture
 * is out of scope for Phase 7's UI, and the API skips the
 * `POST /whatsapp/owners/:ownerId/consent` endpoint entirely. This file
 * therefore does NOT export a `useSetConsent` hook -- there is no server
 * route for it to call. The consent/preference warning shown in
 * `TemplateSendSheet` is advisory-only (D-13) and reads data the caller
 * already has; it is not a grant/withdraw action.
 */
export function useSetOwnerPreference(threadId?: string) {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ownerId, ...input }: OwnerPreferenceInput & { ownerId: string }) =>
      apiClient<{ data: unknown }>(`/api/v1/whatsapp/owners/${ownerId}/preference`, {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify(input),
      }),
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      // Pitfall 3 (queue precedent): small delay to avoid flicker with the
      // Socket.IO broadcast -- refresh both the thread (STOP/invalid-number
      // indicators) and the inbox list (badge state) after it settles.
      setTimeout(() => {
        if (!activeClinicId) return;
        queryClient.invalidateQueries({ queryKey: whatsappKeys.threadsRoot(activeClinicId) });
        if (threadId) {
          queryClient.invalidateQueries({ queryKey: whatsappKeys.thread(activeClinicId, threadId) });
        }
      }, 300);
    },
  });
}
