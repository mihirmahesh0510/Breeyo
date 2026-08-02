import { describe, it, expect } from 'vitest';

describe('EmptyState', () => {
  describe('EmptyState component export', () => {
    it('should export EmptyState as a function', async () => {
      const mod = await import('./EmptyState');
      expect(typeof mod.EmptyState).toBe('function');
    });
  });
});
