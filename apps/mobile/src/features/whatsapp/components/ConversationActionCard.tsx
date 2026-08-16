import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { WA_COLORS } from '../utils/whatsapp-format';

/** UI-SPEC Component Inventory: the six ConversationActionCard variants. */
export type ConversationActionVariant =
  | 'confirm_booking'
  | 'retry_invoice'
  | 'call_owner'
  | 'mark_resolved'
  | 'cancel_booking'
  | 'move_booking';

/**
 * WHA-05 / D-09: cancel and move are staff-only affordances surfaced here as
 * authenticated staff actions. This component never constructs an inbound
 * owner payload -- it only ever calls the `onPress`/`onSecondaryPress`
 * handlers it was given (T-07-06-01).
 */
interface ConversationActionCardProps {
  variant: ConversationActionVariant;
  title: string;
  body?: string;
  helperText?: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  onSecondaryPress?: () => void;
}

const SECONDARY_LABEL: Record<ConversationActionVariant, string | null> = {
  confirm_booking: null,
  retry_invoice: null,
  call_owner: null,
  mark_resolved: null,
  cancel_booking: 'Keep Booking',
  move_booking: null,
};

const CONFIRM_BOOKING_HELPER_TEXT = 'Check in manually when the owner arrives.';

export function ConversationActionCard({
  variant,
  title,
  body,
  helperText,
  disabled,
  loading,
  onPress,
  onSecondaryPress,
}: ConversationActionCardProps) {
  const isDisabled = !!disabled || !!loading;
  const isDestructive = variant === 'cancel_booking';
  const secondaryLabel = SECONDARY_LABEL[variant];
  // D-06: a confirmed Phase 7 booking never auto-enters the walk-in queue,
  // so this fixed helper text is component-owned, not caller-supplied.
  const resolvedHelperText = variant === 'confirm_booking' ? CONFIRM_BOOKING_HELPER_TEXT : helperText;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {!!body && <Text style={styles.body}>{body}</Text>}
      {!!resolvedHelperText && <Text style={styles.helperText}>{resolvedHelperText}</Text>}

      <View style={styles.actionsRow}>
        {!!secondaryLabel && !!onSecondaryPress && (
          <Pressable
            onPress={isDisabled ? undefined : onSecondaryPress}
            disabled={isDisabled}
            style={[styles.button, styles.secondaryButton]}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            accessibilityState={{ disabled: isDisabled }}
          >
            <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
          </Pressable>
        )}

        <Pressable
          onPress={isDisabled ? undefined : onPress}
          disabled={isDisabled}
          style={[styles.button, isDestructive ? styles.destructiveButton : styles.primaryButton]}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ disabled: isDisabled, busy: !!loading }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={isDestructive ? WA_COLORS.failed : '#FFFFFF'} />
          ) : (
            <Text style={[styles.buttonText, isDestructive ? styles.destructiveButtonText : styles.primaryButtonText]}>
              {title}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: WA_COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7CCC8',
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#49454F',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#5D4037',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: WA_COLORS.delivered,
  },
  destructiveButton: {
    backgroundColor: '#FFFBF5',
    borderWidth: 1,
    borderColor: WA_COLORS.failed,
  },
  secondaryButton: {
    backgroundColor: '#FFFBF5',
    borderWidth: 1,
    borderColor: '#D7CCC8',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  destructiveButtonText: {
    color: WA_COLORS.failed,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5D4037',
  },
});
