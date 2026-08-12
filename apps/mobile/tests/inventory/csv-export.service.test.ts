import { describe, it, expect, vi } from 'vitest';

// The real expo-file-system/expo-sharing native modules can't load in
// vitest's node environment -- mocked so this file can still import
// csv-export.service.ts (which only calls them inside the I/O functions,
// not the pure row-mapping functions this test actually exercises).
vi.mock('expo-file-system', () => ({
  documentDirectory: '/mock-docs/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: vi.fn(),
}));
vi.mock('expo-sharing', () => ({
  shareAsync: vi.fn(),
  isAvailableAsync: vi.fn().mockResolvedValue(true),
}));

import {
  formatISTDateTime,
  formatDateStamp,
  mapMovementsToRows,
  mapWantListToRows,
  toBOMPrefixedCSV,
  buildStockHistoryFilename,
  buildWantListFilename,
} from '../../src/features/inventory/services/csv-export.service';
import type { StockMovement, WantListItem } from '@breeyo/types';

function mockMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'mv-1',
    clinicId: 'clinic-1',
    itemId: 'item-1',
    batchId: 'batch-1',
    type: 'received',
    quantity: 10,
    reason: null,
    runningTotal: 10,
    userId: 'user-1',
    userName: 'Dr. Rao',
    consultationId: null,
    invoiceId: null,
    ownerId: null,
    unitPrice: null,
    notes: null,
    createdAt: new Date('2026-08-12T10:30:00.000Z'),
    ...overrides,
  };
}

function mockWantListItem(overrides: Partial<WantListItem> = {}): WantListItem {
  return {
    id: 'item-1',
    name: 'Amoxicillin 250mg',
    category: 'medicine',
    unit: 'tablets',
    sellingPrice: 5,
    parLevel: 50,
    currentStock: 10,
    deficit: 40,
    ...overrides,
  };
}

describe('csv-export.service', () => {
  describe('formatDateStamp', () => {
    it('formats as yyyyMMdd', () => {
      expect(formatDateStamp(new Date(2026, 7, 12))).toBe('20260812'); // month is 0-indexed (Aug = 7)
    });

    it('pads single-digit months/days', () => {
      expect(formatDateStamp(new Date(2026, 0, 5))).toBe('20260105');
    });
  });

  describe('formatISTDateTime', () => {
    it('formats a Date as dd/MM/yyyy HH:mm', () => {
      const result = formatISTDateTime(new Date('2026-08-12T10:30:00.000Z'));
      expect(result).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
    });

    it('accepts an ISO date string', () => {
      const result = formatISTDateTime('2026-08-12T10:30:00.000Z');
      expect(result).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
    });

    it('returns "-" for an invalid date', () => {
      expect(formatISTDateTime('not-a-date')).toBe('-');
    });
  });

  describe('mapMovementsToRows (D-47 column shape)', () => {
    it('maps every required column', () => {
      const rows = mapMovementsToRows([mockMovement()]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        Type: 'received',
        Quantity: '+10',
        Batch: 'batch-1',
        Reason: '-',
        'Running Total': 10,
        User: 'Dr. Rao',
      });
      expect(rows[0].Date).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
    });

    it('formats negative quantities without a double sign', () => {
      const rows = mapMovementsToRows([mockMovement({ quantity: -5, type: 'dispensed' })]);
      expect(rows[0].Quantity).toBe('-5');
    });

    it('falls back to "-" for null batchId and reason', () => {
      const rows = mapMovementsToRows([mockMovement({ batchId: null, reason: null })]);
      expect(rows[0].Batch).toBe('-');
      expect(rows[0].Reason).toBe('-');
    });

    it('surfaces a real reason when present', () => {
      const rows = mapMovementsToRows([mockMovement({ reason: 'damage' })]);
      expect(rows[0].Reason).toBe('damage');
    });
  });

  describe('mapWantListToRows (D-47 column shape)', () => {
    it('maps every required column', () => {
      const rows = mapWantListToRows([mockWantListItem()]);
      expect(rows).toEqual([
        {
          'Item Name': 'Amoxicillin 250mg',
          Category: 'medicine',
          Unit: 'tablets',
          'Current Stock': 10,
          'Par Level': 50,
          Deficit: 40,
        },
      ]);
    });
  });

  describe('toBOMPrefixedCSV', () => {
    it('prepends the UTF-8 BOM character', () => {
      const csv = toBOMPrefixedCSV([{ a: 1 }]);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });

    it('produces valid CSV content after the BOM', () => {
      const csv = toBOMPrefixedCSV([{ Name: 'Test', Qty: 5 }]);
      expect(csv.slice(1)).toContain('Name');
      expect(csv.slice(1)).toContain('Test');
    });
  });

  describe('filename builders', () => {
    it('builds a stock-history filename with the item name and date stamp', () => {
      const name = buildStockHistoryFilename('Amoxicillin 250mg', new Date(2026, 7, 12));
      expect(name).toBe('Amoxicillin_250mg_stock_history_20260812.csv');
    });

    it('builds a want-list filename with the date stamp', () => {
      const name = buildWantListFilename(new Date(2026, 7, 12));
      expect(name).toBe('want_list_20260812.csv');
    });
  });
});
