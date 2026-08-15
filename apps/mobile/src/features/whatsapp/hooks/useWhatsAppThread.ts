import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { whatsappKeys } from './whatsapp-query-keys';
import type { WhatsAppMessageView, WhatsAppThreadWithOwner } from '@breeyo/types';

interface ThreadDetailResponse {
  data: {
    thread: WhatsAppThreadWithOwner;
    messages: WhatsAppMessageView[];
  };
}

/**
 * WHA-05: thread detail query -- copies `useQueue.ts`'s auth-guard shape.
 * `placeholderData: (previous) => previous` keeps the last-known thread and
 * messages on screen across a refetch, which is what makes UI-SPEC's Thread
 * error state ("cached messages remain visible when possible") achievable
 * without any extra bookkeeping in the screen itself.
 */
export function useWhatsAppThread(threadId: string | undefined) {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: whatsappKeys.thread(activeClinicId ?? '', threadId ?? ''),
    queryFn: () =>
      apiClient<ThreadDetailResponse>(`/api/v1/whatsapp/threads/${threadId}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId && !!threadId,
    staleTime: 30_000,
    refetchOnReconnect: true,
    placeholderData: (previous) => previous,
    select: (response) => response.data,
  });
}
