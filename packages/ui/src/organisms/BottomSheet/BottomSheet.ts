import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export const BOTTOM_SHEET_DEFAULTS = {
  snapPoints: ['25%', '50%', '90%'] as string[],
  handleHeight: 24,
  borderRadius: 12, // borderRadius.lg (top corners only)
  backgroundColor: 'surface',
};

// --- Component ---

export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  snapPoints?: string[];
  children: React.ReactNode;
  title?: string;
  testID?: string;
}

/**
 * Stub BottomSheet component.
 * In production, this wraps @gorhom/bottom-sheet.
 * This implementation provides a basic fallback with the correct API surface.
 */
export function BottomSheet({
  visible,
  onDismiss,
  snapPoints = BOTTOM_SHEET_DEFAULTS.snapPoints,
  children,
  title,
  testID,
}: BottomSheetProps) {
  const theme = useAppTheme();
  const colors = theme.colors as Record<string, string>;

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
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'flex-end' as const,
    },
    sheet: {
      backgroundColor: colors[BOTTOM_SHEET_DEFAULTS.backgroundColor] || colors.surface,
      borderTopLeftRadius: theme.borderRadius.lg,
      borderTopRightRadius: theme.borderRadius.lg,
      minHeight: 200,
      padding: theme.spacing.md,
    },
    handle: {
      width: 32,
      height: 4,
      borderRadius: theme.borderRadius.full,
      backgroundColor: colors.onSurfaceVariant || '#49454F',
      alignSelf: 'center' as const,
      marginBottom: theme.spacing.sm,
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
      { style: styles.sheet },
      React.createElement(View, { style: styles.handle }),
      title
        ? React.createElement(
            Text,
            { variant: 'titleMedium', style: styles.title },
            title,
          )
        : null,
      children,
    ),
  );
}
