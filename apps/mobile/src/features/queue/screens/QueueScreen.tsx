import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { showToast } from '@breeyo/ui';
import { QueueStatus } from '@breeyo/types';
import type { QueueEntryWithPet } from '@breeyo/types';
import { useAuth } from '../../../providers/AuthProvider';
import { ResumeBanner } from '../components/ResumeBanner';
import {
  navigateToConsultation,
  navigateToConsultationDetail,
} from '../../../navigation/consultation-navigator';
import { useQueue } from '../hooks/useQueue';
import { useQueueSocket } from '../hooks/useQueueSocket';
import { useUpdateQueueStatus, useCallNext } from '../hooks/useQueueActions';
import { useOfflineQueueActions } from '../hooks/useOfflineQueueActions';
import { useQueueOfflineStore } from '../store/queueOfflineStore';
import { QueueBoard } from '../components/QueueBoard';
import { CallNextButton } from '../components/CallNextButton';
import { CheckInSheet } from '../components/CheckInSheet';
import { ExpectedActionSheet } from '../components/ExpectedActionSheet';
import { OfflineBanner } from '../components/OfflineBanner';
import { mergeLocalQueueEntriesIntoBoard, findEntryInBoard } from '../lib/queue-offline-utils';

export function QueueScreen() {
  const router = useRouter();
  const { activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  const [checkInVisible, setCheckInVisible] = useState(false);
  const [expectedEntry, setExpectedEntry] = useState<QueueEntryWithPet | null>(null);

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

  // Plan 10-02 (D-01 to D-03, D-12): local queue projection + the
  // offline-aware mutation hook. `mergedQueueData` is what actually renders
  // -- a locally-created or locally-modified entry shows up in its real
  // section immediately, with a quiet pending marker (QueueCardItem), never
  // demoted to a placeholder or a separate "pending" area.
  const offlineActions = useOfflineQueueActions();
  const localEntriesById = useQueueOfflineStore((state) => state.localEntriesById);
  const localEntries = useMemo(() => Object.values(localEntriesById), [localEntriesById]);
  const mergedQueueData = useMemo(
    () => (queueData ? mergeLocalQueueEntriesIntoBoard(queueData, localEntries) : queueData),
    [queueData, localEntries],
  );

  const hasWaiting = (mergedQueueData?.waiting.length ?? 0) > 0;

  const handleCallNext = useCallback(() => {
    callNext.mutate(undefined, {
      onError: async (error: any) => {
        // Online call-next failed for a connectivity reason (not a real
        // server rejection) -- fall back to this device's own local
        // WAITING-section view via the offline-aware hook rather than
        // leaving staff stuck with no way to advance the queue at all.
        if (error?.status !== undefined) return; // a real server error already surfaced via useCallNext's own handler
        try {
          await offlineActions.callNext(mergedQueueData?.waiting ?? []);
        } catch {
          // Nothing waiting locally either -- useCallNext's own error
          // handler already gave the standard haptic/error feedback.
        }
      },
    });
  }, [callNext, offlineActions, mergedQueueData]);

  const handleStatusChange = useCallback(
    (entryId: string, newStatus: QueueStatus) => {
      updateStatus.mutate(
        { entryId, status: newStatus },
        {
          onError: async (error: any) => {
            if (error?.status !== undefined) return;
            const baseEntry = mergedQueueData ? findEntryInBoard(mergedQueueData, entryId) : undefined;
            await offlineActions.updateStatus(entryId, newStatus, baseEntry);
          },
        },
      );
    },
    [updateStatus, offlineActions, mergedQueueData],
  );

  const handleNoShow = useCallback(
    (entryId: string) => {
      Alert.alert(
        'Mark as No-show?',
        'This patient will be removed from the active queue.',
        [
          { text: 'Keep in Queue', style: 'cancel' },
          {
            text: 'Mark No-show',
            style: 'destructive',
            onPress: () => {
              updateStatus.mutate(
                {
                  entryId,
                  status: QueueStatus.NO_SHOW,
                },
                {
                  onError: async (error: any) => {
                    if (error?.status !== undefined) return;
                    const baseEntry = mergedQueueData ? findEntryInBoard(mergedQueueData, entryId) : undefined;
                    await offlineActions.noShow(entryId, baseEntry);
                  },
                },
              );
            },
          },
        ],
      );
    },
    [updateStatus, offlineActions, mergedQueueData],
  );

  const handleCardPress = useCallback(
    (petId: string, entryStatus?: QueueStatus, consultationId?: string, queueEntryId?: string) => {
      if (entryStatus === QueueStatus.IN_CONSULT) {
        // Navigate to ConsultationScreen for in-progress consultations
        navigateToConsultation(router, {
          consultationId,
          petId,
          queueEntryId,
        });
      } else if (entryStatus === QueueStatus.DONE && consultationId) {
        // Navigate to ConsultationDetailScreen for completed consultations
        navigateToConsultationDetail(router, { consultationId });
      } else {
        // Default: navigate to patient detail
        router.push({
          pathname: '/patient/[petId]',
          params: { petId },
        });
      }
    },
    [router],
  );

  // An EXPECTED row opens the quick-action sheet instead of navigating --
  // it isn't in line yet, so there's nothing useful to show on patient
  // detail. Every other status keeps navigating exactly as it did before
  // `QueueBoard`'s `onCardPress` widened from `(petId)` to `(item)`.
  const handleQueueCardPress = useCallback(
    (item: QueueEntryWithPet) => {
      if (item.status === QueueStatus.EXPECTED) {
        setExpectedEntry(item);
        return;
      }
      handleCardPress(item.pet.id);
    },
    [handleCardPress],
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

  // D-11: early check-in flips an EXPECTED entry straight to WAITING, no
  // waiting for the slot time.
  const handleExpectedCheckIn = useCallback(
    (entryId: string) => {
      const petName = expectedEntry?.pet.name;
      setExpectedEntry(null);
      updateStatus.mutate(
        { entryId, status: QueueStatus.WAITING },
        {
          onSuccess: (result) => {
            if (petName) {
              showToast(
                'success',
                `${petName} checked in — Position #${result.data.position}`,
              );
            }
          },
          onError: async (error: any) => {
            if (error?.status !== undefined) return;
            const baseEntry = expectedEntry ?? (mergedQueueData ? findEntryInBoard(mergedQueueData, entryId) : undefined);
            const result = await offlineActions.updateStatus(entryId, QueueStatus.WAITING, baseEntry);
            if (petName) {
              showToast('success', `${petName} checked in — Position #${result.data.position}`);
            }
          },
        },
      );
    },
    [updateStatus, expectedEntry, offlineActions, mergedQueueData],
  );

  const handleExpectedNoShow = useCallback(
    (entryId: string) => {
      Alert.alert(
        'Mark as No-show?',
        'This patient will be removed from the active queue.',
        [
          { text: 'Keep in Queue', style: 'cancel' },
          {
            text: 'Mark No-show',
            style: 'destructive',
            onPress: () => {
              updateStatus.mutate(
                { entryId, status: QueueStatus.NO_SHOW },
                {
                  onError: async (error: any) => {
                    if (error?.status !== undefined) return;
                    const baseEntry = expectedEntry ?? (mergedQueueData ? findEntryInBoard(mergedQueueData, entryId) : undefined);
                    await offlineActions.noShow(entryId, baseEntry);
                  },
                },
              );
              setExpectedEntry(null);
            },
          },
        ],
      );
    },
    [updateStatus, expectedEntry, offlineActions, mergedQueueData],
  );

  const handleViewAppointment = useCallback(
    (appointmentId: string | null) => {
      if (!appointmentId) return;
      setExpectedEntry(null);
      // Plain path string: /schedule is registered by plan 08-12 in a later
      // wave, so this can't be a typed expo-router route object yet.
      router.push(`/schedule?appointmentId=${appointmentId}` as any);
    },
    [router],
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

      <ResumeBanner />

      <CallNextButton
        onPress={handleCallNext}
        loading={callNext.isPending}
        disabled={!hasWaiting}
      />

      {mergedQueueData && (
        <QueueBoard
          data={mergedQueueData}
          // Plan 10-02 (D-01 to D-03): the board stays fully interactive
          // offline -- check-in/status-transition/no-show/call-next all
          // queue for replay instead of being blocked. Connectivity no
          // longer gates interaction.
          disabled={false}
          onCardPress={handleQueueCardPress}
          onStatusChange={handleStatusChange}
          onNoShow={handleNoShow}
          onRefresh={handleRefresh}
          refreshing={isRefetching}
        />
      )}

      {/* Plan 10-02 (D-01, D-03): check-in stays available offline -- it
          captures locally and queues for replay via `useOfflineQueueActions`
          instead of being blocked by connectivity. */}
      <FAB
        icon="plus"
        label="Check In"
        onPress={() => setCheckInVisible(true)}
        style={styles.fab}
        color="#FFFFFF"
        customSize={56}
        testID="check-in-fab"
      />

      <CheckInSheet
        visible={checkInVisible}
        onDismiss={() => setCheckInVisible(false)}
        onCheckInSuccess={handleCheckInSuccess}
      />

      <ExpectedActionSheet
        visible={expectedEntry != null}
        entry={expectedEntry}
        onDismiss={() => setExpectedEntry(null)}
        onCheckIn={handleExpectedCheckIn}
        onNoShow={handleExpectedNoShow}
        onViewAppointment={handleViewAppointment}
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
});
