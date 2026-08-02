import React from 'react';
import { View } from 'react-native';
import { Typography } from '../../atoms/Typography/Typography';
import { BreeyoTextInput } from '../../atoms/TextInput/TextInput';

// --- Component ---

export interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function FormField({
  label,
  value,
  onChangeText,
  error,
  helperText,
  required = false,
  disabled = false,
  testID,
}: FormFieldProps) {
  const displayLabel = required ? `${label} *` : label;

  return React.createElement(
    View,
    { testID },
    React.createElement(
      Typography,
      { variant: 'caption', style: { marginBottom: 4 } },
      displayLabel,
    ),
    React.createElement(BreeyoTextInput, {
      label: displayLabel,
      value,
      onChangeText,
      error,
      helperText,
      disabled,
    }),
  );
}
