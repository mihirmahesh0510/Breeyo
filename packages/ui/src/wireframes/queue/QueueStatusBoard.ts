import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text } from 'react-native-paper';

// --- Config export ---

export const QUEUE_STATUS_BOARD_CONFIG = {
  fabIcon: 'plus',
  fabLabel: 'Check In',
  emptyTitle: 'No patients in queue',
  emptySubtitle: 'Tap + to check in a walk-in patient',
  errorTitle: 'Something went wrong',
};

// --- Types ---

export type QueueBoardState = 'empty' | 'loading' | 'populated' | 'error';

export interface QueueStatusBoardProps {
  state: QueueBoardState;
  entries?: any[];
  errorMessage?: string;
  onCheckIn?: () => void;
  onEntryPress?: (id: string) => void;
  testID?: string;
}

// --- Component ---

export function QueueStatusBoard({
  state,
  entries = [],
  errorMessage,
  onCheckIn,
  onEntryPress,
  testID,
}: QueueStatusBoardProps) {
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
    list: {
      flex: 1,
      paddingHorizontal: 16,
    },
    centered: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 32,
    },
    fab: {
      position: 'absolute' as const,
      right: 16,
      bottom: 16,
    },
  });

  if (state === 'loading') {
    return React.createElement(
      View,
      { style: styles.container, testID },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(Text, { variant: 'bodyMedium' }, 'Loading queue...'),
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
          QUEUE_STATUS_BOARD_CONFIG.errorTitle,
        ),
        React.createElement(
          Text,
          { variant: 'bodyMedium' },
          errorMessage || 'An unknown error occurred',
        ),
      ),
    );
  }

  if (state === 'empty' || entries.length === 0) {
    return React.createElement(
      View,
      { style: styles.container, testID },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { variant: 'titleMedium' },
          QUEUE_STATUS_BOARD_CONFIG.emptyTitle,
        ),
        React.createElement(
          Text,
          { variant: 'bodyMedium' },
          QUEUE_STATUS_BOARD_CONFIG.emptySubtitle,
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
        'Queue',
      ),
      React.createElement(
        Text,
        { variant: 'labelMedium' },
        `${entries.length} patients`,
      ),
    ),
    React.createElement(
      View,
      { style: styles.list },
      React.createElement(Text, { variant: 'bodyMedium' }, `Showing ${entries.length} queue entries`),
    ),
  );
}
