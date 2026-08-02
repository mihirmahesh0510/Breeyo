import { describe, it, expect } from 'vitest';
import {
  FILTER_CHIPS,
  filterNotifications,
  countUnread,
  type NotificationItemData,
  type NotificationFilterKey,
} from './NotificationList';

const mockNotifications: NotificationItemData[] = [
  { id: 'n1', module: 'queue', title: 'Patient checked in', message: 'Tiger checked in', timestamp: '2 min ago', read: false },
  { id: 'n2', module: 'inventory', title: 'Low stock', message: 'Amoxicillin low', timestamp: '15 min ago', read: false },
  { id: 'n3', module: 'billing', title: 'Overdue', message: 'Invoice overdue', timestamp: '1h ago', read: false },
  { id: 'n4', module: 'whatsapp', title: 'Message failed', message: 'Delivery failed', timestamp: '2h ago', read: true },
  { id: 'n5', module: 'queue', title: 'Queue update', message: 'Bella moved', timestamp: '5h ago', read: true },
];

describe('NotificationList', () => {
  describe('FILTER_CHIPS', () => {
    it('should have exactly 7 filter chip entries', () => {
      expect(FILTER_CHIPS).toHaveLength(7);
    });

    it('should have "all" as the first filter', () => {
      expect(FILTER_CHIPS[0]).toEqual({ key: 'all', label: 'All' });
    });

    it('should have "queue" as the second filter', () => {
      expect(FILTER_CHIPS[1]).toEqual({ key: 'queue', label: 'Queue' });
    });

    it('should have "inventory" as the third filter', () => {
      expect(FILTER_CHIPS[2]).toEqual({ key: 'inventory', label: 'Inventory' });
    });

    it('should have "billing" as the fourth filter', () => {
      expect(FILTER_CHIPS[3]).toEqual({ key: 'billing', label: 'Billing' });
    });

    it('should have "whatsapp" as the fifth filter', () => {
      expect(FILTER_CHIPS[4]).toEqual({ key: 'whatsapp', label: 'WhatsApp' });
    });

    it('should have "emr" as the sixth filter', () => {
      expect(FILTER_CHIPS[5]).toEqual({ key: 'emr', label: 'EMR' });
    });

    it('should have "scheduling" as the seventh filter', () => {
      expect(FILTER_CHIPS[6]).toEqual({ key: 'scheduling', label: 'Scheduling' });
    });
  });

  describe('filterNotifications', () => {
    it('should return all notifications when filter is "all"', () => {
      const result = filterNotifications(mockNotifications, 'all');
      expect(result).toHaveLength(5);
      expect(result).toEqual(mockNotifications);
    });

    it('should return only queue notifications when filter is "queue"', () => {
      const result = filterNotifications(mockNotifications, 'queue');
      expect(result).toHaveLength(2);
      expect(result.every((n) => n.module === 'queue')).toBe(true);
    });

    it('should return only billing notifications when filter is "billing"', () => {
      const result = filterNotifications(mockNotifications, 'billing');
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe('billing');
    });

    it('should return only inventory notifications when filter is "inventory"', () => {
      const result = filterNotifications(mockNotifications, 'inventory');
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe('inventory');
    });

    it('should return empty array when no notifications match filter', () => {
      const result = filterNotifications(mockNotifications, 'emr');
      expect(result).toHaveLength(0);
    });

    it('should return empty array when notifications list is empty', () => {
      const result = filterNotifications([], 'all');
      expect(result).toHaveLength(0);
    });
  });

  describe('countUnread', () => {
    it('should return correct count of unread notifications', () => {
      expect(countUnread(mockNotifications)).toBe(3);
    });

    it('should return 0 when all notifications are read', () => {
      const allRead = mockNotifications.map((n) => ({ ...n, read: true }));
      expect(countUnread(allRead)).toBe(0);
    });

    it('should return total count when all notifications are unread', () => {
      const allUnread = mockNotifications.map((n) => ({ ...n, read: false }));
      expect(countUnread(allUnread)).toBe(5);
    });

    it('should return 0 for empty array', () => {
      expect(countUnread([])).toBe(0);
    });
  });

  describe('NotificationList component export', () => {
    it('should export NotificationList as a function', async () => {
      const mod = await import('./NotificationList');
      expect(typeof mod.NotificationList).toBe('function');
    });
  });
});
