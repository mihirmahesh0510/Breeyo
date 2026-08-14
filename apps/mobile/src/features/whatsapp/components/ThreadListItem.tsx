import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { WhatsAppThreadSummary } from '@breeyo/types';
import { contextTypeLabel, formatThreadTimestamp, truncatePreview, WA_COLORS } from '../utils/whatsapp-format';

/**
 * WHA-05 / D-04, D-09: the inbox row. Copies the `QueueCardItem.tsx` Pressable
 * idiom (accessibilityRole="button", accessibilityLabel composed from data).
 * All formatting decisions come from the tested `whatsapp-format.ts` module.
 */
interface ThreadListItemProps {
  thread: WhatsAppThreadSummary;
  onPress: () => void;
}

export function ThreadListItem({ thread, onPress }: ThreadListItemProps) {
  const hasUnread = thread.unreadCount > 0;
  const isInvalidNumber = thread.numberStatus === 'INVALID';
  const contextLabel = contextTypeLabel(thread.lastContextType);
  const preview = truncatePreview(thread.lastMessagePreview);
  const timestamp = thread.lastMessageAt ? formatThreadTimestamp(thread.lastMessageAt) : '';

  const accessibilityLabel = [
    thread.ownerName,
    thread.waPhone,
    contextLabel || null,
    preview,
    thread.needsAction ? 'Needs action' : null,
    isInvalidNumber ? 'Invalid number' : null,
    hasUnread ? `${thread.unreadCount} unread` : null,
  ]
    .filter((part): part is string => !!part)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.leading}>{hasUnread && <View style={styles.unreadDot} />}</View>

      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.ownerName} numberOfLines={1}>
            {thread.ownerName}
          </Text>
          {!!timestamp && <Text style={styles.timestamp}>{timestamp}</Text>}
        </View>

        <Text style={styles.mobile} numberOfLines={1}>
          {thread.waPhone}
        </Text>

        <View style={styles.previewRow}>
          {!!contextLabel && <Text style={styles.contextLabel}>{contextLabel} · </Text>}
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        </View>

        {(thread.needsAction || isInvalidNumber) && (
          <View style={styles.badgeRow}>
            {thread.needsAction && (
              <View style={styles.needsActionPill}>
                <Text style={styles.needsActionText}>Needs action</Text>
              </View>
            )}
            {isInvalidNumber && (
              <View style={styles.invalidRow}>
                <MaterialCommunityIcons name="alert-circle" size={14} color={WA_COLORS.failed} />
                <Text style={styles.invalidText}>Invalid number</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    backgroundColor: WA_COLORS.background,
  },
  leading: {
    width: 12,
    alignItems: 'center',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WA_COLORS.needsAction,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  ownerName: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: '#1C1B1F',
    flexShrink: 1,
  },
  timestamp: {
    fontSize: 12,
    lineHeight: 16,
    color: '#79747E',
  },
  mobile: {
    fontSize: 12,
    lineHeight: 16,
    color: '#5D4037',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contextLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: '#5D4037',
  },
  preview: {
    fontSize: 12,
    lineHeight: 16,
    color: '#49454F',
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  needsActionPill: {
    backgroundColor: 'rgba(230, 81, 0, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  needsActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: WA_COLORS.needsAction,
  },
  invalidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  invalidText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: WA_COLORS.failed,
  },
});
