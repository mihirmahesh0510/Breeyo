import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { WA_CAPABILITY_LIMITS } from '@breeyo/types';

/**
 * WHA-05 / D-15: a single generic chip expresses all seven UI-SPEC variants
 * (book, keep, cancel, move, confirm, pay, stop) through `label`/`payload`
 * rather than seven separate components.
 */
interface QuickReplyChipProps {
  label: string;
  payload: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: (payload: string) => void;
}

/**
 * Meta caps quick-reply button titles at `WA_CAPABILITY_LIMITS.maxButtonTitleChars`
 * (20 chars) -- a chip that visually renders longer text than the provider
 * can send would be misleading, so the displayed label is truncated to match.
 */
function truncateChipLabel(label: string): string {
  const max = WA_CAPABILITY_LIMITS.maxButtonTitleChars;
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function QuickReplyChip({ label, payload, disabled, loading, onPress }: QuickReplyChipProps) {
  const isDisabled = !!disabled || !!loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : () => onPress(payload)}
      disabled={isDisabled}
      style={[styles.chip, isDisabled && styles.chipDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isDisabled ? '#D7CCC8' : '#2E7D32'} />
      ) : (
        <Text style={styles.label} numberOfLines={1}>
          {truncateChipLabel(label)}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2E7D32',
    backgroundColor: '#FFFBF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDisabled: {
    opacity: 0.5,
    borderColor: '#D7CCC8',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E7D32',
  },
});
