import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export type StatusVariant =
  | 'waiting'
  | 'inConsult'
  | 'done'
  | 'noShow'
  | 'paid'
  | 'unpaid'
  | 'overdue'
  | 'processing';

export interface StatusConfigEntry {
  defaultLabel: string;
  bgColor: string;
  textColor: string;
}

export const STATUS_CONFIG: Record<StatusVariant, StatusConfigEntry> = {
  waiting: {
    defaultLabel: 'Waiting',
    bgColor: 'tertiaryContainer',
    textColor: 'onTertiaryContainer',
  },
  inConsult: {
    defaultLabel: 'In Consult',
    bgColor: 'primaryContainer',
    textColor: 'onPrimaryContainer',
  },
  done: {
    defaultLabel: 'Done',
    bgColor: 'surfaceVariant',
    textColor: 'onSurfaceVariant',
  },
  noShow: {
    defaultLabel: 'No Show',
    bgColor: 'errorContainer',
    textColor: 'onErrorContainer',
  },
  paid: {
    defaultLabel: 'Paid',
    bgColor: 'primaryContainer',
    textColor: 'onPrimaryContainer',
  },
  unpaid: {
    defaultLabel: 'Unpaid',
    bgColor: 'secondaryContainer',
    textColor: 'onSecondaryContainer',
  },
  overdue: {
    defaultLabel: 'Overdue',
    bgColor: 'tertiaryContainer',
    textColor: 'onTertiaryContainer',
  },
  processing: {
    defaultLabel: 'Processing...',
    bgColor: 'surfaceVariant',
    textColor: 'onSurfaceVariant',
  },
};

export function getStatusLabel(
  status: StatusVariant,
  labelOverride?: string,
): string {
  return labelOverride ?? STATUS_CONFIG[status].defaultLabel;
}

// --- Component ---

export interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  testID?: string;
}

export function StatusBadge({ status, label, testID }: StatusBadgeProps) {
  const theme = useAppTheme();
  const config = STATUS_CONFIG[status];
  const displayLabel = getStatusLabel(status, label);
  const colors = theme.colors as Record<string, string>;
  // See BottomSheet.ts: useAppTheme() can resolve to Paper's bare theme on
  // some web render paths, where these Breeyo-specific tokens are undefined.
  const spacing = theme.spacing ?? { sm: 8, xxs: 2 };
  const borderRadius = theme.borderRadius ?? { full: 9999 };

  const styles = StyleSheet.create({
    badge: {
      backgroundColor: colors[config.bgColor] || config.bgColor,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      borderRadius: borderRadius.full,
      alignSelf: 'flex-start' as const,
    },
  });

  return React.createElement(
    View,
    {
      style: styles.badge,
      testID,
      accessibilityLabel: `Status: ${displayLabel}`,
      accessibilityRole: 'text',
    },
    React.createElement(
      Text,
      {
        variant: 'labelSmall',
        style: { color: colors[config.textColor] || config.textColor },
      },
      displayLabel,
    ),
  );
}
