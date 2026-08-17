import React, { useMemo, useCallback } from 'react';
import { SectionList, View, StyleSheet } from 'react-native';
import { EmptyState } from '@breeyo/ui';
import { QueueStatus, isValidTransition } from '@breeyo/types';
import type { QueueBoard as QueueBoardType, QueueEntryWithPet } from '@breeyo/types';
import { QueueCardItem } from './QueueCardItem';
import { QueueSectionHeader } from './QueueSectionHeader';
import { useQueueUIStore } from '../store/queueUIStore';
import {
  buildQueueSections,
  isQueueBoardEmpty,
  getItemPositionInfo,
  getSectionHeaderProps,
  getNextStatus,
  type SectionData,
} from '../lib/queue-board-utils';

interface QueueBoardProps {
  data: QueueBoardType;
  disabled: boolean;
  onCardPress?: (petId: string) => void;
  onStatusChange?: (entryId: string, newStatus: QueueStatus) => void;
  onNoShow?: (entryId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function QueueBoard({
  data,
  disabled,
  onCardPress,
  onStatusChange,
  onNoShow,
  onRefresh,
  refreshing,
}: QueueBoardProps) {
  const { showDoneSection, toggleDoneSection } = useQueueUIStore();

  const sections = useMemo<SectionData[]>(
    () => buildQueueSections(data, showDoneSection),
    [data, showDoneSection],
  );

  const handleStatusPress = useCallback(
    (entry: QueueEntryWithPet) => {
      const nextStatus = getNextStatus(entry.status as QueueStatus);
      if (nextStatus && onStatusChange) {
        onStatusChange(entry.id, nextStatus);
      }
    },
    [onStatusChange],
  );

  const handleLongPress = useCallback(
    (entry: QueueEntryWithPet) => {
      if (
        onNoShow &&
        isValidTransition(entry.status as QueueStatus, QueueStatus.NO_SHOW)
      ) {
        onNoShow(entry.id);
      }
    },
    [onNoShow],
  );

  const renderItem = useCallback(
    ({ item, index, section }: { item: QueueEntryWithPet; index: number; section: SectionData }) => {
      const { position, estimatedWait } = getItemPositionInfo(section, index);

      return (
        <QueueCardItem
          entry={item}
          position={position}
          estimatedWait={estimatedWait}
          disabled={disabled}
          onPress={() => onCardPress?.(item.pet.id)}
          onStatusPress={() => handleStatusPress(item)}
          onLongPress={() => handleLongPress(item)}
        />
      );
    },
    [disabled, onCardPress, handleStatusPress, handleLongPress],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionData }) => {
      const headerProps = getSectionHeaderProps(
        section,
        data.done.length,
        showDoneSection,
        toggleDoneSection,
      );

      return <QueueSectionHeader {...headerProps} />;
    },
    [data.done.length, showDoneSection, toggleDoneSection],
  );

  const isEmpty = isQueueBoardEmpty(data);

  if (isEmpty) {
    return (
      <EmptyState
        title="No patients in queue yet"
        description="Tap Check In to add your first patient today."
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.content}
      onRefresh={onRefresh}
      refreshing={refreshing ?? false}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingBottom: 100, // space for FAB
  },
});
