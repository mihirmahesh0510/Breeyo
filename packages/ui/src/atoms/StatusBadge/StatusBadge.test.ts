import { describe, it, expect } from 'vitest';
import {
  STATUS_CONFIG,
  type StatusVariant,
  getStatusLabel,
} from './StatusBadge';

describe('StatusBadge', () => {
  describe('STATUS_CONFIG', () => {
    const allStatuses: StatusVariant[] = [
      'waiting',
      'inConsult',
      'done',
      'noShow',
      'paid',
      'unpaid',
      'overdue',
      'processing',
      'expected',
      'checkedIn',
      'cancelled',
      'completed',
    ];

    it('should have exactly 12 status variants', () => {
      expect(Object.keys(STATUS_CONFIG)).toHaveLength(12);
    });

    it('should contain all expected status keys', () => {
      expect(Object.keys(STATUS_CONFIG).sort()).toEqual(
        [...allStatuses].sort(),
      );
    });

    it.each(allStatuses)(
      'status "%s" should have defaultLabel, bgColor, and textColor',
      (status) => {
        const config = STATUS_CONFIG[status];
        expect(config.defaultLabel).toBeTruthy();
        expect(typeof config.defaultLabel).toBe('string');
        expect(config.bgColor).toBeTruthy();
        expect(typeof config.bgColor).toBe('string');
        expect(config.textColor).toBeTruthy();
        expect(typeof config.textColor).toBe('string');
      },
    );

    it('should map waiting to tertiaryContainer/onTertiaryContainer', () => {
      expect(STATUS_CONFIG.waiting.bgColor).toBe('tertiaryContainer');
      expect(STATUS_CONFIG.waiting.textColor).toBe('onTertiaryContainer');
    });

    it('should map inConsult to primaryContainer/onPrimaryContainer', () => {
      expect(STATUS_CONFIG.inConsult.bgColor).toBe('primaryContainer');
      expect(STATUS_CONFIG.inConsult.textColor).toBe('onPrimaryContainer');
    });

    it('should map done to surfaceVariant/onSurfaceVariant', () => {
      expect(STATUS_CONFIG.done.bgColor).toBe('surfaceVariant');
      expect(STATUS_CONFIG.done.textColor).toBe('onSurfaceVariant');
    });

    it('should map noShow to errorContainer/onErrorContainer', () => {
      expect(STATUS_CONFIG.noShow.bgColor).toBe('errorContainer');
      expect(STATUS_CONFIG.noShow.textColor).toBe('onErrorContainer');
    });

    it('should map paid to primaryContainer/onPrimaryContainer', () => {
      expect(STATUS_CONFIG.paid.bgColor).toBe('primaryContainer');
      expect(STATUS_CONFIG.paid.textColor).toBe('onPrimaryContainer');
    });

    it('should map unpaid to secondaryContainer/onSecondaryContainer', () => {
      expect(STATUS_CONFIG.unpaid.bgColor).toBe('secondaryContainer');
      expect(STATUS_CONFIG.unpaid.textColor).toBe('onSecondaryContainer');
    });

    it('should map overdue to tertiaryContainer/onTertiaryContainer', () => {
      expect(STATUS_CONFIG.overdue.bgColor).toBe('tertiaryContainer');
      expect(STATUS_CONFIG.overdue.textColor).toBe('onTertiaryContainer');
    });

    it('should map processing to surfaceVariant/onSurfaceVariant', () => {
      expect(STATUS_CONFIG.processing.bgColor).toBe('surfaceVariant');
      expect(STATUS_CONFIG.processing.textColor).toBe('onSurfaceVariant');
    });

    it('should have correct default labels', () => {
      expect(STATUS_CONFIG.waiting.defaultLabel).toBe('Waiting');
      expect(STATUS_CONFIG.inConsult.defaultLabel).toBe('In Consult');
      expect(STATUS_CONFIG.done.defaultLabel).toBe('Done');
      expect(STATUS_CONFIG.noShow.defaultLabel).toBe('No Show');
      expect(STATUS_CONFIG.paid.defaultLabel).toBe('Paid');
      expect(STATUS_CONFIG.unpaid.defaultLabel).toBe('Unpaid');
      expect(STATUS_CONFIG.overdue.defaultLabel).toBe('Overdue');
      expect(STATUS_CONFIG.processing.defaultLabel).toBe('Processing...');
    });

    it('should have a config entry for every StatusVariant (D-08/D-13/D-20)', () => {
      const expectedVariants: StatusVariant[] = [...allStatuses];
      expect(Object.keys(STATUS_CONFIG).sort()).toEqual(
        [...expectedVariants].sort(),
      );
    });

    it('should map expected to the calm secondary container (D-08/D-13)', () => {
      expect(STATUS_CONFIG.expected.bgColor).toBe('secondaryContainer');
      expect(STATUS_CONFIG.expected.textColor).toBe('onSecondaryContainer');
      expect(STATUS_CONFIG.expected.defaultLabel).toBe('Expected');
    });

    it('should map checkedIn to the primary container pair (D-20)', () => {
      expect(STATUS_CONFIG.checkedIn.bgColor).toBe('primaryContainer');
      expect(STATUS_CONFIG.checkedIn.textColor).toBe('onPrimaryContainer');
      expect(STATUS_CONFIG.checkedIn.defaultLabel).toBe('Checked in');
    });

    it('should map cancelled and completed to the neutral surface pair', () => {
      expect(STATUS_CONFIG.cancelled.bgColor).toBe('surfaceVariant');
      expect(STATUS_CONFIG.cancelled.textColor).toBe('onSurfaceVariant');
      expect(STATUS_CONFIG.cancelled.defaultLabel).toBe('Cancelled');

      expect(STATUS_CONFIG.completed.bgColor).toBe('surfaceVariant');
      expect(STATUS_CONFIG.completed.textColor).toBe('onSurfaceVariant');
      expect(STATUS_CONFIG.completed.defaultLabel).toBe('Completed');
    });

    it('should never use a hex literal for bgColor or textColor', () => {
      for (const status of Object.keys(STATUS_CONFIG) as StatusVariant[]) {
        const config = STATUS_CONFIG[status];
        expect(config.bgColor).not.toMatch(/^#/);
        expect(config.textColor).not.toMatch(/^#/);
      }
    });
  });

  describe('getStatusLabel', () => {
    it('should return override label when provided', () => {
      expect(getStatusLabel('waiting', 'Custom')).toBe('Custom');
    });

    it('should return default label when no override', () => {
      expect(getStatusLabel('waiting')).toBe('Waiting');
    });

    it('should return default label when override is undefined', () => {
      expect(getStatusLabel('done', undefined)).toBe('Done');
    });
  });

  describe('StatusBadge component export', () => {
    it('should export StatusBadge as a function', async () => {
      const mod = await import('./StatusBadge');
      expect(typeof mod.StatusBadge).toBe('function');
    });
  });
});
