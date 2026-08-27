import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '@breeyo/ui';
import type { QueueStatus } from '@breeyo/types';

interface QueueSectionHeaderProps {
  title: string;
  count: number;
  status: QueueStatus;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const SECTION_COLORS: Record<string, string> = {
  IN_CONSULT: colors.tertiaryContainer,
  WAITING: colors.secondaryContainer,
  DONE: '#F5F0EB', // surfaceVariant
};

export function QueueSectionHeader({
  title,
  count,
  status,
  collapsible,
  collapsed,
  onToggleCollapse,
}: QueueSectionHeaderProps) {
  const bgColor = SECTION_COLORS[status] || '#F5F0EB';

  const content = (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      <Text variant="labelSmall" style={styles.count}>
        {collapsible
          ? collapsed
            ? `Show done (${count})`
            : `Hide done`
          : `(${count})`}
      </Text>
    </View>
  );

  if (collapsible && onToggleCollapse) {
    return (
      <Pressable onPress={onToggleCollapse} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  title: {
    fontWeight: '500',
  },
  count: {
    color: '#49454F',
  },
});
