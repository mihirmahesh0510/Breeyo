import React from 'react';
import { Searchbar } from 'react-native-paper';

// --- Component ---

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  testID?: string;
}

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search...',
  testID,
}: SearchBarProps) {
  return React.createElement(Searchbar, {
    value,
    onChangeText,
    onSubmitEditing: onSubmit,
    placeholder,
    testID,
    accessibilityLabel: placeholder,
    accessibilityRole: 'search',
  });
}
