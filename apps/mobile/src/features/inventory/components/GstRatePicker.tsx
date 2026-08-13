import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { GST_RATE_SLABS } from '@breeyo/types';

export interface GstRatePickerProps {
  value: number | null;
  onChange: (rate: number | null) => void;
  label?: string;
  testID?: string;
}

const COLORS = {
  primaryContainer: '#C8E6C9',
  surfaceVariant: '#F5F0EB',
  onPrimaryContainer: '#1B5E20',
  onSurfaceVariant: '#49454F',
  labelColor: '#1C1B1F',
} as const;

interface RateOption {
  value: number | null;
  label: string;
}

// "None" (no explicit rate -- Phase 6 falls back to the clinic default) plus the
// current Indian GST slabs (INV-09, D-62: fully optional, no enforcement). The
// chips are derived from GST_RATE_SLABS, so a Council notification that changes
// the slabs updates this picker without touching this file.
const RATE_OPTIONS: RateOption[] = [
  { value: null, label: 'None' },
  ...GST_RATE_SLABS.map((rate) => ({ value: rate, label: `${rate}%` })),
];

/**
 * GST rate slab picker (INV-09). A row of selectable chips for "None" plus each
 * current GST slab. Used on the item create/edit form; selection can also
 * be driven programmatically when the user taps an HSN autocomplete suggestion
 * (its defaultGstRate auto-selects the matching chip here).
 */
export function GstRatePicker({ value, onChange, label = 'GST Rate', testID }: GstRatePickerProps) {
  return (
    <View testID={testID}>
      <Text variant="bodySmall" style={styles.label}>
        {label}
      </Text>
      <View style={styles.row}>
        {RATE_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange(option.value)}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`GST rate ${option.label}`}
              testID={`gst-rate-chip-${option.value ?? 'none'}`}
            >
              <Text
                variant="labelLarge"
                style={selected ? styles.chipTextSelected : styles.chipTextUnselected}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="bodySmall" style={styles.helperText}>
        Select the applicable GST slab for this item
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: COLORS.onSurfaceVariant,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  chipSelected: {
    backgroundColor: COLORS.primaryContainer,
  },
  chipUnselected: {
    backgroundColor: COLORS.surfaceVariant,
  },
  chipTextSelected: {
    color: COLORS.onPrimaryContainer,
    fontWeight: '600',
  },
  chipTextUnselected: {
    color: COLORS.labelColor,
  },
  helperText: {
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
});
