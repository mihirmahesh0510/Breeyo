import React from 'react';
import { ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { WA_INBOX_FILTERS } from '@breeyo/types';
import type { WaInboxFilter } from '@breeyo/types';
import { inboxFilterLabel, WA_COLORS } from '../utils/whatsapp-format';

/**
 * WHA-05 / UI-SPEC Interaction Contract: "Failed and Needs action filters
 * must be visually discoverable without requiring a separate task screen."
 * Renders exactly the six `WA_INBOX_FILTERS` chips derived from the shared
 * constant so the mobile UI and any future surface cannot drift.
 */
interface FailureFilterBarProps {
  active: WaInboxFilter;
  onChange: (filter: WaInboxFilter) => void;
}

export function FailureFilterBar({ active, onChange }: FailureFilterBarProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {WA_INBOX_FILTERS.map((filter) => {
        const isActive = filter === active;
        return (
          <Pressable
            key={filter}
            onPress={() => onChange(filter)}
            style={[styles.chip, isActive && styles.chipActive]}
            accessibilityRole="button"
            accessibilityLabel={inboxFilterLabel(filter)}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{inboxFilterLabel(filter)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D7CCC8',
    backgroundColor: WA_COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: WA_COLORS.delivered,
    borderColor: WA_COLORS.delivered,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#49454F',
  },
  labelActive: {
    color: '#FFFFFF',
  },
});
