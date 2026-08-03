import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { showToast } from '@breeyo/ui';
import { QueueStatus } from '@breeyo/types/constants/queue-status';
import { useAuth } from '../../../providers/AuthProvider';
import { useQueue } from '../hooks/useQueue';
import { useQueueSocket } from '../hooks/useQueueSocket';
import { useUpdateQueueStatus, useCallNext } from '../hooks/useQueueActions';
import { useQueueUIStore } from '../store/queueUIStore';
import { QueueBoard } from '../components/QueueBoard';
import { CallNextButton } from '../components/CallNextButton';
import { CheckInSheet } from '../components/CheckInSheet';
import { OfflineBanner } from '../components/OfflineBanner';

export function QueueScreen() {
  const router = useRouter();
  const { activeClinicId } = useAuth();
  const queryClient = useQueryClient();
  const isOffline = useQueueUIStore((s) => s.isOffline);

  const [checkInVisible, setCheckInVisible] = useState(false);

  // Initialize Socket.IO connection
  useQueueSocket();

  // Fetch queue data
  const {
    data: queueData,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQueue();

  const updateStatus = useUpdateQueueStatus();
  const callNext = useCallNext();

  const hasWaiting = (queueData?.waiting.length ?? 0) > 0;

  const handleCallNext = useCallback(() => {
    callNext.mutate();
  }, [callNext]);

  const handleStatusChange = useCallback(
    (entryId: string, newStatus: QueueStatus) => {
      updateStatus.mutate({ entryId, status: newStatus });
    },
    [updateStatus],
  );

  const handleNoShow = useCallback(
    (entryId: string) => {
      Alert.alert(
        'Mark as No-show?',
        'This patient will be removed from the active queue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark No-show',
            style: 'destructive',
            onPress: () => {
              updateStatus.mutate({
                entryId,
                status: QueueStatus.NO_SHOW,
              });
            },
          },
        ],
      );
    },
    [updateStatus],
  );

  const handleCardPress = useCallback(
    (petId: string) => {
      router.push({
        pathname: '/patient/[petId]',
        params: { petId },
      });
    },
    [router],
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCheckInSuccess = useCallback(
    (petName: string, position: number) => {
      showToast('success', `${petName} checked in — Position #${position}`);
    },
    [],
  );

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text variant="headlineLarge" style={styles.title}>
          Walk-in Queue
        </Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  // Error state
  if (isError) {
    return (
      <View style={styles.container}>
        <Text variant="headlineLarge" style={styles.title}>
          Walk-in Queue
        </Text>
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge" style={styles.errorText}>
            Could not load queue. Pull down to try again.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>
        Walk-in Queue
      </Text>

      <OfflineBanner />

      <CallNextButton
        onPress={handleCallNext}
        loading={callNext.isPending}
        disabled={!hasWaiting || isOffline}
      />

      {queueData && (
        <QueueBoard
          data={queueData}
          disabled={isOffline}
          onCardPress={handleCardPress}
          onStatusChange={handleStatusChange}
          onNoShow={handleNoShow}
          onRefresh={handleRefresh}
          refreshing={isRefetching}
        />
      )}

      <FAB
        icon="plus"
        label="Check In"
        onPress={() => setCheckInVisible(true)}
        style={[styles.fab, isOffline && styles.fabDisabled]}
        disabled={isOffline}
        color="#FFFFFF"
        customSize={56}
        testID="check-in-fab"
      />

      <CheckInSheet
        visible={checkInVisible}
        onDismiss={() => setCheckInVisible(false)}
        onCheckInSuccess={handleCheckInSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  title: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    color: '#1C1B1F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    textAlign: 'center',
    color: '#49454F',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#2E7D32',
    borderRadius: 16,
  },
  fabDisabled: {
    backgroundColor: '#CAC4D0',
  },
});
