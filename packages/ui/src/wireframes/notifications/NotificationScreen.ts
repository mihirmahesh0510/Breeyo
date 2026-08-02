import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import type { NotificationItemData, NotificationFilterKey } from '../../organisms/NotificationList/NotificationList';

// --- Config export ---

export const NOTIFICATION_SCREEN_CONFIG = {
  emptyTitle: 'No notifications',
  emptySubtitle: "You're all caught up!",
  errorTitle: 'Something went wrong',
  loadingMessage: 'Loading notifications...',
};

// --- Types ---

export type NotificationScreenState = 'empty' | 'loading' | 'populated' | 'error';

export interface NotificationScreenProps {
  state: NotificationScreenState;
  notifications?: NotificationItemData[];
  activeFilter?: NotificationFilterKey;
  errorMessage?: string;
  onFilterChange?: (filter: NotificationFilterKey) => void;
  onNotificationPress?: (id: string) => void;
  onMarkAllRead?: () => void;
  testID?: string;
}

// --- Component ---

export function NotificationScreen({
  state,
  notifications = [],
  activeFilter = 'all',
  errorMessage,
  onFilterChange,
  onNotificationPress,
  onMarkAllRead,
  testID,
}: NotificationScreenProps) {
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
    centered: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 32,
    },
    list: {
      flex: 1,
      paddingHorizontal: 16,
    },
  });

  if (state === 'loading') {
    return React.createElement(
      View,
      { style: styles.container, testID },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { variant: 'bodyMedium' },
          NOTIFICATION_SCREEN_CONFIG.loadingMessage,
        ),
      ),
    );
  }

  if (state === 'error') {
    return React.createElement(
      View,
      { style: styles.container, testID },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { variant: 'titleMedium' },
          NOTIFICATION_SCREEN_CONFIG.errorTitle,
        ),
        React.createElement(
          Text,
          { variant: 'bodyMedium' },
          errorMessage || 'An unknown error occurred',
        ),
      ),
    );
  }

  if (state === 'empty' || notifications.length === 0) {
    return React.createElement(
      View,
      { style: styles.container, testID },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { variant: 'titleMedium' },
          NOTIFICATION_SCREEN_CONFIG.emptyTitle,
        ),
        React.createElement(
          Text,
          { variant: 'bodyMedium' },
          NOTIFICATION_SCREEN_CONFIG.emptySubtitle,
        ),
      ),
    );
  }

  // Populated state
  return React.createElement(
    View,
    { style: styles.container, testID },
    React.createElement(
      View,
      { style: styles.header },
      React.createElement(
        Text,
        { variant: 'titleLarge' },
        'Notifications',
      ),
      React.createElement(
        Text,
        { variant: 'labelMedium' },
        `${notifications.length} notifications`,
      ),
    ),
    React.createElement(
      View,
      { style: styles.list },
      React.createElement(
        Text,
        { variant: 'bodyMedium' },
        `Showing ${notifications.length} notifications (filter: ${activeFilter})`,
      ),
    ),
  );
}
