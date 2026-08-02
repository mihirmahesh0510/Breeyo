import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export const MODAL_DEFAULTS = {
  maxWidth: 480,
  elevation: 'level4' as const,
  borderRadius: 12, // borderRadius.lg
};

// --- Component ---

export interface ModalProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  children: React.ReactNode;
  testID?: string;
}

export function Modal({
  visible,
  onDismiss,
  title,
  children,
  testID,
}: ModalProps) {
  const theme = useAppTheme();

  if (!visible) {
    return null;
  }

  const styles = StyleSheet.create({
    backdrop: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    container: {
      backgroundColor: (theme.colors as Record<string, string>).surface,
      borderRadius: theme.borderRadius.lg,
      maxWidth: MODAL_DEFAULTS.maxWidth,
      width: '90%' as any,
      padding: theme.spacing.lg,
    },
    title: {
      marginBottom: theme.spacing.md,
    },
  });

  return React.createElement(
    View,
    {
      style: styles.backdrop,
      testID,
      accessibilityRole: 'none',
    },
    React.createElement(
      View,
      {
        style: styles.container,
        accessibilityRole: 'alert',
      },
      title
        ? React.createElement(
            Text,
            { variant: 'headlineSmall', style: styles.title },
            title,
          )
        : null,
      children,
    ),
  );
}
