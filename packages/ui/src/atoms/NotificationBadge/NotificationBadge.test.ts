import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_BADGE_CONFIG,
  formatBadgeCount,
  getAccessibilityLabel,
} from './NotificationBadge';

describe('NotificationBadge', () => {
  describe('NOTIFICATION_BADGE_CONFIG', () => {
    it('should use tertiary as badge color', () => {
      expect(NOTIFICATION_BADGE_CONFIG.badgeColor).toBe('tertiary');
    });

    it('should have minTouchTarget of 44', () => {
      expect(NOTIFICATION_BADGE_CONFIG.minTouchTarget).toBe(44);
    });

    it('should use bell-outline icon', () => {
      expect(NOTIFICATION_BADGE_CONFIG.iconName).toBe('bell-outline');
    });

    it('should use onTertiary as badge text color', () => {
      expect(NOTIFICATION_BADGE_CONFIG.badgeTextColor).toBe('onTertiary');
    });

    it('should have small badge size with minWidth 18, height 18, borderRadius 9', () => {
      expect(NOTIFICATION_BADGE_CONFIG.badgeSizes.small).toEqual({
        minWidth: 18,
        height: 18,
        borderRadius: 9,
      });
    });

    it('should have medium badge size with minWidth 22', () => {
      expect(NOTIFICATION_BADGE_CONFIG.badgeSizes.medium.minWidth).toBe(22);
    });

    it('should have large badge size with minWidth 26', () => {
      expect(NOTIFICATION_BADGE_CONFIG.badgeSizes.large.minWidth).toBe(26);
    });
  });

  describe('formatBadgeCount', () => {
    it('should return null display for count 0', () => {
      expect(formatBadgeCount(0)).toEqual({ display: null, size: 'small' });
    });

    it('should return string display for count 3', () => {
      expect(formatBadgeCount(3)).toEqual({ display: '3', size: 'small' });
    });

    it('should return medium size for count 15', () => {
      expect(formatBadgeCount(15)).toEqual({ display: '15', size: 'medium' });
    });

    it('should return 99+ for count 150', () => {
      expect(formatBadgeCount(150)).toEqual({ display: '99+', size: 'large' });
    });

    it('should return null display for negative count', () => {
      expect(formatBadgeCount(-5)).toEqual({ display: null, size: 'small' });
    });

    it('should return small size for count 9 (boundary)', () => {
      expect(formatBadgeCount(9)).toEqual({ display: '9', size: 'small' });
    });

    it('should return medium size for count 10 (boundary)', () => {
      expect(formatBadgeCount(10)).toEqual({ display: '10', size: 'medium' });
    });

    it('should return medium size for count 99 (boundary)', () => {
      expect(formatBadgeCount(99)).toEqual({ display: '99', size: 'medium' });
    });

    it('should return large size for count 100 (boundary)', () => {
      expect(formatBadgeCount(100)).toEqual({ display: '99+', size: 'large' });
    });
  });

  describe('getAccessibilityLabel', () => {
    it('should return no unread message for count 0', () => {
      expect(getAccessibilityLabel(0)).toBe('Notifications, no unread');
    });

    it('should return singular form for count 1', () => {
      expect(getAccessibilityLabel(1)).toBe('1 unread notification');
    });

    it('should return plural form for count 5', () => {
      expect(getAccessibilityLabel(5)).toBe('5 unread notifications');
    });

    it('should return no unread message for negative count', () => {
      expect(getAccessibilityLabel(-1)).toBe('Notifications, no unread');
    });
  });

  describe('NotificationBadge component export', () => {
    it('should export NotificationBadge as a function', async () => {
      const mod = await import('./NotificationBadge');
      expect(typeof mod.NotificationBadge).toBe('function');
    });
  });
});
