import React from 'react';
import { Avatar as PaperAvatar } from 'react-native-paper';

// --- Testable exports ---

export type AvatarType = 'image' | 'initials' | 'icon';
export type AvatarSize = 'sm' | 'md' | 'lg';

export const SIZE_MAP: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
};

// --- Component ---

export interface AvatarProps {
  type: AvatarType;
  source?: any;
  label?: string;
  size?: AvatarSize;
  testID?: string;
}

export function Avatar({
  type,
  source,
  label,
  size = 'md',
  testID,
}: AvatarProps) {
  const pixelSize = SIZE_MAP[size];

  switch (type) {
    case 'image':
      return React.createElement(PaperAvatar.Image, {
        size: pixelSize,
        source: source ?? { uri: '' },
        testID,
        accessibilityLabel: label ?? 'Avatar',
      });

    case 'initials':
      return React.createElement(PaperAvatar.Text, {
        size: pixelSize,
        label: label ?? '',
        testID,
        accessibilityLabel: label ?? 'Avatar',
      });

    case 'icon':
      return React.createElement(PaperAvatar.Icon, {
        size: pixelSize,
        icon: source ?? 'account',
        testID,
        accessibilityLabel: label ?? 'Avatar',
      });

    default:
      return null;
  }
}
