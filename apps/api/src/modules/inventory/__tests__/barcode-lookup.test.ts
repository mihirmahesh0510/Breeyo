import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BarcodeLookupService } from '../barcode-lookup.service.js';
import type { InventoryItemRepository } from '../inventory-item.repository.js';
import { mockClinic, mockItem, mockBarcode } from './inventory.fixtures.js';

function createMockRepository(): {
  [K in keyof InventoryItemRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    getSummary: vi.fn(),
    listCategories: vi.fn(),
    listUnits: vi.fn(),
    addBarcode: vi.fn(),
    removeBarcode: vi.fn(),
    generatePhotoUploadUrl: vi.fn(),
    findByBarcode: vi.fn(),
    getBarcodeCatalog: vi.fn(),
  } as any;
}

describe('BarcodeLookupService', () => {
  let service: BarcodeLookupService;
  let repository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    repository = createMockRepository();
    service = new BarcodeLookupService(repository as any);
  });

  describe('lookup', () => {
    it('returns item for known barcode', async () => {
      repository.findByBarcode.mockResolvedValue({
        ...mockBarcode,
        item: mockItem,
      });

      const result = await service.lookup(mockClinic.id, mockBarcode.code);

      expect(result.found).toBe(true);
      expect(result.item).toEqual(mockItem);
      expect(repository.findByBarcode).toHaveBeenCalledWith(mockClinic.id, mockBarcode.code);
    });

    it('returns not found for unknown barcode', async () => {
      repository.findByBarcode.mockResolvedValue(null);

      const result = await service.lookup(mockClinic.id, '0000000000000');

      expect(result).toEqual({ found: false });
    });
  });

  describe('getCatalog', () => {
    it('returns barcode-to-item mapping', async () => {
      const catalog = {
        items: [
          {
            id: mockItem.id,
            name: mockItem.name,
            category: mockItem.category,
            unit: mockItem.unit,
            currentStock: mockItem.currentStock,
            barcodes: [{ code: mockBarcode.code, format: mockBarcode.format }],
          },
        ],
      };
      repository.getBarcodeCatalog.mockResolvedValue(catalog);

      const result = await service.getCatalog(mockClinic.id);

      expect(result).toEqual(catalog);
      expect(repository.getBarcodeCatalog).toHaveBeenCalledWith(mockClinic.id, undefined);
    });

    it('passes updatedSince through for incremental sync', async () => {
      repository.getBarcodeCatalog.mockResolvedValue({ items: [] });
      const since = new Date('2026-08-01');

      await service.getCatalog(mockClinic.id, since);

      expect(repository.getBarcodeCatalog).toHaveBeenCalledWith(mockClinic.id, since);
    });
  });
});
