import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export const QUEUE_CARD_CONFIG = {
  cardHeight: 80,
  borderRadius: 12, // borderRadius.lg
  variant: 'elevated' as const,
};

export interface AccessibilityLabelInput {
  position: number;
  petName: string;
  status: string;
  waitTime: string;
}

export function generateAccessibilityLabel(input: AccessibilityLabelInput): string {
  return `Position ${input.position}, ${input.petName}, ${input.status}, wait ${input.waitTime}`;
}

// --- Component ---

export type StatusVariant =
  | 'waiting'
  | 'inConsult'
  | 'done'
  | 'noShow'
  | 'paid'
  | 'unpaid'
  | 'overdue'
  | 'processing';

export interface QueuePatient {
  name: string;
  petName: string;
  species: string;
  avatarUrl?: string;
}

export interface QueueCardProps {
  patient: QueuePatient;
  status: StatusVariant;
  position: number;
  waitTime: string;
  onPress?: () => void;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  testID?: string;
}

export function QueueCard({
  patient,
  status,
  position,
  waitTime,
  onPress,
  testID,
}: QueueCardProps) {
  const theme = useAppTheme();
  const colors = theme.colors as Record<string, string>;
  // See BottomSheet.ts: useAppTheme() can resolve to Paper's bare theme on
  // some web render paths, where these Breeyo-specific tokens are undefined.
  const spacing = theme.spacing ?? { md: 16, sm: 8 };
  const borderRadius = theme.borderRadius ?? { lg: 12 };

  const a11yLabel = generateAccessibilityLabel({
    position,
    petName: patient.petName,
    status,
    waitTime,
  });

  const styles = StyleSheet.create({
    container: {
      height: QUEUE_CARD_CONFIG.cardHeight,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    position: {
      width: 28,
      alignItems: 'center' as const,
    },
    info: {
      flex: 1,
    },
    trailing: {
      alignItems: 'flex-end' as const,
    },
  });

  const content = React.createElement(
    View,
    {
      style: styles.container,
      testID,
      accessibilityLabel: a11yLabel,
      accessibilityRole: 'button',
    },
    React.createElement(
      View,
      { style: styles.position },
      React.createElement(
        Text,
        { variant: 'titleMedium' },
        String(position),
      ),
    ),
    React.createElement(
      View,
      { style: styles.info },
      React.createElement(
        Text,
        { variant: 'titleSmall', numberOfLines: 1 },
        patient.petName,
      ),
      React.createElement(
        Text,
        { variant: 'bodySmall', numberOfLines: 1 },
        `${patient.name} - ${patient.species}`,
      ),
    ),
    React.createElement(
      View,
      { style: styles.trailing },
      React.createElement(
        Text,
        { variant: 'labelSmall' },
        waitTime,
      ),
    ),
  );

  if (onPress) {
    return React.createElement(
      Pressable,
      { onPress },
      content,
    );
  }

  return content;
}
