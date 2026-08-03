import React from 'react';
import { View } from 'react-native';
import { List } from 'react-native-paper';

// --- Component ---

export interface AccordionItemProps {
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  testID?: string;
}

export function AccordionItem({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  testID,
}: AccordionItemProps) {
  return React.createElement(
    View,
    {
      testID,
      accessibilityState: { expanded },
    },
    React.createElement(
      List.Accordion,
      {
        title,
        description: subtitle,
        expanded,
        onPress: onToggle,
        accessibilityState: { expanded },
      },
      children,
    ),
  );
}
