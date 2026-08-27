import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { BottomSheet, colors } from '@breeyo/ui';
import type { QueueEntryWithPet } from '@breeyo/types';

interface ExpectedActionSheetProps {
  visible: boolean;
  entry: QueueEntryWithPet | null;
  onDismiss: () => void;
  onCheckIn: (entryId: string) => void;
  onNoShow: (entryId: string) => void;
  onViewAppointment: (appointmentId: string | null) => void;
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Quick-action sheet for an EXPECTED queue row (D-13). Tapping an expected
 * row opens this instead of navigating to patient detail, because an
 * expected patient isn't in line yet -- the front desk needs to check them
 * in, mark a no-show, or jump to the appointment, not view a chart.
 */
export function ExpectedActionSheet({
  visible,
  entry,
  onDismiss,
  onCheckIn,
  onNoShow,
  onViewAppointment,
}: ExpectedActionSheetProps) {
  if (!entry) {
    return null;
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={entry.pet.name}>
      <View style={styles.caption}>
        <Text variant="bodyMedium" style={styles.expectedTime}>
          Expected {formatTime(entry.queuePriorityAt)}
        </Text>
        <Text variant="bodySmall" style={styles.ownerName}>
          {entry.pet.owner.name}
        </Text>
      </View>

      <Button
        mode="contained"
        onPress={() => onCheckIn(entry.id)}
        style={styles.button}
        testID="expected-check-in-now"
      >
        Check In Now
      </Button>

      <Button
        mode="outlined"
        onPress={() => onNoShow(entry.id)}
        textColor="#BA1A1A"
        style={styles.button}
        testID="expected-mark-no-show"
      >
        Mark No-show
      </Button>

      <Button
        mode="text"
        onPress={() => onViewAppointment(entry.appointmentId)}
        disabled={!entry.appointmentId}
        style={styles.button}
        testID="expected-view-appointment"
      >
        View Appointment
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  caption: {
    marginBottom: 16,
  },
  expectedTime: {
    color: colors.secondary,
    fontWeight: '500',
  },
  ownerName: {
    color: '#49454F',
    marginTop: 2,
  },
  button: {
    marginTop: 8,
  },
});
