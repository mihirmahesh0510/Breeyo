import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Alert, Pressable, ScrollView } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet, Button, showToast } from '@breeyo/ui';
import { AppointmentStatus, minutesToHHMM } from '@breeyo/types';
import type { AppointmentWithDetails, SlotOption } from '@breeyo/types';
import { useOfferableSlots } from '../hooks/useSchedule';
import { useUpdateAppointmentStatus, useCancelAppointment, useRescheduleAppointment } from '../hooks/useAppointmentActions';
import { formatSlotRange } from '../lib/agenda-utils';

const IST_TIME_ZONE = 'Asia/Kolkata';

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: IST_TIME_ZONE,
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: IST_TIME_ZONE,
  });
}

function formatSlotTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const anchor = new Date(Date.UTC(2000, 0, 1, hours, mins));
  return anchor
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    .toUpperCase();
}

// Named as constants (rather than inline string literals in the
// `Alert.alert` button arrays below) so every destructive option's label
// reads as a verb applied to a named object, never a bare "Cancel" --
// UI-SPEC's copywriting contract.
const LABEL_CANCEL_THIS_ONE = 'Cancel This One';
const LABEL_CANCEL_ALL = 'Cancel All';
const LABEL_CANCEL_APPOINTMENT = 'Cancel Appointment';

export interface AppointmentQuickSheetProps {
  visible: boolean;
  appointment: AppointmentWithDetails | null;
  onDismiss: () => void;
}

/**
 * Opened by tapping an agenda row. Shows the full appointment detail (every
 * pet, D-21) and the three quick actions: Check In Now, Move Appointment
 * (an inline date-and-slot re-pick, the same pattern `BookAppointmentSheet`
 * uses for its own date/slot steps) and Cancel Appointment, with the D-22
 * three-way series dialog and the D-31 detach notice.
 */
export function AppointmentQuickSheet({ visible, appointment, onDismiss }: AppointmentQuickSheetProps) {
  const [moveMode, setMoveMode] = useState(false);
  const [moveDate, setMoveDate] = useState<Date>(new Date());
  const [moveSlot, setMoveSlot] = useState<SlotOption | null>(null);

  const updateStatus = useUpdateAppointmentStatus();
  const cancelAppointment = useCancelAppointment();
  const rescheduleAppointment = useRescheduleAppointment();

  const { data: moveSlots, isFetching: isMoveSlotsLoading } = useOfferableSlots(
    appointment?.vetId,
    moveMode ? moveDate : undefined,
    appointment?.serviceCatalogId ?? undefined,
  );

  useEffect(() => {
    if (!visible) {
      setMoveMode(false);
      setMoveSlot(null);
    } else if (appointment) {
      setMoveDate(new Date(appointment.scheduledFor));
    }
  }, [visible, appointment]);

  const handleCheckIn = useCallback(() => {
    if (!appointment) return;
    const petName = appointment.pets[0]?.pet.name ?? 'Patient';
    updateStatus.mutate(
      { appointmentId: appointment.id, status: AppointmentStatus.CHECKED_IN },
      {
        onSuccess: () => {
          showToast('success', `${petName} checked in`);
          onDismiss();
        },
        onError: () => {
          showToast('error', 'Could not check in. Try again.');
        },
      },
    );
  }, [appointment, updateStatus, onDismiss]);

  const handleCancelOne = useCallback(() => {
    if (!appointment) return;
    cancelAppointment.mutate(
      { appointmentId: appointment.id, scope: 'ONE' },
      {
        onSuccess: () => {
          showToast('success', 'Appointment cancelled');
          onDismiss();
        },
        onError: () => {
          showToast('error', 'Could not cancel this appointment. Try again.');
        },
      },
    );
  }, [appointment, cancelAppointment, onDismiss]);

  const handleCancelAllSeries = useCallback(() => {
    if (!appointment) return;
    cancelAppointment.mutate(
      { appointmentId: appointment.id, scope: 'SERIES' },
      {
        onSuccess: () => {
          showToast('success', 'Appointment cancelled');
          onDismiss();
        },
        onError: () => {
          showToast('error', 'Could not cancel these appointments. Try again.');
        },
      },
    );
  }, [appointment, cancelAppointment, onDismiss]);

  const handleCancelPress = useCallback(() => {
    if (!appointment) return;
    const petName = appointment.pets[0]?.pet.name ?? 'This appointment';
    const isRecurring = appointment.recurringSeriesId != null;

    if (isRecurring) {
      // D-22: three-way dialog. "Cancel All" only removes remaining future
      // SCHEDULED occurrences server-side (D-31) -- already-CHECKED_IN or
      // COMPLETED occurrences are left untouched.
      Alert.alert(
        'Cancel repeat appointments?',
        `This is 1 of a repeating series for ${petName}.`,
        [
          { text: 'Keep All', style: 'cancel' },
          { text: LABEL_CANCEL_THIS_ONE, onPress: handleCancelOne },
          { text: LABEL_CANCEL_ALL, style: 'destructive', onPress: handleCancelAllSeries },
        ],
      );
      return;
    }

    const time = formatSlotRange(new Date(appointment.scheduledFor), appointment.durationMinutes);
    const date = formatLongDate(new Date(appointment.scheduledFor));
    Alert.alert(
      'Cancel this appointment?',
      `${petName} at ${time} on ${date} will be cancelled. ${appointment.owner.name} gets a WhatsApp update.`,
      [
        { text: 'Keep Appointment', style: 'cancel' },
        { text: LABEL_CANCEL_APPOINTMENT, style: 'destructive', onPress: handleCancelOne },
      ],
    );
  }, [appointment, handleCancelOne, handleCancelAllSeries]);

  const handleStartMove = useCallback(() => {
    setMoveMode(true);
  }, []);

  const handleDiscardMove = useCallback(() => {
    setMoveMode(false);
    setMoveSlot(null);
  }, []);

  const handleConfirmMove = useCallback(() => {
    if (!appointment || !moveSlot) return;
    const isoDate = istDateKey(moveDate);
    const hhmm = minutesToHHMM(moveSlot.startMinutes);
    const scheduledFor = `${isoDate}T${hhmm}:00+05:30`;
    // D-31: capture this BEFORE the mutation resolves -- the server response
    // doesn't echo back whether it detached a series, only the plain
    // appointment.
    const wasRecurring = appointment.recurringSeriesId != null;

    rescheduleAppointment.mutate(
      { appointmentId: appointment.id, scheduledFor },
      {
        onSuccess: () => {
          showToast('success', `Moved to ${formatSlotTime(moveSlot.startMinutes)}, ${formatLongDate(moveDate)}`);
          // D-31: a single-occurrence reschedule detaches a series member
          // from its series automatically, server-side -- surface that
          // consequence rather than leaving it silent.
          if (wasRecurring) {
            showToast('info', 'This visit is now separate from its repeating series.');
          }
          setMoveMode(false);
          onDismiss();
        },
        onError: () => {
          showToast('error', 'Could not move this appointment. Try again.');
        },
      },
    );
  }, [appointment, moveSlot, moveDate, rescheduleAppointment, onDismiss]);

  if (!appointment) {
    return <BottomSheet visible={false} onDismiss={onDismiss}><View /></BottomSheet>;
  }

  const primaryPet = appointment.pets[0]?.pet;
  const extraPets = appointment.pets.slice(1);
  const isRecurring = appointment.recurringSeriesId != null;
  const isScheduled = appointment.status === AppointmentStatus.SCHEDULED;
  const timeLabel = formatSlotRange(new Date(appointment.scheduledFor), appointment.durationMinutes);
  const dateLabel = formatLongDate(new Date(appointment.scheduledFor));
  const moveDateOptions = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={primaryPet?.name ?? 'Appointment'}>
      <ScrollView>
        {!moveMode ? (
          <>
            <Text variant="bodyLarge" style={styles.detailLine}>
              {timeLabel}, {dateLabel}
            </Text>
            <Text variant="bodyMedium" style={styles.detailLine}>
              {appointment.owner.name}
            </Text>
            <Text variant="bodySmall" style={styles.detailLine}>
              {appointment.service?.name ?? 'Visit'} · {appointment.durationMinutes} min
            </Text>
            <Text variant="bodySmall" style={styles.detailLine}>
              with Dr. {appointment.vet.name}
            </Text>

            {extraPets.length > 0 ? (
              <View style={styles.petsSection}>
                <Text variant="bodySmall" style={styles.petsSectionTitle}>
                  Pets on this visit
                </Text>
                {appointment.pets.map((petRef) => (
                  <Text key={petRef.id} variant="bodyMedium" style={styles.petLine}>
                    {petRef.pet.name}
                  </Text>
                ))}
              </View>
            ) : null}

            {isRecurring ? (
              <View style={styles.recurrenceRow}>
                <MaterialCommunityIcons name="repeat" size={14} color="#79747E" />
                <Text variant="bodySmall" style={styles.recurrenceText}>
                  Part of a repeating series
                </Text>
              </View>
            ) : null}

            {isScheduled ? (
              <View style={styles.actions}>
                <Button
                  variant="filled"
                  label="Check In Now"
                  onPress={handleCheckIn}
                  loading={updateStatus.isPending}
                />
                <Button variant="outlined" label="Move Appointment" onPress={handleStartMove} />
                <Button variant="text" label="Cancel Appointment" onPress={handleCancelPress} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text variant="titleMedium" style={styles.moveTitle}>
              Move Appointment
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}>
              {moveDateOptions.map((date) => {
                const selected = istDateKey(date) === istDateKey(moveDate);
                return (
                  <Pressable
                    key={istDateKey(date)}
                    onPress={() => {
                      setMoveDate(date);
                      setMoveSlot(null);
                    }}
                    style={[styles.dateChip, selected && styles.dateChipSelected]}
                    accessibilityRole="button"
                    accessibilityLabel={formatShortDate(date)}
                  >
                    <Text variant="bodySmall" style={selected ? styles.dateChipTextSelected : styles.dateChipText}>
                      {formatShortDate(date)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {isMoveSlotsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" />
                <Text variant="bodySmall" style={styles.loadingText}>
                  Finding open slots…
                </Text>
              </View>
            ) : (
              <View style={styles.slotGrid}>
                {(moveSlots ?? []).map((slot) => {
                  const label = formatSlotTime(slot.startMinutes);
                  const selected = moveSlot?.startMinutes === slot.startMinutes;
                  return (
                    <Pressable
                      key={slot.startMinutes}
                      onPress={() => setMoveSlot(slot)}
                      style={[
                        styles.slotChip,
                        slot.isDoubleBooked && styles.slotChipTaken,
                        selected && styles.slotChipSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={slot.isDoubleBooked ? `${label}, already booked` : label}
                    >
                      {slot.isDoubleBooked ? (
                        <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#E65100" />
                      ) : null}
                      <Text variant="bodySmall" style={slot.isDoubleBooked ? styles.slotChipTakenText : styles.slotChipText}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.actions}>
              <Button variant="text" label="Discard Booking" onPress={handleDiscardMove} />
              <Button
                variant="filled"
                label="Confirm Booking"
                onPress={handleConfirmMove}
                disabled={!moveSlot}
                loading={rescheduleAppointment.isPending}
              />
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  detailLine: {
    marginBottom: 4,
    color: '#1C1B1F',
  },
  petsSection: {
    marginTop: 12,
  },
  petsSectionTitle: {
    color: '#49454F',
    marginBottom: 4,
  },
  petLine: {
    color: '#1C1B1F',
  },
  recurrenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  recurrenceText: {
    color: '#79747E',
  },
  actions: {
    marginTop: 24,
    gap: 8,
  },
  moveTitle: {
    marginBottom: 12,
  },
  dateRow: {
    marginBottom: 12,
  },
  dateChip: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipSelected: {
    backgroundColor: '#C8E6C9',
    borderColor: '#2E7D32',
  },
  dateChipText: {
    color: '#1C1B1F',
  },
  dateChipTextSelected: {
    color: '#1B5E20',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#49454F',
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    backgroundColor: '#FFFBF5',
  },
  slotChipSelected: {
    borderColor: '#2E7D32',
    borderWidth: 2,
  },
  slotChipTaken: {
    backgroundColor: '#F5F0EB',
  },
  slotChipText: {
    color: '#1C1B1F',
  },
  slotChipTakenText: {
    color: '#49454F',
  },
});
