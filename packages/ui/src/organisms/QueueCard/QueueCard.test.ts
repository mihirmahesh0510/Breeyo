import { describe, it, expect } from 'vitest';

describe('QueueCard', () => {
  describe('QUEUE_CARD_CONFIG', () => {
    it('should export QUEUE_CARD_CONFIG object', async () => {
      const { QUEUE_CARD_CONFIG } = await import('./QueueCard');
      expect(QUEUE_CARD_CONFIG).toBeDefined();
      expect(typeof QUEUE_CARD_CONFIG).toBe('object');
    });

    it('should have card height of 80', async () => {
      const { QUEUE_CARD_CONFIG } = await import('./QueueCard');
      expect(QUEUE_CARD_CONFIG.cardHeight).toBe(80);
    });
  });

  describe('QueueCard component export', () => {
    it('should export QueueCard as a function', async () => {
      const mod = await import('./QueueCard');
      expect(typeof mod.QueueCard).toBe('function');
    });
  });

  describe('generateAccessibilityLabel', () => {
    it('should produce correct format with all fields', async () => {
      const { generateAccessibilityLabel } = await import('./QueueCard');
      const label = generateAccessibilityLabel({
        position: 3,
        petName: 'Buddy',
        status: 'waiting',
        waitTime: '15 min',
      });
      expect(label).toBe('Position 3, Buddy, waiting, wait 15 min');
    });

    it('should handle position 1', async () => {
      const { generateAccessibilityLabel } = await import('./QueueCard');
      const label = generateAccessibilityLabel({
        position: 1,
        petName: 'Luna',
        status: 'inConsult',
        waitTime: '5 min',
      });
      expect(label).toBe('Position 1, Luna, inConsult, wait 5 min');
    });
  });
});
