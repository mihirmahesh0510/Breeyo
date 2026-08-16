import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { WaDeliveryMode } from '@breeyo/types';

/**
 * WHA-05 / D-14, D-16, D-20: the deterministic delivery-mode segmented
 * control, shaped like `VisitReasonPicker.tsx`'s chip grid. Exactly four
 * variants exist -- normal, delayed, simulated failure, invalid number --
 * and there is deliberately no fifth non-deterministic/unpredictable option
 * anywhere in this file (UI-SPEC's failure-mode control list is exhaustive
 * and closed). The setting is a clinic-wide control affecting the next
 * send(s), never a per-owner/thread override (D-16) -- there is no
 * `ownerId`/`threadId` prop on this component, matching
 * `clinic-config.service.ts`'s own guarantee.
 */
export interface SimulatorControlCardProps {
  value: WaDeliveryMode;
  disabled?: boolean;
  onChange: (mode: WaDeliveryMode) => void;
}

interface DeliveryModeOption {
  mode: WaDeliveryMode;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  description: string;
}

/**
 * Never color alone (UI-SPEC Accessibility Contract): every option pairs an
 * icon with a plain-word label and a one-line description, so a status is
 * always readable without relying on the selected-state tint.
 */
const DELIVERY_MODE_OPTIONS: readonly DeliveryModeOption[] = [
  {
    mode: 'NORMAL',
    label: 'Normal delivery',
    icon: 'check-circle-outline',
    description: 'Messages send and progress through the status ladder as expected.',
  },
  {
    mode: 'DELAYED',
    label: 'Delayed delivery',
    icon: 'clock-outline',
    description: 'Messages take longer to reach Delivered, to demo the in-flight state.',
  },
  {
    mode: 'FAIL',
    label: 'Simulated failure',
    icon: 'alert-circle-outline',
    description: 'The next sends fail deterministically, to demo Retry / Call Owner.',
  },
  {
    mode: 'INVALID_NUMBER',
    label: 'Invalid number',
    icon: 'phone-remove-outline',
    description: 'The next sends fail as if the owner’s number is not on WhatsApp.',
  },
] as const;

export function SimulatorControlCard({ value, disabled, onChange }: SimulatorControlCardProps) {
  return (
    <View style={styles.container} testID="simulator-control-card">
      <Text variant="bodySmall" style={styles.helper}>
        This is a clinic-wide setting that affects the next send(s) -- not a per-owner or
        per-thread override.
      </Text>
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Delivery mode">
        {DELIVERY_MODE_OPTIONS.map((option) => {
          const selected = value === option.mode;
          return (
            <Pressable
              key={option.mode}
              onPress={() => onChange(option.mode)}
              disabled={disabled}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !!disabled }}
              accessibilityLabel={option.label}
              testID={`simulator-mode-${option.mode}`}
            >
              <MaterialCommunityIcons
                name={option.icon}
                size={22}
                color={selected ? '#2E7D32' : '#79747E'}
              />
              <Text
                variant="labelMedium"
                style={[styles.optionLabel, selected ? styles.optionLabelSelected : undefined]}
              >
                {option.label}
              </Text>
              <Text variant="bodySmall" style={styles.optionDescription}>
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  helper: {
    color: '#5D4037',
  },
  grid: {
    gap: 8,
  },
  option: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7CCC8',
    backgroundColor: '#FFFBF5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  optionSelected: {
    borderColor: '#2E7D32',
    backgroundColor: '#C8E6C9',
  },
  optionLabel: {
    color: '#1C1B1F',
  },
  optionLabelSelected: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  optionDescription: {
    color: '#49454F',
  },
});
