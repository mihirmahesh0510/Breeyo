import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export type TabKey = 'queue' | 'patients' | 'inventory' | 'more';

export interface TabConfigEntry {
  key: TabKey;
  icon: string;
  label: string;
}

export const TAB_CONFIG: TabConfigEntry[] = [
  { key: 'queue', icon: 'clipboard-list-outline', label: 'Queue' },
  { key: 'patients', icon: 'paw', label: 'Patients' },
  { key: 'inventory', icon: 'package-variant-closed', label: 'Inventory' },
  { key: 'more', icon: 'dots-horizontal', label: 'More' },
];

export const BOTTOM_TAB_BAR_CONFIG = {
  height: 56,
  activeColor: 'primary',
  inactiveColor: 'onSurfaceVariant',
};

// --- Component ---

export interface BottomTabBarProps {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
  testID?: string;
}

export function BottomTabBar({
  activeTab,
  onTabPress,
  testID,
}: BottomTabBarProps) {
  const theme = useAppTheme();
  const colors = theme.colors as Record<string, string>;
  // See BottomSheet.ts: useAppTheme() can resolve to Paper's bare theme on
  // some web render paths, where these Breeyo-specific tokens are undefined.
  const spacing = theme.spacing ?? { xs: 4 };

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row' as const,
      height: BOTTOM_TAB_BAR_CONFIG.height,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant || '#CAC4D0',
    },
    tab: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: spacing.xs,
    },
    label: {
      marginTop: 2,
    },
  });

  return React.createElement(
    View,
    {
      style: styles.container,
      testID,
      accessibilityRole: 'tablist',
    },
    ...TAB_CONFIG.map((tab) => {
      const isActive = activeTab === tab.key;
      const color = isActive
        ? colors[BOTTOM_TAB_BAR_CONFIG.activeColor] || colors.primary
        : colors[BOTTOM_TAB_BAR_CONFIG.inactiveColor] || colors.onSurfaceVariant;

      return React.createElement(
        Pressable,
        {
          key: tab.key,
          style: styles.tab,
          onPress: () => onTabPress(tab.key),
          accessibilityRole: 'tab',
          accessibilityState: { selected: isActive },
          accessibilityLabel: tab.label,
        },
        React.createElement(
          Text,
          {
            variant: 'labelSmall',
            style: [styles.label, { color }],
          },
          tab.label,
        ),
      );
    }),
  );
}
