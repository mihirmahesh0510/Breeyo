import React from 'react';
import { Text as PaperText } from 'react-native-paper';
import { StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';

// --- Testable exports ---

export type TypographyVariant =
  | 'display'
  | 'heading1'
  | 'heading2'
  | 'subheading'
  | 'body'
  | 'caption'
  | 'overline';

interface VariantConfig {
  accessibilityRole: 'header' | 'text';
  fontConfig: {
    fontSize: number;
    lineHeight: number;
    fontWeight: string;
    letterSpacing?: number;
  };
  paperVariant:
    | 'displayMedium'
    | 'headlineLarge'
    | 'headlineMedium'
    | 'titleMedium'
    | 'bodyLarge'
    | 'bodySmall'
    | 'labelSmall';
}

export const TYPOGRAPHY_VARIANT_MAP: Record<TypographyVariant, VariantConfig> =
  {
    display: {
      accessibilityRole: 'header',
      fontConfig: typography.display,
      paperVariant: 'displayMedium',
    },
    heading1: {
      accessibilityRole: 'header',
      fontConfig: typography.heading1,
      paperVariant: 'headlineLarge',
    },
    heading2: {
      accessibilityRole: 'header',
      fontConfig: typography.heading2,
      paperVariant: 'headlineMedium',
    },
    subheading: {
      accessibilityRole: 'text',
      fontConfig: typography.subheading,
      paperVariant: 'titleMedium',
    },
    body: {
      accessibilityRole: 'text',
      fontConfig: typography.body,
      paperVariant: 'bodyLarge',
    },
    caption: {
      accessibilityRole: 'text',
      fontConfig: typography.caption,
      paperVariant: 'bodySmall',
    },
    overline: {
      accessibilityRole: 'text',
      fontConfig: typography.overline,
      paperVariant: 'labelSmall',
    },
  };

// --- Component ---

export interface TypographyProps {
  variant?: TypographyVariant;
  children: React.ReactNode;
  style?: any;
  testID?: string;
  numberOfLines?: number;
}

export function Typography({
  variant = 'body',
  children,
  style,
  testID,
  numberOfLines,
}: TypographyProps) {
  const config = TYPOGRAPHY_VARIANT_MAP[variant];

  return React.createElement(PaperText, {
    variant: config.paperVariant,
    style: StyleSheet.create({ text: { ...config.fontConfig, ...style } }).text,
    testID,
    numberOfLines,
    accessibilityRole: config.accessibilityRole,
    children,
  });
}
