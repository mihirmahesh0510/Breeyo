import { describe, it, expect } from 'vitest';
import { SIZE_MAP, VARIANT_MAP, BUTTON_DEFAULTS } from './Button';

describe('Button', () => {
  describe('SIZE_MAP', () => {
    it('should have small, medium, and large entries', () => {
      expect(Object.keys(SIZE_MAP).sort()).toEqual(
        ['large', 'medium', 'small'].sort(),
      );
    });

    it('should have small minHeight of 36', () => {
      expect(SIZE_MAP.small.minHeight).toBe(36);
    });

    it('should have small paddingHorizontal of 12', () => {
      expect(SIZE_MAP.small.paddingHorizontal).toBe(12);
    });

    it('should have medium minHeight >= 44 (WCAG tap target)', () => {
      expect(SIZE_MAP.medium.minHeight).toBeGreaterThanOrEqual(44);
    });

    it('should have medium paddingHorizontal of 16', () => {
      expect(SIZE_MAP.medium.paddingHorizontal).toBe(16);
    });

    it('should have large minHeight of 52', () => {
      expect(SIZE_MAP.large.minHeight).toBe(52);
    });

    it('should have large paddingHorizontal of 24', () => {
      expect(SIZE_MAP.large.paddingHorizontal).toBe(24);
    });
  });

  describe('VARIANT_MAP', () => {
    it('should map filled to contained', () => {
      expect(VARIANT_MAP.filled).toBe('contained');
    });

    it('should map outlined to outlined', () => {
      expect(VARIANT_MAP.outlined).toBe('outlined');
    });

    it('should map text to text', () => {
      expect(VARIANT_MAP.text).toBe('text');
    });
  });

  describe('BUTTON_DEFAULTS', () => {
    it('should default variant to filled', () => {
      expect(BUTTON_DEFAULTS.variant).toBe('filled');
    });

    it('should default size to medium', () => {
      expect(BUTTON_DEFAULTS.size).toBe('medium');
    });
  });

  describe('Button component export', () => {
    it('should export Button as a function', async () => {
      const mod = await import('./Button');
      expect(typeof mod.Button).toBe('function');
    });
  });
});
