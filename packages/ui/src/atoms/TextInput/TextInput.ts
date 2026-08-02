import React from 'react';
import {
  TextInput as PaperTextInput,
  HelperText,
} from 'react-native-paper';
import { View } from 'react-native';

// --- Testable exports ---

export const TEXT_INPUT_DEFAULTS = {
  mode: 'outlined' as 'outlined' | 'flat',
};

// --- Component ---

export interface BreeyoTextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  mode?: 'outlined' | 'flat';
  testID?: string;
}

export function BreeyoTextInput({
  label,
  value,
  onChangeText,
  error,
  helperText,
  disabled = false,
  secureTextEntry = false,
  mode = TEXT_INPUT_DEFAULTS.mode,
  testID,
}: BreeyoTextInputProps) {
  return React.createElement(
    View,
    null,
    React.createElement(PaperTextInput, {
      label,
      value,
      onChangeText,
      error: !!error,
      disabled,
      secureTextEntry,
      mode,
      testID,
      accessibilityLabel: label,
    }),
    error
      ? React.createElement(
          HelperText,
          { type: 'error', visible: true },
          error,
        )
      : helperText
        ? React.createElement(
            HelperText,
            { type: 'info', visible: true },
            helperText,
          )
        : null,
  );
}
