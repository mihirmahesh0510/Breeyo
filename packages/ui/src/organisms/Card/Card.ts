import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export type CardVariant = 'elevated' | 'filled' | 'outlined';

export interface CardVariantConfig {
  elevation: number;
  background: string;
  borderWidth?: number;
  borderColor?: string;
}

export const CARD_VARIANTS: Record<CardVariant, CardVariantConfig> = {
  elevated: { elevation: 1, background: 'surface' },
  filled: { elevation: 0, background: 'surfaceVariant' },
  outlined: { elevation: 0, borderWidth: 1, borderColor: 'outline' },
};

// --- Sub-components ---

export interface CardHeaderProps {
  children: React.ReactNode;
  testID?: string;
}

function CardHeader({ children, testID }: CardHeaderProps) {
  return React.createElement(
    View,
    {
      style: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
      testID,
    },
    children,
  );
}

export interface CardBodyProps {
  children: React.ReactNode;
  testID?: string;
}

function CardBody({ children, testID }: CardBodyProps) {
  return React.createElement(
    View,
    {
      style: { paddingHorizontal: 16, paddingBottom: 16 },
      testID,
    },
    children,
  );
}

export interface CardActionsProps {
  children: React.ReactNode;
  testID?: string;
}

function CardActions({ children, testID }: CardActionsProps) {
  return React.createElement(
    View,
    {
      style: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
      },
      testID,
    },
    children,
  );
}

// --- Main component ---

export interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}

function CardComponent({
  variant = 'elevated',
  children,
  onPress,
  testID,
}: CardProps) {
  const theme = useAppTheme();
  const config = CARD_VARIANTS[variant];
  const colors = theme.colors as Record<string, string>;

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors[config.background] || config.background,
      borderRadius: theme.borderRadius.lg,
      overflow: 'hidden' as const,
      ...(config.borderWidth
        ? {
            borderWidth: config.borderWidth,
            borderColor: colors[config.borderColor ?? 'outline'] || config.borderColor,
          }
        : {}),
    },
  });

  const content = React.createElement(
    View,
    { style: styles.card, testID },
    children,
  );

  if (onPress) {
    return React.createElement(
      Pressable,
      {
        onPress,
        accessibilityRole: 'button',
      },
      content,
    );
  }

  return content;
}

// --- Compound component ---

export const Card = Object.assign(CardComponent, {
  Header: CardHeader,
  Body: CardBody,
  Actions: CardActions,
});
