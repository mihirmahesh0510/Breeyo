import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Typography } from '../../atoms/Typography/Typography';
import { Button } from '../../atoms/Button/Button';

// --- Component ---

export interface EmptyStateProps {
  illustration?: any; // ImageSourcePropType
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 32,
  },
  illustration: {
    width: 200,
    height: 200,
    marginBottom: 24,
  },
  title: {
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  description: {
    textAlign: 'center' as const,
    marginBottom: 24,
  },
});

export function EmptyState({
  illustration,
  title,
  description,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return React.createElement(
    View,
    { style: styles.container, testID },
    illustration
      ? React.createElement(Image, {
          source: illustration,
          style: styles.illustration,
          accessibilityLabel: title,
        })
      : null,
    React.createElement(
      Typography,
      { variant: 'heading2', style: styles.title },
      title,
    ),
    description
      ? React.createElement(
          Typography,
          { variant: 'body', style: styles.description },
          description,
        )
      : null,
    actionLabel && onAction
      ? React.createElement(Button, {
          variant: 'filled',
          label: actionLabel,
          onPress: onAction,
        })
      : null,
  );
}
