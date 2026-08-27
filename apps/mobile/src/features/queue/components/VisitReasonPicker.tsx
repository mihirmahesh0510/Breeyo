import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Chip, Switch, Button } from 'react-native-paper';
import { VISIT_REASONS } from '@breeyo/types';
import { BottomSheet } from '@breeyo/ui';

interface VisitReasonPickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (params: { visitReason?: string; isEmergency: boolean }) => void;
}

export function VisitReasonPicker({
  visible,
  onDismiss,
  onSelect,
}: VisitReasonPickerProps) {
  const [selectedReason, setSelectedReason] = useState<string | undefined>();
  const [isEmergency, setIsEmergency] = useState(false);

  const handleConfirm = () => {
    onSelect({ visitReason: selectedReason, isEmergency });
    setSelectedReason(undefined);
    setIsEmergency(false);
  };

  const handleSkip = () => {
    onSelect({ visitReason: undefined, isEmergency });
    setSelectedReason(undefined);
    setIsEmergency(false);
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Visit Reason (optional)"
    >
      <View style={styles.chipGrid}>
        {VISIT_REASONS.map((reason) => (
          <Chip
            key={reason.value}
            selected={selectedReason === reason.value}
            onPress={() =>
              setSelectedReason(
                selectedReason === reason.value ? undefined : reason.value,
              )
            }
            style={styles.chip}
            mode="outlined"
          >
            {reason.label}
          </Chip>
        ))}
      </View>

      <View style={styles.emergencyRow}>
        <View style={styles.emergencyLabel}>
          <Text variant="bodyLarge">Emergency</Text>
          <Text variant="bodySmall" style={styles.helperText}>
            Patient will be prioritized in queue
          </Text>
        </View>
        <Switch
          value={isEmergency}
          onValueChange={setIsEmergency}
          color="#BA1A1A"
        />
      </View>

      <View style={styles.actions}>
        {selectedReason && (
          <Button mode="contained" onPress={handleConfirm} buttonColor="#2E7D32">
            Continue
          </Button>
        )}
        <Button mode="text" onPress={handleSkip}>
          Skip
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    marginBottom: 4,
  },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#CAC4D0',
    marginBottom: 16,
  },
  emergencyLabel: {
    flex: 1,
  },
  helperText: {
    color: '#49454F',
  },
  actions: {
    gap: 8,
  },
});
