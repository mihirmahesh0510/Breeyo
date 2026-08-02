import { describe, it, expect } from 'vitest';
import { TEXT_INPUT_DEFAULTS } from './TextInput';

describe('TextInput', () => {
  describe('TEXT_INPUT_DEFAULTS', () => {
    it('should default mode to outlined', () => {
      expect(TEXT_INPUT_DEFAULTS.mode).toBe('outlined');
    });
  });

  describe('TextInput component export', () => {
    it('should export BreeyoTextInput as a function', async () => {
      const mod = await import('./TextInput');
      expect(typeof mod.BreeyoTextInput).toBe('function');
    });
  });
});
