import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBadge } from '@breeyo/ui';
import { SPECIES_ICONS, QUEUE_STATUS_LABELS, type QueueStatus } from '@breeyo/types';
import type { QueueEntryWithPet } from '@breeyo/types';

interface QueueCardItemProps {
  entry: QueueEntryWithPet;
  position?: number;
  estimatedWait?: string;
  disabled?: boolean;
  onPress?: () => void;
  onStatusPress?: () => void;
  onLongPress?: () => void;
}

const STATUS_TO_VARIANT: Record<string, 'waiting' | 'inConsult' | 'done' | 'noShow' | 'expected'> = {
  EXPECTED: 'expected',
  WAITING: 'waiting',
  IN_CONSULT: 'inConsult',
  DONE: 'done',
  NO_SHOW: 'noShow',
};

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function QueueCardItem({
  entry,
  position,
  estimatedWait,
  disabled,
  onPress,
  onStatusPress,
  onLongPress,
}: QueueCardItemProps) {
  const speciesKey = (entry.pet.species || 'OTHER') as keyof typeof SPECIES_ICONS;
  const iconName = SPECIES_ICONS[speciesKey] || 'paw';
  const statusVariant = STATUS_TO_VARIANT[entry.status] || 'waiting';
  const isEmergency = entry.isEmergency;
  const isWaiting = entry.status === 'WAITING';

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.container,
        isEmergency && styles.emergencyBorder,
        disabled && styles.disabled,
      ]}
      accessibilityLabel={
        entry.status === 'EXPECTED'
          ? `${entry.pet.name}, ${entry.pet.owner.name}, ${QUEUE_STATUS_LABELS[entry.status as QueueStatus]}, expected at ${formatTime(entry.queuePriorityAt)}`
          : `${entry.pet.name}, ${entry.pet.owner.name}, ${QUEUE_STATUS_LABELS[entry.status as QueueStatus]}`
      }
      accessibilityRole="button"
    >
      {/* Species Icon */}
      <View style={styles.avatar}>
        <MaterialCommunityIcons
          name={iconName as any}
          size={28}
          color="#5D4037"
        />
      </View>

      {/* Center Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.petName}>
            {entry.pet.name}
          </Text>
          {isEmergency && (
            <MaterialCommunityIcons name="alert-circle" size={16} color="#BA1A1A" />
          )}
        </View>
        {entry.visitReason && (
          <Text variant="bodySmall" numberOfLines={1} style={styles.visitReason}>
            {entry.visitReason}
          </Text>
        )}
        <Text variant="bodySmall" numberOfLines={1} style={styles.ownerName}>
          {entry.pet.owner.name}
        </Text>
        {entry.status === 'EXPECTED' ? (
          <View style={styles.expectedRow}>
            <MaterialCommunityIcons name="clock-outline" size={16} color="#5D4037" />
            <Text variant="bodySmall" style={styles.timestamp}>
              Expected {formatTime(entry.queuePriorityAt)}
            </Text>
          </View>
        ) : (
          <Text variant="bodySmall" style={styles.timestamp}>
            Checked in {formatTime(entry.checkedInAt)}
          </Text>
        )}
      </View>

      {/* Right Side */}
      <View style={styles.trailing}>
        {entry.status === 'EXPECTED' ? null : (
          <>
            {isWaiting && position != null && (
              <Text variant="titleMedium" style={styles.position}>
                #{position}
              </Text>
            )}
            {isWaiting && estimatedWait && (
              <Text variant="bodySmall" style={styles.waitTime}>
                ~{estimatedWait}
              </Text>
            )}
          </>
        )}
        <Pressable
          onPress={disabled ? undefined : onStatusPress}
          onLongPress={disabled ? undefined : onLongPress}
          hitSlop={8}
        >
          <StatusBadge status={statusVariant} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 80,
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    gap: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  emergencyBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#BA1A1A',
  },
  disabled: {
    opacity: 0.5,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  petName: {
    fontWeight: '500',
  },
  visitReason: {
    color: '#49454F',
  },
  ownerName: {
    color: '#5D4037',
  },
  timestamp: {
    color: '#79747E',
  },
  expectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 4,
  },
  position: {
    color: '#E65100',
    fontWeight: '500',
  },
  waitTime: {
    color: '#E65100',
  },
});
