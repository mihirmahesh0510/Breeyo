import { describe, it, expect } from 'vitest';

describe('Card', () => {
  describe('CARD_VARIANTS config', () => {
    it('should have exactly 3 variant entries', async () => {
      const { CARD_VARIANTS } = await import('./Card');
      expect(Object.keys(CARD_VARIANTS)).toHaveLength(3);
    });

    it('should contain elevated, filled, and outlined keys', async () => {
      const { CARD_VARIANTS } = await import('./Card');
      expect(Object.keys(CARD_VARIANTS).sort()).toEqual(
        ['elevated', 'filled', 'outlined'].sort(),
      );
    });

    it('elevated variant should have elevation 1 and background surface', async () => {
      const { CARD_VARIANTS } = await import('./Card');
      expect(CARD_VARIANTS.elevated.elevation).toBe(1);
      expect(CARD_VARIANTS.elevated.background).toBe('surface');
    });

    it('filled variant should have elevation 0 and background surfaceVariant', async () => {
      const { CARD_VARIANTS } = await import('./Card');
      expect(CARD_VARIANTS.filled.elevation).toBe(0);
      expect(CARD_VARIANTS.filled.background).toBe('surfaceVariant');
    });

    it('outlined variant should have elevation 0, borderWidth 1, borderColor outline', async () => {
      const { CARD_VARIANTS } = await import('./Card');
      expect(CARD_VARIANTS.outlined.elevation).toBe(0);
      expect(CARD_VARIANTS.outlined.borderWidth).toBe(1);
      expect(CARD_VARIANTS.outlined.borderColor).toBe('outline');
    });
  });

  describe('Card component export', () => {
    it('should export Card as a function', async () => {
      const mod = await import('./Card');
      expect(typeof mod.Card).toBe('function');
    });

    it('should have Card.Header as a sub-component', async () => {
      const { Card } = await import('./Card');
      expect(typeof Card.Header).toBe('function');
    });

    it('should have Card.Body as a sub-component', async () => {
      const { Card } = await import('./Card');
      expect(typeof Card.Body).toBe('function');
    });

    it('should have Card.Actions as a sub-component', async () => {
      const { Card } = await import('./Card');
      expect(typeof Card.Actions).toBe('function');
    });
  });
});
