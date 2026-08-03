import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export const MODULE_ICON_MAP = {
  queue: 'clipboard-list-outline',
  inventory: 'package-variant-closed',
  billing: 'receipt',
  whatsapp: 'whatsapp',
  emr: 'stethoscope',
  scheduling: 'calendar-clock',
  system: 'cog-outline',
} as const;

export const MODULE_COLOR_MAP = {
  queue: 'primary',
  inventory: 'secondary',
  billing: 'secondary',
  whatsapp: 'primary',
  emr: 'primary',
  scheduling: 'primary',
  system: 'onSurfaceVariant',
} as const;

export type NotificationModule = keyof typeof MODULE_ICON_MAP;

// --- Component ---

export interface NotificationItemProps {
  id: string;
  module: NotificationModule;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  onPress?: (id: string) => void;
  testID?: string;
}

export function NotificationItem({
  id,
  module,
  title,
  message,
  timestamp,
  read,
  onPress,
  testID,
}: NotificationItemProps) {
  const theme = useAppTheme();
  const colors = theme.colors as Record<string, string>;
  const colorKey = MODULE_COLOR_MAP[module];

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      minHeight: 72,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: read
        ? colors.surface || '#FFFFFF'
        : colors.surfaceVariant || '#F5F0EB',
      borderLeftWidth: read ? 0 : 3,
      borderLeftColor: read
        ? 'transparent'
        : colors.tertiary || '#E65100',
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors[colorKey] || colorKey,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginRight: 12,
    },
    content: {
      flex: 1,
      marginRight: 8,
    },
    title: {
      fontWeight: read ? ('normal' as const) : ('bold' as const),
    },
    timestamp: {
      color: colors.onSurfaceVariant || '#49454F',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.tertiary || '#E65100',
    },
  });

  return React.createElement(
    TouchableOpacity,
    {
      style: styles.container,
      onPress: onPress ? () => onPress(id) : undefined,
      testID,
      accessibilityLabel: `${read ? '' : 'Unread: '}${title}. ${message}. ${timestamp}`,
      accessibilityRole: 'button',
    },
    // Left icon
    React.createElement(
      View,
      { style: styles.iconContainer },
      React.createElement(
        Text,
        { style: { color: '#FFFFFF', fontSize: 16 } },
        MODULE_ICON_MAP[module].charAt(0).toUpperCase(),
      ),
    ),
    // Center content
    React.createElement(
      View,
      { style: styles.content },
      React.createElement(
        Text,
        { variant: 'titleSmall', style: styles.title },
        title,
      ),
      React.createElement(
        Text,
        { variant: 'bodySmall', numberOfLines: 1 },
        message,
      ),
      React.createElement(
        Text,
        { variant: 'labelSmall', style: styles.timestamp },
        timestamp,
      ),
    ),
    // Right unread dot
    !read
      ? React.createElement(View, { style: styles.unreadDot })
      : null,
  );
}
