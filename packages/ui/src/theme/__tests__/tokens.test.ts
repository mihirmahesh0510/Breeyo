import { describe, it, expect } from 'vitest';
import { colors } from '../colors';
import { typography } from '../typography';
import { spacing } from '../spacing';
import { elevation } from '../elevation';
import { borderRadius } from '../borderRadius';
import { duration } from '../animation';

describe('Design Tokens', () => {
  describe('colors', () => {
    it('exports exactly 28 color keys', () => {
      expect(Object.keys(colors)).toHaveLength(28);
    });

    it('has correct primary color', () => {
      expect(colors.primary).toBe('#2E7D32');
    });

    it('has correct background color', () => {
      expect(colors.background).toBe('#FFFBF5');
    });

    it('has correct secondary color', () => {
      expect(colors.secondary).toBe('#5D4037');
    });

    it('has correct tertiary color', () => {
      expect(colors.tertiary).toBe('#E65100');
    });

    it('has correct error color', () => {
      expect(colors.error).toBe('#BA1A1A');
    });

    it('has correct success color', () => {
      expect(colors.success).toBe('#2E7D32');
    });

    it('has correct warning color', () => {
      expect(colors.warning).toBe('#E65100');
    });
  });

  describe('typography', () => {
    it('has exactly 7 typography levels', () => {
      expect(Object.keys(typography)).toHaveLength(7);
    });

    it('each level has fontSize, lineHeight, fontWeight', () => {
      for (const [, value] of Object.entries(typography)) {
        expect(value).toHaveProperty('fontSize');
        expect(value).toHaveProperty('lineHeight');
        expect(value).toHaveProperty('fontWeight');
      }
    });

    it('has correct display values', () => {
      expect(typography.display.fontSize).toBe(45);
      expect(typography.display.lineHeight).toBe(52);
      expect(typography.display.fontWeight).toBe('400');
    });

    it('has correct body values', () => {
      expect(typography.body.fontSize).toBe(16);
      expect(typography.body.lineHeight).toBe(24);
      expect(typography.body.fontWeight).toBe('400');
      expect(typography.body.letterSpacing).toBe(0.5);
    });

    it('has correct caption values', () => {
      expect(typography.caption.fontSize).toBe(12);
      expect(typography.caption.lineHeight).toBe(16);
    });
  });

  describe('spacing', () => {
    it('has exactly 10 spacing values', () => {
      expect(Object.keys(spacing)).toHaveLength(10);
    });

    it('has correct xxs value', () => {
      expect(spacing.xxs).toBe(2);
    });

    it('has correct md value', () => {
      expect(spacing.md).toBe(16);
    });

    it('has correct 5xl value', () => {
      expect(spacing['5xl']).toBe(64);
    });

    it('has values in ascending order', () => {
      const values = Object.values(spacing);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    });
  });

  describe('elevation', () => {
    it('has exactly 6 elevation levels', () => {
      expect(Object.keys(elevation)).toHaveLength(6);
    });

    it('has correct level0 value', () => {
      expect(elevation.level0).toBe(0);
    });

    it('has correct level3 value', () => {
      expect(elevation.level3).toBe(6);
    });

    it('has correct level5 value', () => {
      expect(elevation.level5).toBe(12);
    });
  });

  describe('borderRadius', () => {
    it('has exactly 6 border radius tokens', () => {
      expect(Object.keys(borderRadius)).toHaveLength(6);
    });

    it('has correct none value', () => {
      expect(borderRadius.none).toBe(0);
    });

    it('has correct lg value', () => {
      expect(borderRadius.lg).toBe(12);
    });

    it('has correct full value', () => {
      expect(borderRadius.full).toBe(28);
    });
  });

  describe('animation duration', () => {
    it('has exactly 7 duration entries', () => {
      expect(Object.keys(duration)).toHaveLength(7);
    });

    it('has correct microFeedback value', () => {
      expect(duration.microFeedback).toBe(100);
    });

    it('has correct screenTransition value', () => {
      expect(duration.screenTransition).toBe(250);
    });

    it('has correct skeletonShimmer value', () => {
      expect(duration.skeletonShimmer).toBe(1500);
    });
  });
});
