import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { StatusBadge, vetColorForId } from '@breeyo/ui';
import type { StatusVariant } from '@breeyo/ui';
import { AppointmentStatus } from '@breeyo/types';
import type { AppointmentWithDetails } from '@breeyo/types';
import { formatSlotRange } from '../lib/agenda-utils';

const STATUS_TO_VARIANT: Partial<Record<AppointmentStatus, StatusVariant>> = {
  [AppointmentStatus.CHECKED_IN]: 'checkedIn',
  [AppointmentStatus.COMPLETED]: 'completed',
  [AppointmentStatus.CANCELLED]: 'cancelled',
  [AppointmentStatus.NO_SHOW]: 'noShow',
};

function vetInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export interface AppointmentRowProps {
  appointment: AppointmentWithDetails;
  sortedVetIds: readonly string[];
  isPast?: boolean;
  onPress?: () => void;
  onSwipeCheckIn?: () => void;
  onSwipeCancel?: () => void;
}

/**
 * The D-24 agenda row: the fixed nine-element anatomy from UI-SPEC §
 * Appointment card/block anatomy, in order -- vet rail, time, pet name,
 * owner name, service line, multi-pet caption (D-21), vet-initials chip,
 * status badge (omitted for `SCHEDULED`), recurrence marker (D-22/D-31).
 */
export function AppointmentRow({
  appointment,
  sortedVetIds,
  isPast,
  onPress,
  onSwipeCheckIn,
  onSwipeCancel,
}: AppointmentRowProps) {
  const vetColor = vetColorForId(appointment.vetId, sortedVetIds);
  const variant = STATUS_TO_VARIANT[appointment.status];
  const primaryPet = appointment.pets[0]?.pet;
  const extraPetCount = appointment.pets.length - 1;
  const isCancelled = appointment.status === AppointmentStatus.CANCELLED;
  const isRecurring = appointment.recurringSeriesId != null;
  const canSwipe = appointment.status === AppointmentStatus.SCHEDULED;

  const timeLabel = formatSlotRange(new Date(appointment.scheduledFor), appointment.durationMinutes);
  const serviceLabel = appointment.service
    ? `${appointment.service.name} · ${appointment.durationMinutes} min`
    : `Visit · ${appointment.durationMinutes} min`;

  const accessibilityLabel = useMemo(
    () =>
      `${timeLabel}, ${primaryPet?.name ?? 'Unknown pet'}, ${appointment.owner.name}, ${serviceLabel}, with Dr. ${appointment.vet.name}, ${appointment.status}`,
    [timeLabel, primaryPet?.name, appointment.owner.name, serviceLabel, appointment.vet.name, appointment.status],
  );

  const content = (
    <Pressable
      onPress={onPress}
      style={[styles.container, isPast && styles.pastRow, isCancelled && styles.cancelledRow]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={`appointment-row-${appointment.id}`}
    >
      {vetColor ? <View style={[styles.vetRail, { backgroundColor: vetColor }]} /> : null}

      <View style={styles.info}>
        <View style={styles.timeRow}>
          <Text variant="bodySmall" style={styles.time}>
            {timeLabel}
          </Text>
          {isRecurring ? (
            <MaterialCommunityIcons name="repeat" size={12} color="#79747E" style={styles.recurrenceIcon} />
          ) : null}
        </View>

        <Text
          variant="titleMedium"
          numberOfLines={1}
          style={[styles.petName, isCancelled && styles.strikethrough]}
        >
          {primaryPet?.name ?? 'Unknown pet'}
        </Text>

        <Text variant="bodyLarge" numberOfLines={1} style={styles.ownerName}>
          {appointment.owner.name}
        </Text>

        <Text variant="bodySmall" style={styles.service}>
          {serviceLabel}
        </Text>

        {extraPetCount > 0 ? (
          <View style={styles.extraPetsRow}>
            <MaterialCommunityIcons name="paw" size={12} color="#49454F" />
            <Text variant="bodySmall" style={styles.extraPetsText}>
              +{extraPetCount} more pets
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.trailing}>
        {vetColor ? (
          <View style={[styles.initialsChip, { borderColor: vetColor }]}>
            <Text variant="bodySmall" style={styles.initialsText}>
              {vetInitials(appointment.vet.name)}
            </Text>
          </View>
        ) : null}

        {variant ? (
          <StatusBadge
            // UI-SPEC noise-reduction rule: never rendered for
            // AppointmentStatus.SCHEDULED -- `variant` is undefined for
            // SCHEDULED (it has no entry in STATUS_TO_VARIANT), so this
            // branch never fires for it.
            status={variant}
          />
        ) : null}
      </View>
    </Pressable>
  );

  if (!canSwipe || (!onSwipeCheckIn && !onSwipeCancel)) {
    return content;
  }

  return (
    <Swipeable
      renderLeftActions={
        onSwipeCheckIn
          ? () => (
              <Pressable
                onPress={onSwipeCheckIn}
                style={styles.swipeCheckIn}
                accessibilityRole="button"
                accessibilityLabel="Check In"
              >
                <MaterialCommunityIcons name="check-circle-outline" size={20} color="#FFFFFF" />
                <Text variant="labelSmall" style={styles.swipeActionText}>
                  Check In
                </Text>
              </Pressable>
            )
          : undefined
      }
      renderRightActions={
        onSwipeCancel
          ? () => (
              <Pressable
                onPress={onSwipeCancel}
                style={styles.swipeCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel Appointment"
              >
                <MaterialCommunityIcons name="close-circle-outline" size={20} color="#FFFFFF" />
                <Text variant="labelSmall" style={styles.swipeActionText}>
                  Cancel Appointment
                </Text>
              </Pressable>
            )
          : undefined
      }
    >
      {content}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 80,
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    gap: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    overflow: 'hidden',
  },
  vetRail: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  pastRow: {
    opacity: 0.6,
  },
  cancelledRow: {
    opacity: 0.5,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
    color: '#49454F',
  },
  recurrenceIcon: {
    marginLeft: 4,
  },
  petName: {
    fontWeight: '500',
    color: '#1C1B1F',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  ownerName: {
    color: '#5D4037',
  },
  service: {
    color: '#49454F',
  },
  extraPetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  extraPetsText: {
    color: '#49454F',
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 4,
  },
  initialsChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#F5F0EB',
  },
  initialsText: {
    color: '#49454F',
  },
  swipeCheckIn: {
    width: 96,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    marginLeft: 16,
    borderRadius: 12,
    gap: 2,
  },
  swipeCancel: {
    width: 96,
    backgroundColor: '#BA1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    marginRight: 16,
    borderRadius: 12,
    gap: 2,
  },
  swipeActionText: {
    color: '#FFFFFF',
  },
});
