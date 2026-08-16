import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { WhatsAppMessageView } from '@breeyo/types';
import {
  bubbleAccessibilityLabel,
  contextTypeLabel,
  failureCopy,
  formatMessageTime,
  WA_COLORS,
} from '../utils/whatsapp-format';
import { MessageStatusBadge } from './MessageStatusBadge';

/**
 * WHA-05 / D-04, D-15: a pure, props-driven thread bubble. No hooks that
 * fetch, no navigation, no direct API calls -- data fetching lands in 07-14.
 * Every decision (status label/color, timestamp, failure copy, context
 * label) is delegated to the tested `whatsapp-format.ts` module.
 */
interface MessageBubbleProps {
  message: WhatsAppMessageView;
  onRetry?: () => void;
  onCallOwner?: () => void;
  onMarkResolved?: () => void;
}

export function MessageBubble({ message, onRetry, onCallOwner, onMarkResolved }: MessageBubbleProps) {
  const isOutgoing = message.direction === 'OUTBOUND';
  // "system" variant (UI-SPEC Component Inventory): an automated outgoing
  // note that was neither staff-typed nor a template send -- e.g. a booking
  // state change note. Rendered centered/neutral rather than the staff green.
  const isSystem = isOutgoing && !message.sentByUserId && !message.templateKey;
  const isFailed = message.status === 'FAILED';
  const hasContext = message.contextType != null;
  const hasMedia = !!message.mediaFilename;
  const showActions = isFailed && (!!onRetry || !!onCallOwner || !!onMarkResolved);

  return (
    <View style={[styles.row, isOutgoing ? styles.rowOutgoing : styles.rowIncoming]}>
      <View
        style={[
          styles.bubble,
          isSystem ? styles.systemBubble : isOutgoing ? styles.outgoingBubble : styles.incomingBubble,
        ]}
        accessibilityLabel={bubbleAccessibilityLabel(message)}
      >
        {hasContext && (
          <View style={styles.contextChip}>
            <Text style={styles.contextChipText}>{contextTypeLabel(message.contextType)}</Text>
          </View>
        )}

        <Text style={styles.body}>{message.body}</Text>

        {/* D-18: Beta sends invoice links, not PDF attachments -- this row is
            for future media and must never imply an attachment when the
            field is null, so it is gated strictly on `hasMedia`. */}
        {hasMedia && (
          <View style={styles.attachmentRow}>
            <MaterialCommunityIcons name="paperclip" size={16} color="#5D4037" />
            <Text style={styles.attachmentName} numberOfLines={1}>
              {message.mediaFilename}
            </Text>
          </View>
        )}

        {isFailed && <Text style={styles.failureText}>{failureCopy(message.failureCode)}</Text>}

        <View style={styles.metaRow}>
          <Text style={styles.timestamp}>{formatMessageTime(message.createdAt)}</Text>
          {isOutgoing && <MessageStatusBadge status={message.status} />}
        </View>

        {showActions && (
          <View style={styles.actionsRow}>
            {onRetry && (
              <Pressable
                onPress={onRetry}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel="Retry"
                accessibilityState={{ disabled: false }}
                hitSlop={8}
              >
                <Text style={styles.actionRetry}>Retry</Text>
              </Pressable>
            )}
            {onCallOwner && (
              <Pressable
                onPress={onCallOwner}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel="Call Owner"
                accessibilityState={{ disabled: false }}
                hitSlop={8}
              >
                <Text style={styles.actionNeutral}>Call Owner</Text>
              </Pressable>
            )}
            {onMarkResolved && (
              <Pressable
                onPress={onMarkResolved}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel="Mark Resolved"
                accessibilityState={{ disabled: false }}
                hitSlop={8}
              >
                <Text style={styles.actionNeutral}>Mark Resolved</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  rowOutgoing: {
    justifyContent: 'flex-end',
  },
  rowIncoming: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  outgoingBubble: {
    backgroundColor: WA_COLORS.outgoingBubble,
    borderTopRightRadius: 4,
  },
  incomingBubble: {
    backgroundColor: WA_COLORS.incomingBubble,
    borderTopLeftRadius: 4,
  },
  systemBubble: {
    backgroundColor: WA_COLORS.background,
    borderWidth: 1,
    borderColor: '#D7CCC8',
    alignSelf: 'center',
  },
  contextChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  contextChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: '#5D4037',
  },
  // UI-SPEC Typography: message body is 16px/1.5 and never reduced below that.
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: '#1C1B1F',
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attachmentName: {
    fontSize: 12,
    lineHeight: 16,
    color: '#5D4037',
    flexShrink: 1,
  },
  failureText: {
    fontSize: 12,
    lineHeight: 16,
    color: WA_COLORS.failed,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
    lineHeight: 16,
    color: '#79747E',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  actionRetry: {
    color: WA_COLORS.delivered,
    fontSize: 12,
    fontWeight: '500',
  },
  actionNeutral: {
    color: '#5D4037',
    fontSize: 12,
    fontWeight: '500',
  },
});
