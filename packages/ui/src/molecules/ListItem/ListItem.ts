import React from 'react';
import { List } from 'react-native-paper';

// --- Testable exports ---

export const LIST_ITEM_MIN_HEIGHT = 56;

// --- Component ---

export interface ListItemProps {
  title: string;
  description?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

export function ListItem({
  title,
  description,
  left,
  right,
  onPress,
  disabled = false,
  testID,
}: ListItemProps) {
  const accessibilityLabel = description
    ? `${title}, ${description}`
    : title;

  return React.createElement(List.Item, {
    title,
    description,
    left: left ? () => left : undefined,
    right: right ? () => right : undefined,
    onPress,
    disabled,
    testID,
    style: { minHeight: LIST_ITEM_MIN_HEIGHT },
    accessibilityLabel,
  });
}
