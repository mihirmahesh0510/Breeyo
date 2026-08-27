import { describe, it, expect } from 'vitest';
import { breeyoTheme } from '../theme';
import { useAppTheme } from '../types';

describe('breeyoTheme', () => {
  it('extends MD3LightTheme with dark: false', () => {
    expect(breeyoTheme.dark).toBe(false);
  });

  it('extends MD3LightTheme with roundness', () => {
    expect(breeyoTheme).toHaveProperty('roundness');
  });

  it('overrides colors.primary with Breeyo navy', () => {
    expect(breeyoTheme.colors.primary).toBe('#1E2A6E');
  });

  it('preserves MD3LightTheme colors not overridden', () => {
    expect(breeyoTheme.colors.backdrop).toBe('rgba(50, 47, 55, 0.4)');
  });

  it('has spacing.md equal to 16', () => {
    expect(breeyoTheme.spacing.md).toBe(16);
  });

  it('has borderRadius.lg equal to 12', () => {
    expect(breeyoTheme.borderRadius.lg).toBe(12);
  });

  it('has all 7 customTypography levels', () => {
    const levels = Object.keys(breeyoTheme.customTypography);
    expect(levels).toHaveLength(7);
    expect(levels).toContain('display');
    expect(levels).toContain('heading1');
    expect(levels).toContain('heading2');
    expect(levels).toContain('subheading');
    expect(levels).toContain('body');
    expect(levels).toContain('caption');
    expect(levels).toContain('overline');
  });

  it('has customElevation.level3 equal to 6', () => {
    expect(breeyoTheme.customElevation.level3).toBe(6);
  });

  it('has animation.duration.microFeedback equal to 100', () => {
    expect(breeyoTheme.animation.duration.microFeedback).toBe(100);
  });

  it('maps display typography to fonts.displayMedium', () => {
    expect(breeyoTheme.fonts.displayMedium.fontSize).toBe(45);
    expect(breeyoTheme.fonts.displayMedium.lineHeight).toBe(52);
  });

  it('maps heading1 typography to fonts.headlineLarge', () => {
    expect(breeyoTheme.fonts.headlineLarge.fontSize).toBe(32);
    expect(breeyoTheme.fonts.headlineLarge.lineHeight).toBe(40);
  });

  it('maps heading2 typography to fonts.headlineMedium', () => {
    expect(breeyoTheme.fonts.headlineMedium.fontSize).toBe(28);
    expect(breeyoTheme.fonts.headlineMedium.lineHeight).toBe(36);
  });

  it('maps body typography to fonts.bodyLarge', () => {
    expect(breeyoTheme.fonts.bodyLarge.fontSize).toBe(16);
    expect(breeyoTheme.fonts.bodyLarge.letterSpacing).toBe(0.5);
  });

  it('maps caption typography to fonts.bodySmall', () => {
    expect(breeyoTheme.fonts.bodySmall.fontSize).toBe(12);
    expect(breeyoTheme.fonts.bodySmall.letterSpacing).toBe(0.4);
  });
});

describe('useAppTheme', () => {
  it('is a function', () => {
    expect(typeof useAppTheme).toBe('function');
  });
});
