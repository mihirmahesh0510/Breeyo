import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export const NOTIFICATION_BADGE_CONFIG = {
  iconName: 'bell-outline',
  badgeColor: 'tertiary',
  badgeTextColor: 'onTertiary',
  minTouchTarget: 44,
  badgeSizes: {
    small: { minWidth: 18, height: 18, borderRadius: 9 },
    medium: { minWidth: 22, height: 18, borderRadius: 9 },
    large: { minWidth: 26, height: 18, borderRadius: 9 },
  },
} as const;

export function formatBadgeCount(count: number): {
  display: string | null;
  size: 'small' | 'medium' | 'large';
} {
  if (count <= 0) return { display: null, size: 'small' };
  if (count <= 9) return { display: String(count), size: 'small' };
  if (count <= 99) return { display: String(count), size: 'medium' };
  return { display: '99+', size: 'large' };
}

export function getAccessibilityLabel(count: number): string {
  if (count <= 0) return 'Notifications, no unread';
  return `${count} unread notification${count === 1 ? '' : 's'}`;
}

// --- Component ---

export interface NotificationBadgeProps {
  count: number;
  onPress?: () => void;
  testID?: string;
}

export function NotificationBadge({
  count,
  onPress,
  testID,
}: NotificationBadgeProps) {
  const theme = useAppTheme();
  const colors = theme.colors as Record<string, string>;
  const { display, size } = formatBadgeCount(count);
  const badgeSize = NOTIFICATION_BADGE_CONFIG.badgeSizes[size];

  const styles = StyleSheet.create({
    container: {
      minWidth: NOTIFICATION_BADGE_CONFIG.minTouchTarget,
      minHeight: NOTIFICATION_BADGE_CONFIG.minTouchTarget,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    iconWrapper: {
      position: 'relative' as const,
    },
    badge: {
      position: 'absolute' as const,
      top: -4,
      right: -6,
      minWidth: badgeSize.minWidth,
      height: badgeSize.height,
      borderRadius: badgeSize.borderRadius,
      backgroundColor:
        colors[NOTIFICATION_BADGE_CONFIG.badgeColor] ||
        NOTIFICATION_BADGE_CONFIG.badgeColor,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 4,
    },
    badgeText: {
      color:
        colors[NOTIFICATION_BADGE_CONFIG.badgeTextColor] ||
        NOTIFICATION_BADGE_CONFIG.badgeTextColor,
      fontSize: 10,
      fontWeight: 'bold' as const,
      textAlign: 'center' as const,
    },
  });

  const label = getAccessibilityLabel(count);

  const content = React.createElement(
    View,
    { style: styles.iconWrapper },
    React.createElement(Text, { variant: 'bodyLarge' }, '\u{1F514}'),
    display
      ? React.createElement(
          View,
          { style: styles.badge },
          React.createElement(Text, { style: styles.badgeText }, display),
        )
      : null,
  );

  return React.createElement(
    TouchableOpacity,
    {
      style: styles.container,
      onPress,
      testID,
      accessibilityLabel: label,
      accessibilityRole: 'button',
    },
    content,
  );
}
