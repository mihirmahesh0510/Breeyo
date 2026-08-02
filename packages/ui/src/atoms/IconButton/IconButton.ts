import React from 'react';
import { IconButton as PaperIconButton } from 'react-native-paper';

// --- Testable exports ---

export type IconButtonMode = 'filled' | 'outlined' | 'standard';

export const MODE_MAP: Record<
  IconButtonMode,
  'contained' | 'outlined' | 'default'
> = {
  filled: 'contained',
  outlined: 'outlined',
  standard: 'default',
};

/** Minimum touch target per WCAG 2.5.5 */
export const MIN_TOUCH_TARGET = 44;

// --- Component ---

export interface BreeyoIconButtonProps {
  icon: string;
  onPress?: () => void;
  mode?: IconButtonMode;
  size?: number;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel: string;
}

export function BreeyoIconButton({
  icon,
  onPress,
  mode = 'standard',
  size = 24,
  disabled = false,
  testID,
  accessibilityLabel,
}: BreeyoIconButtonProps) {
  const paperMode = MODE_MAP[mode];

  return React.createElement(PaperIconButton, {
    icon,
    onPress,
    mode: paperMode,
    size,
    disabled,
    testID,
    accessibilityLabel,
    style: {
      minWidth: MIN_TOUCH_TARGET,
      minHeight: MIN_TOUCH_TARGET,
    },
  });
}
