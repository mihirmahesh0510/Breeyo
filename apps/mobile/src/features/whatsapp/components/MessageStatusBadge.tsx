import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { WaDeliveryStatus } from '@breeyo/types';
import { statusLabel, statusToVariant, WA_COLORS, type WaStatusVariant } from '../utils/whatsapp-format';

/**
 * WHA-05 / D-15 / UI-SPEC Accessibility Contract: "Status must never rely on
 * color alone; pair color with text and icon." `statusLabel` and
 * `statusToVariant` come from the tested `whatsapp-format.ts` module -- this
 * component only renders their output, it never decides the mapping itself.
 */
interface MessageStatusBadgeProps {
  status: WaDeliveryStatus;
  /** D-16: tints the badge orange to surface a delayed-delivery scenario. */
  delayed?: boolean;
}

const STATUS_ICON: Record<WaStatusVariant, keyof typeof MaterialCommunityIcons.glyphMap> = {
  queued: 'clock-outline',
  sent: 'check',
  delivered: 'check-all',
  failed: 'alert-circle-outline',
  replied: 'reply',
};

export function MessageStatusBadge({ status, delayed }: MessageStatusBadgeProps) {
  const variant = statusToVariant(status);
  const label = statusLabel(status);
  const color = delayed ? WA_COLORS.needsAction : WA_COLORS[variant];
  const iconName = STATUS_ICON[variant];

  return (
    <View style={styles.container} accessibilityLabel={label}>
      <MaterialCommunityIcons name={iconName} size={14} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
