import { MD3LightTheme } from 'react-native-paper';
import { colors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { elevation } from './elevation';
import { borderRadius } from './borderRadius';
import { duration as animationDurations } from './animation';

export const breeyoTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...colors,
  },
  fonts: {
    ...MD3LightTheme.fonts,
    displayMedium: {
      ...MD3LightTheme.fonts.displayMedium,
      fontSize: typography.display.fontSize,
      lineHeight: typography.display.lineHeight,
      fontWeight: typography.display.fontWeight,
    },
    headlineLarge: {
      ...MD3LightTheme.fonts.headlineLarge,
      fontSize: typography.heading1.fontSize,
      lineHeight: typography.heading1.lineHeight,
      fontWeight: typography.heading1.fontWeight,
    },
    headlineMedium: {
      ...MD3LightTheme.fonts.headlineMedium,
      fontSize: typography.heading2.fontSize,
      lineHeight: typography.heading2.lineHeight,
      fontWeight: typography.heading2.fontWeight,
    },
    titleMedium: {
      ...MD3LightTheme.fonts.titleMedium,
      fontSize: typography.subheading.fontSize,
      lineHeight: typography.subheading.lineHeight,
      fontWeight: typography.subheading.fontWeight,
      letterSpacing: typography.subheading.letterSpacing,
    },
    bodyLarge: {
      ...MD3LightTheme.fonts.bodyLarge,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
    },
    bodySmall: {
      ...MD3LightTheme.fonts.bodySmall,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      fontWeight: typography.caption.fontWeight,
      letterSpacing: typography.caption.letterSpacing,
    },
    labelSmall: {
      ...MD3LightTheme.fonts.labelSmall,
      fontSize: typography.overline.fontSize,
      lineHeight: typography.overline.lineHeight,
      fontWeight: typography.overline.fontWeight,
      letterSpacing: typography.overline.letterSpacing,
    },
  },
  spacing,
  customElevation: elevation,
  borderRadius,
  animation: { duration: animationDurations },
  customTypography: typography,
} as const;

export type AppTheme = typeof breeyoTheme;
