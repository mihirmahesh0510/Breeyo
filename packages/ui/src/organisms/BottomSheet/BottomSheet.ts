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
  // Defensive fallbacks: on some render paths (observed via web preview,
  // where this component's backdrop escapes the themed tree) `useAppTheme()`
  // resolves to Paper's bare MD3LightTheme rather than the custom breeyoTheme,
  // so `theme.borderRadius`/`theme.spacing` (Breeyo-specific additions, not
  // part of Paper's own theme shape) come back undefined and crash the
  // `StyleSheet.create` call below. Values match this file's own
  // BOTTOM_SHEET_DEFAULTS comment and the project's 8px spacing scale.
  const borderRadius = theme.borderRadius ?? { lg: 12, full: 9999 };
  const spacing = theme.spacing ?? { sm: 8, md: 16 };

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
      borderTopLeftRadius: borderRadius.lg,
      borderTopRightRadius: borderRadius.lg,
      minHeight: 200,
      padding: spacing.md,
    },
    handle: {
      width: 32,
      height: 4,
      borderRadius: borderRadius.full,
      backgroundColor: colors.onSurfaceVariant || '#49454F',
      alignSelf: 'center' as const,
      marginBottom: spacing.sm,
    },
    title: {
      marginBottom: spacing.md,
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
