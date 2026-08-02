import { describe, it, expect } from 'vitest';

describe('AccordionItem', () => {
  describe('AccordionItem component export', () => {
    it('should export AccordionItem as a function', async () => {
      const mod = await import('./AccordionItem');
      expect(typeof mod.AccordionItem).toBe('function');
    });
  });
});
