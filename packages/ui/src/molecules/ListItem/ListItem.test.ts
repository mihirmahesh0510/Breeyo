import { describe, it, expect } from 'vitest';
import { LIST_ITEM_MIN_HEIGHT } from './ListItem';

describe('ListItem', () => {
  describe('LIST_ITEM_MIN_HEIGHT', () => {
    it('should have a minimum row height of 56', () => {
      expect(LIST_ITEM_MIN_HEIGHT).toBe(56);
    });
  });

  describe('ListItem component export', () => {
    it('should export ListItem as a function', async () => {
      const mod = await import('./ListItem');
      expect(typeof mod.ListItem).toBe('function');
    });
  });
});
