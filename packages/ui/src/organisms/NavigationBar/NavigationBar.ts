import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export const NAV_BAR_CONFIG = {
  height: 56,
  background: 'surface',
  elevationScrolled: 1, // elevation.level1
  iconSize: 24,
};

// --- Component ---

export interface NavigationBarProps {
  title: string;
  onBack?: () => void;
  actions?: React.ReactNode[];
  testID?: string;
}

export function NavigationBar({
  title,
  onBack,
  actions,
  testID,
}: NavigationBarProps) {
  const theme = useAppTheme();
  const colors = theme.colors as Record<string, string>;
  // See BottomSheet.ts: useAppTheme() can resolve to Paper's bare theme on
  // some web render paths, where these Breeyo-specific tokens are undefined.
  const spacing = theme.spacing ?? { xs: 4, md: 16 };

  const styles = StyleSheet.create({
    container: {
      height: NAV_BAR_CONFIG.height,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors[NAV_BAR_CONFIG.background] || colors.surface,
      paddingHorizontal: spacing.xs,
    },
    title: {
      flex: 1,
      marginLeft: onBack ? 0 : spacing.md,
    },
    actions: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
  });

  return React.createElement(
    View,
    {
      style: styles.container,
      testID,
      accessibilityRole: 'header',
    },
    onBack
      ? React.createElement(IconButton, {
          icon: 'arrow-left',
          size: NAV_BAR_CONFIG.iconSize,
          onPress: onBack,
          accessibilityLabel: 'Go back',
        })
      : null,
    React.createElement(
      Text,
      {
        variant: 'titleLarge',
        style: styles.title,
        numberOfLines: 1,
      },
      title,
    ),
    actions && actions.length > 0
      ? React.createElement(View, { style: styles.actions }, ...actions)
      : null,
  );
}
