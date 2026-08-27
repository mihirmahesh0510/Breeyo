import React from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';
import type { NotificationModule } from '../../molecules/NotificationItem/NotificationItem';

// --- Testable exports ---

export const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'queue', label: 'Queue' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'billing', label: 'Billing' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'emr', label: 'EMR' },
  { key: 'scheduling', label: 'Scheduling' },
] as const;

export type NotificationFilterKey = (typeof FILTER_CHIPS)[number]['key'];

export interface NotificationItemData {
  id: string;
  module: NotificationModule;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export function filterNotifications(
  notifications: NotificationItemData[],
  filter: NotificationFilterKey,
): NotificationItemData[] {
  if (filter === 'all') return notifications;
  return notifications.filter((n) => n.module === filter);
}

export function countUnread(notifications: NotificationItemData[]): number {
  return notifications.filter((n) => !n.read).length;
}

// --- Component ---

export interface NotificationListProps {
  notifications: NotificationItemData[];
  activeFilter: NotificationFilterKey;
  onFilterChange?: (filter: NotificationFilterKey) => void;
  onNotificationPress?: (id: string) => void;
  onMarkAllRead?: () => void;
  isLoading?: boolean;
  error?: string | null;
  testID?: string;
}

export function NotificationList({
  notifications,
  activeFilter,
  onFilterChange,
  onNotificationPress,
  onMarkAllRead,
  isLoading = false,
  error = null,
  testID,
}: NotificationListProps) {
  const theme = useAppTheme();
  const colors = theme.colors as Record<string, string>;
  const filtered = filterNotifications(notifications, activeFilter);
  const unreadCount = countUnread(notifications);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    chipRow: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.outline || '#79747E',
    },
    chipActive: {
      backgroundColor: colors.primary || '#1E2A6E',
      borderColor: colors.primary || '#1E2A6E',
    },
    list: {
      flex: 1,
    },
    centered: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 32,
    },
    markAllRead: {
      color: colors.primary || '#1E2A6E',
    },
  });

  if (isLoading) {
    return React.createElement(
      View,
      { style: styles.container, testID },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { variant: 'bodyMedium' },
          'Loading notifications...',
        ),
      ),
    );
  }

  if (error) {
    return React.createElement(
      View,
      { style: styles.container, testID },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { variant: 'titleMedium' },
          'Something went wrong',
        ),
        React.createElement(Text, { variant: 'bodyMedium' }, error),
      ),
    );
  }

  // Header with title and mark-all-read action
  const headerEl = React.createElement(
    View,
    { style: styles.header },
    React.createElement(
      Text,
      { variant: 'titleLarge' },
      'Notifications',
    ),
    unreadCount > 0
      ? React.createElement(
          Text,
          {
            variant: 'labelMedium',
            style: styles.markAllRead,
            onPress: onMarkAllRead,
            accessibilityRole: 'button',
          },
          'Mark all read',
        )
      : null,
  );

  // Filter chip row
  const chipElements = FILTER_CHIPS.map((chip) =>
    React.createElement(
      View,
      {
        key: chip.key,
        style: [
          styles.chip,
          activeFilter === chip.key ? styles.chipActive : null,
        ],
      },
      React.createElement(
        Text,
        {
          variant: 'labelMedium',
          style: {
            color:
              activeFilter === chip.key
                ? colors.onPrimary || '#FFFFFF'
                : colors.onSurface || '#000000',
          },
          onPress: onFilterChange
            ? () => onFilterChange(chip.key)
            : undefined,
        },
        chip.label,
      ),
    ),
  );

  const chipRow = React.createElement(
    ScrollView,
    {
      horizontal: true,
      showsHorizontalScrollIndicator: false,
      style: styles.chipRow,
    },
    ...chipElements,
  );

  // Empty state
  if (filtered.length === 0) {
    return React.createElement(
      View,
      { style: styles.container, testID },
      headerEl,
      chipRow,
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { variant: 'titleMedium' },
          'No notifications',
        ),
        React.createElement(
          Text,
          { variant: 'bodyMedium' },
          activeFilter === 'all'
            ? "You're all caught up!"
            : `No ${activeFilter} notifications`,
        ),
      ),
    );
  }

  // Populated state
  return React.createElement(
    View,
    { style: styles.container, testID },
    headerEl,
    chipRow,
    React.createElement(
      View,
      { style: styles.list },
      React.createElement(
        Text,
        { variant: 'bodyMedium' },
        `Showing ${filtered.length} notification${filtered.length === 1 ? '' : 's'}`,
      ),
    ),
  );
}
