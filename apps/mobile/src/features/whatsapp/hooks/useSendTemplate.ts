import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { showToast } from '@breeyo/ui';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { whatsappKeys } from './whatsapp-query-keys';
import { failureCopy } from '../utils/whatsapp-format';
import type {
  SendTemplateInput,
  WaFailureCode,
  WhatsAppMessageView,
  WhatsAppThreadWithOwner,
} from '@breeyo/types';

interface ThreadDetailData {
  thread: WhatsAppThreadWithOwner;
  messages: WhatsAppMessageView[];
}

interface ThreadDetailResponse {
  data: ThreadDetailData;
}

/** UI-SPEC's exact STOP-state send-time warning copy (D-10/D-11/D-13). */
const OWNER_OPTED_OUT_COPY =
  'Owner has opted out of reminders. Transactional messages still need staff review.';

/**
 * WHA-02 / D-04, D-13: send a template. Copies `useQueueActions.ts:1-99`'s
 * shape -- optimistic `onMutate` inserting a synthetic `QUEUED` bubble
 * (temporary id, replaced by the server row once the 300ms-delayed
 * invalidation refetches), rollback + error haptics in `onError`, and the
 * same Socket.IO-race-avoiding delayed invalidation in `onSettled` the
 * thread is socket-driven too.
 */
export function useSendTemplate(threadId: string | undefined) {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendTemplateInput) =>
      apiClient<{ data: { messageId: string } }>('/api/v1/whatsapp/send', {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(input),
      }),
    onMutate: async (input: SendTemplateInput) => {
      if (!threadId || !activeClinicId) return undefined;

      const queryKey = whatsappKeys.thread(activeClinicId, threadId);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<ThreadDetailResponse>(queryKey);
      if (previous) {
        const optimisticMessage: WhatsAppMessageView = {
          id: `optimistic-${Date.now()}`,
          direction: 'OUTBOUND',
          channel: 'SIMULATOR',
          templateKey: input.templateKey,
          templateCategory: null,
          body: '',
          status: 'QUEUED',
          failureCode: null,
          failureReason: null,
          contextType: input.contextType,
          contextId: input.contextId ?? null,
          interactiveOptions: null,
          mediaFilename: null,
          staffNote: input.staffNote ?? null,
          sentByUserId: null,
          createdAt: new Date(),
          sentAt: null,
          deliveredAt: null,
          readAt: null,
        };

        queryClient.setQueryData<ThreadDetailResponse>(queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            data: {
              ...old.data,
              messages: [...old.data.messages, optimisticMessage],
            },
          };
        });
      }

      return { previous, queryKey };
    },
    onSuccess: () => {
      showToast('success', 'Message queued');
    },
    onError: (err, _vars, context) => {
      if (context?.previous && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (err instanceof ApiClientError && err.code === 'OWNER_OPTED_OUT') {
        showToast('error', OWNER_OPTED_OUT_COPY);
        return;
      }

      // The server's error code is a general ApiClientError code, not
      // necessarily one of the normalized WaFailureCode values -- failureCopy
      // has a total fallback (see whatsapp-format.ts) so an unrecognized
      // code still renders the generic failure copy rather than `undefined`.
      const code = err instanceof ApiClientError ? (err.code as WaFailureCode) : undefined;
      showToast('error', failureCopy(code));
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
