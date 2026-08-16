import { describe, it, expect, vi } from 'vitest';

// `useBarcodeScan.ts` transitively imports several native-module-touching
// files (expo-haptics, expo-sqlite via offline-barcode-cache.ts,
// expo-secure-store via AuthProvider/useOfflineSync, react-native's
// AppState via useOfflineSync). None of these are actually exercised by
// the pure mapping logic under test (`toOnlineItemView`/`toOfflineItemView`/
// `computeNearestExpiry`, exported via `__testables`), but importing the
// module at all requires every native dependency in its import graph to be
// mockable in this vitest "node" environment -- same reasoning and mocking
// convention as tests/inventory/useItemPhotoUpload.test.ts and
// tests/inventory/offline-queue.service.test.ts.
vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
vi.mock('expo-sqlite', () => ({
  openDatabaseSync: vi.fn(() => {
    throw new Error('openDatabaseSync should never be called in this pure-logic test');
  }),
}));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock('../../src/lib/api', () => ({
  apiClient: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import { __testables } from '../../src/features/inventory/hooks/useBarcodeScan';
import type { InventoryItemDetail } from '../../src/features/inventory/hooks/useInventoryApi';
import type { CachedBarcodeItem } from '../../src/features/inventory/services/offline-barcode-cache';

const { toOnlineItemView, toOfflineItemView, computeNearestExpiry } = __testables;

function makeOnlineItem(overrides: Partial<InventoryItemDetail> = {}): InventoryItemDetail {
  return {
    id: 'item-1',
    clinicId: 'clinic-1',
    name: 'Amoxicillin 250mg',
    category: 'medicine',
    unit: 'tablets',
    sellingPrice: 12.5,
    parLevel: 50,
    scheduleH: false,
    notes: null,
    photoUrl: null,
    isActive: true,
    currentStock: 30,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    barcodes: [],
    batches: [],
    ...overrides,
  } as InventoryItemDetail;
}

function makeCachedItem(overrides: Partial<CachedBarcodeItem['itemData']> = {}): CachedBarcodeItem {
  return {
    code: '8901030826829',
    format: 'ean13',
    itemId: 'item-2',
    itemName: 'Amoxicillin 250mg',
    syncedAt: Date.now(),
    itemData: {
      id: 'item-2',
      name: 'Amoxicillin 250mg',
      category: 'medicine',
      unit: 'tablets',
      currentStock: 12,
      barcodes: [{ code: '8901030826829', format: 'ean13' }],
      ...overrides,
    },
  };
}

describe('useBarcodeScan pure mapping logic', () => {
  describe('toOnlineItemView', () => {
    it('maps an online InventoryItemDetail into a ScanResultItemView', () => {
      const item = makeOnlineItem();
      const view = toOnlineItemView('8901030826829', item);

      expect(view).toEqual({
        code: '8901030826829',
        itemId: 'item-1',
        itemName: 'Amoxicillin 250mg',
        category: 'medicine',
        unit: 'tablets',
        currentStock: 30,
        parLevel: 50,
        batchCount: 0,
        nearestExpiry: null,
        source: 'online',
      });
    });

    it('computes batchCount and nearestExpiry from the item batches', () => {
      const item = makeOnlineItem({
        batches: [
          { id: 'b1', itemId: 'item-1', clinicId: 'clinic-1', lotNumber: 'L1', expiryDate: new Date('2026-12-01'), purchasePrice: null, supplier: null, initialQty: 10, currentQty: 10, receivedAt: new Date('2026-06-01'), isExpired: false },
          { id: 'b2', itemId: 'item-1', clinicId: 'clinic-1', lotNumber: 'L2', expiryDate: new Date('2026-08-01'), purchasePrice: null, supplier: null, initialQty: 20, currentQty: 20, receivedAt: new Date('2026-05-01'), isExpired: false },
        ],
      });
      const view = toOnlineItemView('123', item);

      expect(view.batchCount).toBe(2);
      // Earliest expiry among the two batches, not the first batch by receivedAt.
      expect(view.nearestExpiry).toBe(new Date('2026-08-01').toISOString());
    });
  });

  describe('toOfflineItemView', () => {
    it('maps a cached offline item into a ScanResultItemView with reduced fields', () => {
      const cached = makeCachedItem();
      const view = toOfflineItemView('8901030826829', cached);

      expect(view).toEqual({
        code: '8901030826829',
        itemId: 'item-2',
        itemName: 'Amoxicillin 250mg',
        category: 'medicine',
        unit: 'tablets',
        currentStock: 12,
        parLevel: null,
        batchCount: null,
        nearestExpiry: null,
        source: 'offline',
      });
    });
  });

  describe('computeNearestExpiry', () => {
    it('returns null for an empty or undefined batch list', () => {
      expect(computeNearestExpiry(undefined)).toBeNull();
      expect(computeNearestExpiry([])).toBeNull();
    });

    it('returns null when no batch has an expiry date', () => {
      const batches = [
        { id: 'b1', itemId: 'i', clinicId: 'c', lotNumber: null, expiryDate: null, purchasePrice: null, supplier: null, initialQty: 1, currentQty: 1, receivedAt: new Date(), isExpired: false },
      ];
      expect(computeNearestExpiry(batches as any)).toBeNull();
    });

    it('picks the earliest expiry date among several batches', () => {
      const batches = [
        { id: 'b1', itemId: 'i', clinicId: 'c', lotNumber: null, expiryDate: new Date('2027-01-01'), purchasePrice: null, supplier: null, initialQty: 1, currentQty: 1, receivedAt: new Date(), isExpired: false },
        { id: 'b2', itemId: 'i', clinicId: 'c', lotNumber: null, expiryDate: new Date('2026-09-15'), purchasePrice: null, supplier: null, initialQty: 1, currentQty: 1, receivedAt: new Date(), isExpired: false },
        { id: 'b3', itemId: 'i', clinicId: 'c', lotNumber: null, expiryDate: null, purchasePrice: null, supplier: null, initialQty: 1, currentQty: 1, receivedAt: new Date(), isExpired: false },
      ];
      expect(computeNearestExpiry(batches as any)).toBe(new Date('2026-09-15').toISOString());
    });
  });
});
