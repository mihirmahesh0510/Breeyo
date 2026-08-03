import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

// --- Testable exports ---

export type SkeletonType = 'card' | 'listRow' | 'text' | 'avatar';

export const SKELETON_DIMENSIONS: Record<
  SkeletonType,
  { width: number | string; height: number; borderRadius: number }
> = {
  card: { width: '100%', height: 120, borderRadius: 12 },
  listRow: { width: '100%', height: 56, borderRadius: 8 },
  text: { width: '80%', height: 16, borderRadius: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
};

const baseStyle = {
  backgroundColor: colors.surfaceVariant,
  borderColor: colors.outlineVariant,
};

// --- Component ---

export interface SkeletonLoaderProps {
  type?: SkeletonType;
  count?: number;
  testID?: string;
}

export function SkeletonLoader({
  type = 'text',
  count = 1,
  testID,
}: SkeletonLoaderProps) {
  const dimensions = SKELETON_DIMENSIONS[type];

  const items = Array.from({ length: count }, (_, i) =>
    React.createElement(View, {
      key: i,
      style: StyleSheet.create({
        skeleton: {
          ...baseStyle,
          width: dimensions.width as any,
          height: dimensions.height,
          borderRadius: dimensions.borderRadius,
          marginBottom: i < count - 1 ? 8 : 0,
        },
      }).skeleton,
      accessibilityLabel: 'Loading content',
    }),
  );

  return React.createElement(
    View,
    { testID, accessibilityRole: 'progressbar', accessibilityLabel: 'Loading' },
    ...items,
  );
}
