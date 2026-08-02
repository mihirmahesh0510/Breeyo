import { describe, it, expect } from 'vitest';
import { TYPOGRAPHY_VARIANT_MAP } from './Typography';

describe('Typography', () => {
  describe('TYPOGRAPHY_VARIANT_MAP', () => {
    it('should have 7 variant entries', () => {
      expect(Object.keys(TYPOGRAPHY_VARIANT_MAP)).toHaveLength(7);
    });

    it('should contain all expected variant keys', () => {
      const expectedVariants = [
        'display',
        'heading1',
        'heading2',
        'subheading',
        'body',
        'caption',
        'overline',
      ];
      expect(Object.keys(TYPOGRAPHY_VARIANT_MAP).sort()).toEqual(
        expectedVariants.sort(),
      );
    });

    it('should map display variant to header accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.display.accessibilityRole).toBe('header');
    });

    it('should map heading1 variant to header accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.heading1.accessibilityRole).toBe('header');
    });

    it('should map heading2 variant to header accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.heading2.accessibilityRole).toBe('header');
    });

    it('should map subheading variant to text accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.subheading.accessibilityRole).toBe('text');
    });

    it('should map body variant to text accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.body.accessibilityRole).toBe('text');
    });

    it('should map caption variant to text accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.caption.accessibilityRole).toBe('text');
    });

    it('should map overline variant to text accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.overline.accessibilityRole).toBe('text');
    });

    it('should include fontConfig for each variant', () => {
      Object.values(TYPOGRAPHY_VARIANT_MAP).forEach((config) => {
        expect(config.fontConfig).toBeDefined();
        expect(config.fontConfig).toHaveProperty('fontSize');
        expect(config.fontConfig).toHaveProperty('lineHeight');
        expect(config.fontConfig).toHaveProperty('fontWeight');
      });
    });
  });

  describe('Typography component export', () => {
    it('should export Typography as a function', async () => {
      const mod = await import('./Typography');
      expect(typeof mod.Typography).toBe('function');
    });
  });
});
