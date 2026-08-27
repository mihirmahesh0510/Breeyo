import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, BackHandler, Linking, Pressable } from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SkeletonLoader, EmptyState, BottomSheet, colors } from '@breeyo/ui';
import type { WaSlotOption, WhatsAppMessageView } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { useWhatsAppThread } from '../hooks/useWhatsAppThread';
import { useWhatsAppSocket } from '../hooks/useWhatsAppSocket';
import { useRetryMessage } from '../hooks/useRetryMessage';
import { useMarkResolved, useCancelBooking, useMoveBooking } from '../hooks/useBookingActions';
import { whatsappKeys } from '../hooks/whatsapp-query-keys';
import { WA_COLORS } from '../utils/whatsapp-format';
import { MessageBubble } from '../components/MessageBubble';
import { ConversationActionCard } from '../components/ConversationActionCard';
import { QuickReplyChip } from '../components/QuickReplyChip';
import { BookingDetailCard, type BookingDetailCardBooking } from '../components/BookingDetailCard';

/**
 * WHA-05 / D-04, D-09: the staff thread view. Composes `useWhatsAppThread`,
 * `useWhatsAppSocket`, `useRetryMessage` and `useMarkResolved` (plus
 * `useCancelBooking`/`useMoveBooking` from the same `useBookingActions.ts`
 * module, needed to drive the cancel/move `ConversationActionCard`
 * variants D-09 requires). No free-text send box exists anywhere on this
 * screen -- the only outbound send path is `TemplateSendSheet`, launched
 * from other surfaces (UI-SPEC: no NLP in Beta).
 */
const EMPTY_TITLE = 'No messages in this thread yet';
const EMPTY_BODY = 'Send a template from an invoice, reminder, booking, pet profile, or document view.';
const FAILED_BANNER_COPY = 'Message failed. Check the reason and retry when ready.';
const THREAD_LOAD_ERROR_COPY = 'Could not load this conversation. Pull down to try again.';
const CANCEL_BOOKING_CONFIRM_COPY =
  'Cancel this booking? The owner will see the booking as cancelled, and the reason will be saved in the thread.';

/**
 * D-26 (locked after 07-15-PLAN.md was written): `confirm_booking` must be a
 * LIVE, tappable action that opens the booking's detail, not a read-only
 * receipt. This fetches `GET /whatsapp/bookings/:bookingId` via `apiClient`
 * and hands the result to the dedicated `BookingDetailCard` component
 * (built in 07-16) for rendering. It keys off `whatsappKeys.booking`, the
 * same cache key `useCancelBooking`/`useMoveBooking` (invoked inside
 * `BookingDetailCard`) cancel in-flight requests against on mutate.
 */
function useBookingDetailQuery(bookingId: string | null) {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: whatsappKeys.booking(activeClinicId ?? '', bookingId ?? ''),
    queryFn: () =>
      apiClient<{ data: BookingDetailCardBooking }>(`/api/v1/whatsapp/bookings/${bookingId}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId && !!bookingId,
    select: (response) => response.data,
  });
}

/** D-09: the offerable clinic-hours slots a staff Move can pick from. */
function useInlineOfferableSlots(enabled: boolean) {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: ['whatsapp-inline-slots', activeClinicId],
    queryFn: () =>
      apiClient<{ data: { slots: WaSlotOption[]; reason?: string } }>('/api/v1/whatsapp/slots', {
        token: accessToken!,
      }),
    enabled: enabled && !!accessToken && !!activeClinicId,
    select: (response) => response.data,
  });
}

type SheetMode = 'none' | 'cancelBooking' | 'moveBooking' | 'bookingDetail';

interface WhatsAppThreadScreenProps {
  threadId: string;
}

export function WhatsAppThreadScreen({ threadId }: WhatsAppThreadScreenProps) {
  // Realtime updates so the simulator's auto-reply and status changes land
  // without a manual refresh (D-14).
  useWhatsAppSocket();

  const { data, isLoading, isError, refetch, isFetching } = useWhatsAppThread(threadId);
  const thread = data?.thread;
  const messages = data?.messages ?? [];

  const retryMessage = useRetryMessage(threadId);
  const markResolved = useMarkResolved();
  const cancelBooking = useCancelBooking(threadId);
  const moveBooking = useMoveBooking(threadId);

  const [sheetMode, setSheetMode] = useState<SheetMode>('none');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const listRef = useRef<FlatList<WhatsAppMessageView>>(null);

  const bookingDetailQuery = useBookingDetailQuery(
    sheetMode === 'bookingDetail' ? selectedBookingId : null,
  );
  const slotsQuery = useInlineOfferableSlots(sheetMode === 'moveBooking');

  // UI-SPEC Accessibility Contract: "Android hardware back returns from
  // thread to inbox; from bottom sheet it dismisses the sheet first." A
  // sheet consumes the back press and closes itself; otherwise the event is
  // left unhandled so Expo Router's default Stack pop (thread -> inbox)
  // proceeds exactly as it does for any other detail screen in this app.
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetMode !== 'none') {
        setSheetMode('none');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [sheetMode]);

  const closeSheet = useCallback(() => {
    setSheetMode('none');
    setSelectedBookingId(null);
    setCancelReason('');
  }, []);

  const handleRetry = useCallback(
    (messageId: string) => {
      retryMessage.mutate(messageId);
    },
    [retryMessage],
  );

  const handleCallOwner = useCallback(() => {
    if (!thread?.waPhone) return;
    Linking.openURL(`tel:${thread.waPhone}`);
  }, [thread?.waPhone]);

  const handleMarkResolved = useCallback(() => {
    markResolved.mutate(threadId);
  }, [markResolved, threadId]);

  const openBookingDetail = useCallback((bookingId: string) => {
    setSelectedBookingId(bookingId);
    setSheetMode('bookingDetail');
  }, []);

  const openCancelSheet = useCallback((bookingId: string) => {
    setSelectedBookingId(bookingId);
    setCancelReason('');
    setSheetMode('cancelBooking');
  }, []);

  const openMoveSheet = useCallback((bookingId: string) => {
    setSelectedBookingId(bookingId);
    setSheetMode('moveBooking');
  }, []);

  const handleConfirmCancel = useCallback(() => {
    if (!selectedBookingId || !cancelReason.trim()) return;
    cancelBooking.mutate(
      { bookingId: selectedBookingId, reason: cancelReason.trim() },
      { onSuccess: closeSheet },
    );
  }, [cancelBooking, selectedBookingId, cancelReason, closeSheet]);

  const handleSelectSlot = useCallback(
    (slot: WaSlotOption) => {
      if (!selectedBookingId) return;
      moveBooking.mutate(
        {
          bookingId: selectedBookingId,
          slotDate: slot.slotDate,
          slotStartMinutes: slot.slotStartMinutes,
          slotDurationMinutes: slot.slotDurationMinutes,
        },
        { onSuccess: closeSheet },
      );
    },
    [moveBooking, selectedBookingId, closeSheet],
  );

  // The most recent booking-context message is where the confirm/cancel/
  // move action-card group renders -- older booking touchpoints in the same
  // thread stay historical bubbles without a repeated action group.
  const latestBookingMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].contextType === 'BOOKING' && messages[i].contextId) return messages[i].id;
    }
    return null;
  }, [messages]);

  const hasFailedMessage = messages.some((m) => m.status === 'FAILED');

  const renderMessage = useCallback(
    ({ item }: { item: WhatsAppMessageView }) => {
      const isFailedInvoice = item.status === 'FAILED' && item.contextType === 'INVOICE';
      const hasQuickReplies = !!item.interactiveOptions && item.interactiveOptions.length > 0;

      return (
        <View>
          <MessageBubble
            message={item}
            onRetry={item.status === 'FAILED' ? () => handleRetry(item.id) : undefined}
            onCallOwner={item.status === 'FAILED' ? handleCallOwner : undefined}
            onMarkResolved={item.status === 'FAILED' ? handleMarkResolved : undefined}
          />

          {hasQuickReplies && (
            <View style={styles.quickReplyRow}>
              {item.interactiveOptions!.map((option) => (
                <QuickReplyChip
                  key={option.id}
                  label={option.title}
                  payload={option.id}
                  disabled
                  // D-09/D-14/D-15: these are the OWNER's presented reply
                  // options, rendered here only so staff can see what the
                  // owner was offered. The simulator auto-replies on its own
                  // (D-14), and staff never act as the owner (D-09), so
                  // these chips are informational, not tappable.
                  onPress={() => {}}
                />
              ))}
            </View>
          )}

          {isFailedInvoice && (
            <View style={styles.actionCardWrap}>
              <ConversationActionCard
                variant="retry_invoice"
                title="Retry Invoice"
                body="This invoice message failed to send."
                loading={retryMessage.isPending}
                onPress={() => handleRetry(item.id)}
              />
            </View>
          )}

          {item.id === latestBookingMessageId && (
            <View style={styles.actionCardWrap}>
              <ConversationActionCard
                variant="confirm_booking"
                title="View Booking"
                body="Tap to see the confirmed slot and status."
                onPress={() => openBookingDetail(item.contextId!)}
              />
              <ConversationActionCard
                variant="cancel_booking"
                title="Cancel Booking"
                body="Staff can cancel this confirmed booking."
                onPress={() => openCancelSheet(item.contextId!)}
              />
              <ConversationActionCard
                variant="move_booking"
                title="Move Booking"
                body="Pick a different available slot."
                onPress={() => openMoveSheet(item.contextId!)}
              />
            </View>
          )}
        </View>
      );
    },
    [
      handleRetry,
      handleCallOwner,
      handleMarkResolved,
      retryMessage.isPending,
      latestBookingMessageId,
      openBookingDetail,
      openCancelSheet,
      openMoveSheet,
    ],
  );

  const showEmpty = !isLoading && !isError && messages.length === 0;
  const bookingDetail = bookingDetailQuery.data;
  const slots = slotsQuery.data?.slots ?? [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: thread?.ownerName ?? 'Conversation' }} />

      <View style={styles.header}>
        <Text style={styles.mobile}>{thread?.waPhone ?? ''}</Text>
        {thread?.needsAction && (
          <View style={styles.needsActionPill}>
            <Text style={styles.needsActionPillText}>Needs action</Text>
          </View>
        )}
      </View>

      {thread?.needsAction && (
        <View style={styles.actionCardWrap}>
          <ConversationActionCard
            variant="call_owner"
            title="Call Owner"
            body={thread.needsActionReason ?? 'This thread needs a human follow-up.'}
            onPress={handleCallOwner}
          />
          <ConversationActionCard
            variant="mark_resolved"
            title="Mark Resolved"
            loading={markResolved.isPending}
            onPress={handleMarkResolved}
          />
        </View>
      )}

      {isError && (
        <View style={styles.errorBanner}>
          <Text variant="bodySmall" style={styles.errorBannerText}>
            {THREAD_LOAD_ERROR_COPY}
          </Text>
        </View>
      )}

      {hasFailedMessage && (
        <View style={styles.failedBanner}>
          <Text variant="bodySmall" style={styles.failedBannerText}>
            {FAILED_BANNER_COPY}
          </Text>
        </View>
      )}

      <View style={styles.listArea}>
        {isLoading ? (
          <SkeletonLoader type="card" count={5} testID="whatsapp-thread-skeleton" />
        ) : showEmpty ? (
          <EmptyState title={EMPTY_TITLE} description={EMPTY_BODY} testID="whatsapp-thread-empty" />
        ) : (
          <FlatList<WhatsAppMessageView>
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            onRefresh={refetch}
            refreshing={isFetching && !isLoading}
            testID="whatsapp-thread-list"
          />
        )}
      </View>

      {/* Cancel booking -- UI-SPEC's exact destructive confirmation copy (D-09). */}
      <BottomSheet visible={sheetMode === 'cancelBooking'} onDismiss={closeSheet} title="Cancel Booking">
        <Text variant="bodyMedium" style={styles.sheetBody}>
          {CANCEL_BOOKING_CONFIRM_COPY}
        </Text>
        <TextInput
          label="Reason"
          value={cancelReason}
          onChangeText={setCancelReason}
          multiline
          style={styles.reasonInput}
          testID="cancel-booking-reason-input"
        />
        <View style={styles.sheetActionsRow}>
          <Button mode="outlined" onPress={closeSheet} accessibilityLabel="Keep Booking">
            Keep Booking
          </Button>
          <Button
            mode="contained"
            buttonColor={WA_COLORS.failed}
            disabled={!cancelReason.trim() || cancelBooking.isPending}
            loading={cancelBooking.isPending}
            onPress={handleConfirmCancel}
            accessibilityLabel="Cancel Booking"
          >
            Cancel Booking
          </Button>
        </View>
      </BottomSheet>

      {/* Move booking -- pick a different offerable clinic-hours slot (D-09). */}
      <BottomSheet visible={sheetMode === 'moveBooking'} onDismiss={closeSheet} title="Move Booking">
        {slotsQuery.isLoading ? (
          <ActivityIndicator size="small" />
        ) : slots.length === 0 ? (
          <Text variant="bodyMedium">No slots available today.</Text>
        ) : (
          slots.map((slot) => (
            <Pressable
              key={`${slot.slotDate}-${slot.slotStartMinutes}`}
              onPress={() => handleSelectSlot(slot)}
              style={styles.slotRow}
              accessibilityRole="button"
              accessibilityLabel={slot.label}
            >
              <Text variant="bodyMedium">{slot.label}</Text>
            </Pressable>
          ))
        )}
      </BottomSheet>

      {/* D-26/WHA-03: `confirm_booking` opens this sheet, which renders the
          dedicated `BookingDetailCard` (D-08/D-09) -- reference, slot,
          state, the unconditional "Check in manually..." helper text, and
          (for a CONFIRMED booking) staff-only Move/Cancel affordances with
          their own 409 SLOT_TAKEN handling, all owned by the component. */}
      <BottomSheet visible={sheetMode === 'bookingDetail'} onDismiss={closeSheet} title="Booking">
        {bookingDetailQuery.isLoading ? (
          <ActivityIndicator size="small" />
        ) : bookingDetailQuery.isError || !bookingDetail ? (
          <Text variant="bodyMedium">Could not load this booking.</Text>
        ) : (
          <BookingDetailCard booking={bookingDetail} onMove={closeSheet} onCancel={closeSheet} />
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WA_COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  // UI-SPEC Typography: mobile number/metadata uses the 12px Label role.
  mobile: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.secondary,
  },
  needsActionPill: {
    backgroundColor: 'rgba(230, 81, 0, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  needsActionPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: WA_COLORS.needsAction,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(186, 26, 26, 0.1)',
  },
  errorBannerText: {
    color: WA_COLORS.failed,
  },
  failedBanner: {
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(186, 26, 26, 0.1)',
  },
  failedBannerText: {
    color: WA_COLORS.failed,
  },
  listArea: {
    flex: 1,
  },
  quickReplyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  actionCardWrap: {
    paddingHorizontal: 16,
    gap: 8,
    marginVertical: 4,
  },
  sheetBody: {
    marginBottom: 12,
    color: '#1C1B1F',
  },
  reasonInput: {
    backgroundColor: WA_COLORS.background,
    marginBottom: 12,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  slotRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.secondaryContainer,
  },
});
