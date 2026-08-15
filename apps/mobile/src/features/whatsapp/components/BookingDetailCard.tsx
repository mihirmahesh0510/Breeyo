import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { BottomSheet } from '@breeyo/ui';
import type { WaBookingState, WaSlotOption } from '@breeyo/types';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { useCancelBooking, useMoveBooking } from '../hooks/useBookingActions';
import { whatsappKeys } from '../hooks/whatsapp-query-keys';
import { WA_COLORS } from '../utils/whatsapp-format';

/**
 * WHA-03 / D-08, D-09: the standalone booking detail display. Replaces the
 * throwaway inline booking-detail block `WhatsAppThreadScreen.tsx:428-...`
 * left in place for D-26 -- that file is not in this plan's `files_modified`
 * list, so this component exists ready to be wired in wherever a booking
 * record needs to be shown (`confirm_booking` action card, a future owner
 * detail screen, etc.) without touching that screen in this plan.
 *
 * A confirmed Phase 7 booking never enters the walk-in queue (D-08), so the
 * "Check in manually when the owner arrives." helper text renders
 * unconditionally, in every state, not just CONFIRMED.
 *
 * Move and cancel are staff-only affordances (D-09) -- both live entirely
 * inside this component (no owner-facing quick-reply constructs either
 * payload, matching `WA_BUTTON_PAYLOAD_PATTERN`'s structural exclusion) and
 * only render for a `CONFIRMED` booking, since `WA_BOOKING_TRANSITIONS`
 * only allows `CONFIRMED -> MOVED | CANCELLED`.
 */
export interface BookingDetailCardBooking {
  id: string;
  threadId?: string;
  reference: string;
  state: WaBookingState;
  slotDate: string | null;
  slotStartMinutes: number | null;
  slotDurationMinutes: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface BookingDetailCardProps {
  booking: BookingDetailCardBooking;
  /** Called after a successful staff move (in addition to this component's own cache invalidation). */
  onMove?: () => void;
  /** Called after a successful staff cancel. */
  onCancel?: () => void;
}

const BOOKING_STATE_LABELS: Record<WaBookingState, string> = {
  AWAITING_SLOT_CHOICE: 'Awaiting slot choice',
  CONFIRMED: 'Confirmed',
  MOVED: 'Moved',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const CHECK_IN_HELPER_TEXT = 'Check in manually when the owner arrives.';
const CANCEL_CONFIRM_COPY =
  'Cancel this booking? The owner will see the booking as cancelled, and the reason will be saved in the thread.';
const SLOT_TAKEN_RETRY_COPY = 'That slot was just taken. Pick another time from the refreshed list.';

type SheetMode = 'none' | 'move' | 'cancel';

function formatBookingSlot(slotDate: string | null, slotStartMinutes: number | null): string {
  if (!slotDate || slotStartMinutes == null) return 'No slot selected yet';
  const date = new Date(slotDate);
  const dateLabel = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const startHour = Math.floor(slotStartMinutes / 60);
  const startMinute = slotStartMinutes % 60;
  const period = startHour >= 12 ? 'PM' : 'AM';
  const displayHour = ((startHour + 11) % 12) + 1;
  const timeLabel = `${displayHour}:${String(startMinute).padStart(2, '0')} ${period}`;
  return `${dateLabel}, ${timeLabel}`;
}

function formatTimestamp(value: string | Date | undefined): string | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** D-09: the offerable clinic-hours slots a staff Move can pick from -- a
 * simple list only, never a calendar day/week view (UI-SPEC). */
function useOfferableSlots(clinicId: string | null, enabled: boolean) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: whatsappKeys.slots(clinicId ?? '', 'today'),
    queryFn: () =>
      apiClient<{ data: { slots: WaSlotOption[]; reason?: string } }>('/api/v1/whatsapp/slots', {
        token: accessToken!,
      }),
    enabled: enabled && !!accessToken && !!clinicId,
    select: (response) => response.data,
  });
}

export function BookingDetailCard({ booking, onMove, onCancel }: BookingDetailCardProps) {
  const { activeClinicId } = useAuth();
  const [sheetMode, setSheetMode] = useState<SheetMode>('none');
  const [cancelReason, setCancelReason] = useState('');

  const cancelBooking = useCancelBooking(booking.threadId);
  const moveBooking = useMoveBooking(booking.threadId);
  const slotsQuery = useOfferableSlots(activeClinicId, sheetMode === 'move');

  const closeSheet = useCallback(() => {
    setSheetMode('none');
    setCancelReason('');
  }, []);

  const handleConfirmCancel = useCallback(() => {
    if (!cancelReason.trim()) return;
    cancelBooking.mutate(
      { bookingId: booking.id, reason: cancelReason.trim() },
      {
        onSuccess: () => {
          closeSheet();
          onCancel?.();
        },
      },
    );
  }, [cancelBooking, booking.id, cancelReason, closeSheet, onCancel]);

  const handleSelectSlot = useCallback(
    (slot: WaSlotOption) => {
      moveBooking.mutate(
        {
          bookingId: booking.id,
          slotDate: slot.slotDate,
          slotStartMinutes: slot.slotStartMinutes,
          slotDurationMinutes: slot.slotDurationMinutes,
        },
        {
          onSuccess: () => {
            closeSheet();
            onMove?.();
          },
          // D-07/D-08: a 409 SLOT_TAKEN means another booking claimed the
          // slot between the staff picking it and the server committing the
          // move -- re-fetch the slot list so staff sees a fresh, accurate
          // set of options rather than a generic failure they'd have to
          // retry blindly against.
          onError: (err) => {
            if (err instanceof ApiClientError && err.status === 409 && err.code === 'SLOT_TAKEN') {
              slotsQuery.refetch();
            }
          },
        },
      );
    },
    [moveBooking, booking.id, closeSheet, onMove, slotsQuery],
  );

  const canMoveOrCancel = booking.state === 'CONFIRMED';
  const createdLabel = formatTimestamp(booking.createdAt);
  const updatedLabel = formatTimestamp(booking.updatedAt);
  const slots = slotsQuery.data?.slots ?? [];

  return (
    <View style={styles.container} testID="booking-detail-card">
      <View style={styles.row}>
        <Text variant="labelMedium" style={styles.label}>
          Reference
        </Text>
        <Text variant="titleMedium" testID="booking-detail-reference">
          {booking.reference}
        </Text>
      </View>

      <View style={styles.row}>
        <Text variant="labelMedium" style={styles.label}>
          Slot
        </Text>
        <Text variant="bodyLarge" testID="booking-detail-slot">
          {formatBookingSlot(booking.slotDate, booking.slotStartMinutes)}
        </Text>
      </View>

      <View style={styles.row}>
        <Text variant="labelMedium" style={styles.label}>
          State
        </Text>
        <Text variant="bodyLarge" testID="booking-detail-state">
          {BOOKING_STATE_LABELS[booking.state]}
        </Text>
      </View>

      {(createdLabel || updatedLabel) && (
        <View style={styles.row}>
          <Text variant="labelMedium" style={styles.label}>
            Timestamps
          </Text>
          {createdLabel && (
            <Text variant="bodySmall" style={styles.timestampText}>
              Requested {createdLabel}
            </Text>
          )}
          {updatedLabel && (
            <Text variant="bodySmall" style={styles.timestampText}>
              Updated {updatedLabel}
            </Text>
          )}
        </View>
      )}

      {/* D-08: a confirmed Phase 7 booking never auto-enters the walk-in
          queue -- this helper text always renders, in every booking state. */}
      <View style={styles.helperRow}>
        <Text variant="bodySmall" style={styles.helperText}>
          {CHECK_IN_HELPER_TEXT}
        </Text>
      </View>

      {canMoveOrCancel && (
        <View style={styles.actionsRow}>
          <Button
            mode="outlined"
            onPress={() => setSheetMode('move')}
            accessibilityRole="button"
            accessibilityLabel="Move Booking"
            contentStyle={styles.buttonContent}
            testID="booking-detail-move"
          >
            Move Booking
          </Button>
          <Button
            mode="contained"
            buttonColor={WA_COLORS.failed}
            onPress={() => setSheetMode('cancel')}
            accessibilityRole="button"
            accessibilityLabel="Cancel Booking"
            contentStyle={styles.buttonContent}
            testID="booking-detail-cancel"
          >
            Cancel Booking
          </Button>
        </View>
      )}

      {/* Cancel -- UI-SPEC's exact destructive confirmation copy (D-09). */}
      <BottomSheet visible={sheetMode === 'cancel'} onDismiss={closeSheet} title="Cancel Booking">
        <Text variant="bodyMedium" style={styles.sheetBody}>
          {CANCEL_CONFIRM_COPY}
        </Text>
        <TextInput
          label="Reason"
          value={cancelReason}
          onChangeText={setCancelReason}
          multiline
          style={styles.reasonInput}
          testID="booking-detail-cancel-reason-input"
        />
        <View style={styles.actionsRow}>
          <Button
            mode="outlined"
            onPress={closeSheet}
            accessibilityRole="button"
            accessibilityLabel="Keep Booking"
            contentStyle={styles.buttonContent}
            testID="booking-detail-keep-booking"
          >
            Keep Booking
          </Button>
          <Button
            mode="contained"
            buttonColor={WA_COLORS.failed}
            disabled={!cancelReason.trim() || cancelBooking.isPending}
            loading={cancelBooking.isPending}
            onPress={handleConfirmCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel Booking"
            accessibilityState={{ disabled: !cancelReason.trim() || cancelBooking.isPending }}
            contentStyle={styles.buttonContent}
            testID="booking-detail-confirm-cancel"
          >
            Cancel Booking
          </Button>
        </View>
      </BottomSheet>

      {/* Move -- clinic-hours slots only, never a calendar view (UI-SPEC). */}
      <BottomSheet visible={sheetMode === 'move'} onDismiss={closeSheet} title="Move Booking">
        {moveBooking.isError &&
          moveBooking.error instanceof ApiClientError &&
          moveBooking.error.status === 409 &&
          moveBooking.error.code === 'SLOT_TAKEN' && (
            <Text variant="bodySmall" style={styles.destructiveText}>
              {SLOT_TAKEN_RETRY_COPY}
            </Text>
          )}
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
              accessibilityState={{ disabled: moveBooking.isPending }}
              disabled={moveBooking.isPending}
              testID={`booking-detail-slot-${slot.slotDate}-${slot.slotStartMinutes}`}
            >
              <Text variant="bodyMedium">{slot.label}</Text>
            </Pressable>
          ))
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  row: {
    gap: 4,
  },
  label: {
    color: '#5D4037',
  },
  timestampText: {
    color: '#49454F',
  },
  helperRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F0EB',
  },
  helperText: {
    color: '#49454F',
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  buttonContent: {
    minHeight: 44,
  },
  sheetBody: {
    color: '#1C1B1F',
    marginBottom: 12,
  },
  reasonInput: {
    marginBottom: 16,
    backgroundColor: WA_COLORS.background,
  },
  destructiveText: {
    color: WA_COLORS.failed,
    marginBottom: 12,
  },
  slotRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
});
