import React from 'react';
import { Button as PaperButton } from 'react-native-paper';

// --- Testable exports ---

export type ButtonVariant = 'filled' | 'outlined' | 'text';
export type ButtonSize = 'small' | 'medium' | 'large';

export const SIZE_MAP: Record<
  ButtonSize,
  { minHeight: number; paddingHorizontal: number }
> = {
  small: { minHeight: 36, paddingHorizontal: 12 },
  medium: { minHeight: 44, paddingHorizontal: 16 },
  large: { minHeight: 52, paddingHorizontal: 24 },
};

export const VARIANT_MAP: Record<ButtonVariant, 'contained' | 'outlined' | 'text'> = {
  filled: 'contained',
  outlined: 'outlined',
  text: 'text',
};

export const BUTTON_DEFAULTS = {
  variant: 'filled' as ButtonVariant,
  size: 'medium' as ButtonSize,
};

// --- Component ---

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  testID?: string;
}

export function Button({
  variant = BUTTON_DEFAULTS.variant,
  size = BUTTON_DEFAULTS.size,
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  testID,
}: ButtonProps) {
  const sizeStyle = SIZE_MAP[size];
  const paperMode = VARIANT_MAP[variant];

  return React.createElement(PaperButton, {
    mode: paperMode,
    onPress,
    disabled,
    loading,
    icon,
    testID,
    contentStyle: {
      minHeight: sizeStyle.minHeight,
      paddingHorizontal: sizeStyle.paddingHorizontal,
    },
    accessibilityLabel: label,
    accessibilityRole: 'button',
    accessibilityState: { disabled, busy: loading },
    children: label,
  });
}
