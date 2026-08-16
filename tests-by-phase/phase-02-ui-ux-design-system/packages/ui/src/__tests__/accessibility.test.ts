import { describe, it, expect } from 'vitest';
import { SIZE_MAP as BUTTON_SIZE_MAP } from '../atoms/Button/Button';
import { STATUS_CONFIG } from '../atoms/StatusBadge/StatusBadge';
import { TYPOGRAPHY_VARIANT_MAP } from '../atoms/Typography/Typography';
import { SIZE_MAP as AVATAR_SIZE_MAP } from '../atoms/Avatar/Avatar';

describe('Accessibility', () => {
  describe('Touch target sizes (WCAG 2.5.5 / D-28)', () => {
    it('Button medium size meets 44pt minimum tap target', () => {
      expect(BUTTON_SIZE_MAP.medium.minHeight).toBeGreaterThanOrEqual(44);
    });

    it('Button large size meets 44pt minimum tap target', () => {
      expect(BUTTON_SIZE_MAP.large.minHeight).toBeGreaterThanOrEqual(44);
    });
  });

  describe('Color independence (D-36)', () => {
    it('every StatusBadge status has a text label (not color-only)', () => {
      Object.entries(STATUS_CONFIG).forEach(([status, config]) => {
        expect(config.defaultLabel).toBeTruthy();
        expect(config.defaultLabel.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Typography heading roles', () => {
    it('display has header accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.display.accessibilityRole).toBe('header');
    });

    it('heading1 has header accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.heading1.accessibilityRole).toBe('header');
    });

    it('heading2 has header accessibilityRole', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.heading2.accessibilityRole).toBe('header');
    });

    it('body does NOT have header role', () => {
      expect(TYPOGRAPHY_VARIANT_MAP.body.accessibilityRole).not.toBe('header');
    });
  });

  describe('Avatar minimum sizes', () => {
    it('md avatar size should be at least 40pt', () => {
      expect(AVATAR_SIZE_MAP.md).toBeGreaterThanOrEqual(40);
    });

    it('lg avatar size should be at least 44pt', () => {
      expect(AVATAR_SIZE_MAP.lg).toBeGreaterThanOrEqual(44);
    });
  });
});
