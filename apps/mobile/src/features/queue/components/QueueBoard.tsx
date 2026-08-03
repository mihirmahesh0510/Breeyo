import React, { useMemo, useCallback } from 'react';
import { SectionList, View, StyleSheet } from 'react-native';
import { EmptyState } from '@breeyo/ui';
import { QueueStatus, isValidTransition } from '@breeyo/types/constants/queue-status';
import type { QueueBoard as QueueBoardType, QueueEntryWithPet } from '@breeyo/types';
import { QueueCardItem } from './QueueCardItem';
import { QueueSectionHeader } from './QueueSectionHeader';
import { useQueueUIStore } from '../store/queueUIStore';

interface QueueBoardProps {
  data: QueueBoardType;
  disabled: boolean;
  onCardPress?: (petId: string) => void;
  onStatusChange?: (entryId: string, newStatus: QueueStatus) => void;
  onNoShow?: (entryId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

interface SectionData {
  title: string;
  status: QueueStatus;
  data: QueueEntryWithPet[];
}

function getNextStatus(current: QueueStatus): QueueStatus | null {
  if (current === QueueStatus.WAITING) return QueueStatus.IN_CONSULT;
  if (current === QueueStatus.IN_CONSULT) return QueueStatus.DONE;
  return null;
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

  const sections = useMemo<SectionData[]>(() => {
    const result: SectionData[] = [];
    if (data.inConsult.length > 0) {
      result.push({
        title: 'In Consult',
        status: QueueStatus.IN_CONSULT,
        data: data.inConsult,
      });
    }
    if (data.waiting.length > 0) {
      result.push({
        title: 'Waiting',
        status: QueueStatus.WAITING,
        data: data.waiting,
      });
    }
    if (data.done.length > 0) {
      result.push({
        title: 'Done',
        status: QueueStatus.DONE,
        data: showDoneSection ? data.done : [],
      });
    }
    return result;
  }, [data, showDoneSection]);

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
      const position =
        section.status === QueueStatus.WAITING ? index + 1 : undefined;
      const estimatedWait =
        section.status === QueueStatus.WAITING && position
          ? `${position * 10} min`
          : undefined;

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
      const count =
        section.status === QueueStatus.DONE
          ? data.done.length
          : section.data.length;

      return (
        <QueueSectionHeader
          title={section.title}
          count={count}
          status={section.status}
          collapsible={section.status === QueueStatus.DONE}
          collapsed={
            section.status === QueueStatus.DONE ? !showDoneSection : undefined
          }
          onToggleCollapse={
            section.status === QueueStatus.DONE
              ? toggleDoneSection
              : undefined
          }
        />
      );
    },
    [data.done.length, showDoneSection, toggleDoneSection],
  );

  const isEmpty =
    data.inConsult.length === 0 &&
    data.waiting.length === 0 &&
    data.done.length === 0;

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
