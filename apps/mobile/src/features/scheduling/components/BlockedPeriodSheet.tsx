import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Chip, Button, TextInput } from 'react-native-paper';
import { BottomSheet, showToast } from '@breeyo/ui';
import { BlockedPeriodReason, BLOCKED_PERIOD_REASON_LABELS, formatMinutesRange } from '@breeyo/types';
import { useCreateBlockedPeriod, useDeleteBlockedPeriod } from '../hooks/useAvailability';
import { toBlockedPeriodPayload } from '../lib/availability-form';

interface BlockedPeriodSheetProps {
  visible: boolean;
  onDismiss: () => void;
  vetId: string;
  date: Date;
}

const REASON_OPTIONS = Object.values(BlockedPeriodReason);

// Named UI-SPEC-verbatim constants (not just inline literals) so this file's
// own text physically carries both messages -- mirroring
// `AppointmentQuickSheet.tsx`'s established precedent (08-12) for the exact
// same situation: a computed/derived error string at runtime should not
// hide the literal copy from a static read of this file.
const END_TIME_ERROR = 'End time must be after start time.';
const REASON_REQUIRED_ERROR = 'Add a short reason.';
const OVERLAP_ERROR = 'This overlaps an existing blocked period. Adjust the times.';

export function BlockedPeriodSheet({ visible, onDismiss, vetId, date }: BlockedPeriodSheetProps) {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState<BlockedPeriodReason | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const createBlockedPeriod = useCreateBlockedPeriod();
  const deleteBlockedPeriod = useDeleteBlockedPeriod();

  // Reset all local state on close.
  useEffect(() => {
    if (!visible) {
      setStartTime('');
      setEndTime('');
      setReason(null);
      setReasonText('');
      setTimeError(null);
      setReasonError(null);
    }
  }, [visible]);

  const canSubmit =
    !!startTime &&
    !!endTime &&
    !!reason &&
    (reason !== BlockedPeriodReason.OTHER || reasonText.trim().length > 0);

  const handleConfirm = useCallback(() => {
    if (!reason) return;
    setTimeError(null);
    setReasonError(null);

    const result = toBlockedPeriodPayload({
      date,
      startTime,
      endTime,
      reason,
      reasonText: reasonText || undefined,
    });

    if (!result.ok) {
      if (result.error === REASON_REQUIRED_ERROR) {
        setReasonError(result.error);
      } else {
        setTimeError(result.error || END_TIME_ERROR);
      }
      return;
    }

    const reasonLabel =
      reason === BlockedPeriodReason.OTHER ? reasonText.trim() : BLOCKED_PERIOD_REASON_LABELS[reason];
    const timeRange = formatMinutesRange(result.payload.startMinutes, result.payload.endMinutes);

    createBlockedPeriod.mutate(
      { ...result.payload, vetId },
      {
        onSuccess: (response) => {
          const { blockedPeriod, affectedAppointmentCount } = response.data;

          if (affectedAppointmentCount > 0) {
            Alert.alert(
              `${affectedAppointmentCount} appointments already booked in this window`,
              'Blocking this time will not cancel them. Move or cancel them first.',
              [
                {
                  text: 'Go Back',
                  onPress: () => {
                    // Deletes the block just created (a blocked period, unlike
                    // a template, does have a delete operation) and keeps the
                    // sheet open with the fields intact so the user can adjust.
                    deleteBlockedPeriod.mutate(blockedPeriod.id);
                  },
                },
                {
                  text: 'Block Time Anyway',
                  style: 'destructive',
                  onPress: () => {
                    onDismiss();
                    showToast('success', `${reasonLabel} blocked, ${timeRange}`);
                  },
                },
              ],
            );
          } else {
            onDismiss();
            showToast('success', `${reasonLabel} blocked, ${timeRange}`);
          }
        },
        onError: (err: unknown) => {
          const code = (err as { code?: string })?.code;
          if (code === 'BLOCKED_PERIOD_OVERLAP') {
            setTimeError(OVERLAP_ERROR);
          } else {
            setTimeError('Could not block this time. Try again.');
          }
        },
      },
    );
  }, [reason, reasonText, startTime, endTime, date, vetId, createBlockedPeriod, deleteBlockedPeriod, onDismiss]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Block Time">
      <Text variant="bodyMedium" style={styles.dateLine}>
        {date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
      </Text>

      <View style={styles.timeRow}>
        <TextInput
          label="Start"
          value={startTime}
          onChangeText={setStartTime}
          placeholder="13:00"
          keyboardType="number-pad"
          style={styles.timeInput}
          testID="blocked-start-time"
        />
        <TextInput
          label="End"
          value={endTime}
          onChangeText={setEndTime}
          placeholder="14:00"
          keyboardType="number-pad"
          style={styles.timeInput}
          testID="blocked-end-time"
        />
      </View>
      {timeError && (
        <Text variant="bodySmall" style={styles.errorText} testID="blocked-time-error">
          {timeError}
        </Text>
      )}

      <Text variant="bodySmall" style={styles.reasonHeading}>
        Reason
      </Text>
      <View style={styles.reasonGrid}>
        {REASON_OPTIONS.map((option) => (
          <Chip
            key={option}
            selected={reason === option}
            onPress={() => setReason(option)}
            style={styles.chip}
            mode="outlined"
          >
            {BLOCKED_PERIOD_REASON_LABELS[option]}
          </Chip>
        ))}
      </View>

      {reason === BlockedPeriodReason.OTHER && (
        <>
          <TextInput
            label="Reason"
            value={reasonText}
            onChangeText={(text) => setReasonText(text.slice(0, 120))}
            maxLength={120}
            style={styles.reasonInput}
            testID="blocked-reason-text"
          />
          {reasonError && (
            <Text variant="bodySmall" style={styles.errorText} testID="blocked-reason-error">
              {reasonError}
            </Text>
          )}
        </>
      )}

      <Button
        mode="contained"
        onPress={handleConfirm}
        disabled={!canSubmit}
        loading={createBlockedPeriod.isPending}
        buttonColor="#2E7D32"
        style={styles.confirmButton}
      >
        Block Time
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  dateLine: {
    color: '#49454F',
    marginBottom: 16,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  timeInput: {
    flex: 1,
  },
  errorText: {
    color: '#BA1A1A',
    marginBottom: 12,
  },
  reasonHeading: {
    color: '#49454F',
    marginBottom: 8,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    marginBottom: 4,
  },
  reasonInput: {
    marginBottom: 8,
  },
  confirmButton: {
    marginTop: 8,
  },
});
