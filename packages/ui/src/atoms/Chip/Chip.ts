import React from 'react';
import { Chip as PaperChip } from 'react-native-paper';

// --- Component ---

export interface BreeyoChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  mode?: 'flat' | 'outlined';
  disabled?: boolean;
  testID?: string;
}

export function BreeyoChip({
  label,
  selected = false,
  onPress,
  icon,
  mode = 'flat',
  disabled = false,
  testID,
}: BreeyoChipProps) {
  return React.createElement(PaperChip, {
    selected,
    onPress,
    icon,
    mode,
    disabled,
    testID,
    accessibilityLabel: label,
    accessibilityState: { selected },
    children: label,
  });
}
