import { describe, it, expect } from 'vitest';
import {
  MODULE_ICON_MAP,
  MODULE_COLOR_MAP,
  type NotificationModule,
} from './NotificationItem';

describe('NotificationItem', () => {
  describe('MODULE_ICON_MAP', () => {
    it('should have exactly 7 module entries', () => {
      expect(Object.keys(MODULE_ICON_MAP)).toHaveLength(7);
    });

    it('should map queue to clipboard-list-outline', () => {
      expect(MODULE_ICON_MAP.queue).toBe('clipboard-list-outline');
    });

    it('should map inventory to package-variant-closed', () => {
      expect(MODULE_ICON_MAP.inventory).toBe('package-variant-closed');
    });

    it('should map billing to receipt', () => {
      expect(MODULE_ICON_MAP.billing).toBe('receipt');
    });

    it('should map whatsapp to whatsapp', () => {
      expect(MODULE_ICON_MAP.whatsapp).toBe('whatsapp');
    });

    it('should map emr to stethoscope', () => {
      expect(MODULE_ICON_MAP.emr).toBe('stethoscope');
    });

    it('should map scheduling to calendar-clock', () => {
      expect(MODULE_ICON_MAP.scheduling).toBe('calendar-clock');
    });

    it('should map system to cog-outline', () => {
      expect(MODULE_ICON_MAP.system).toBe('cog-outline');
    });
  });

  describe('MODULE_COLOR_MAP', () => {
    it('should map queue to primary', () => {
      expect(MODULE_COLOR_MAP.queue).toBe('primary');
    });

    it('should map inventory to secondary', () => {
      expect(MODULE_COLOR_MAP.inventory).toBe('secondary');
    });

    it('should map billing to secondary', () => {
      expect(MODULE_COLOR_MAP.billing).toBe('secondary');
    });

    it('should map whatsapp to primary', () => {
      expect(MODULE_COLOR_MAP.whatsapp).toBe('primary');
    });

    it('should map emr to primary', () => {
      expect(MODULE_COLOR_MAP.emr).toBe('primary');
    });

    it('should map scheduling to primary', () => {
      expect(MODULE_COLOR_MAP.scheduling).toBe('primary');
    });

    it('should map system to onSurfaceVariant', () => {
      expect(MODULE_COLOR_MAP.system).toBe('onSurfaceVariant');
    });
  });

  describe('NotificationItem component export', () => {
    it('should export NotificationItem as a function', async () => {
      const mod = await import('./NotificationItem');
      expect(typeof mod.NotificationItem).toBe('function');
    });
  });
});
