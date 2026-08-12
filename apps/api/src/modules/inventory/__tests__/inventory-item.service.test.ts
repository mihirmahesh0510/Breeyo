import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryItemService } from '../inventory-item.service.js';
import type { InventoryItemRepository } from '../inventory-item.repository.js';
import {
  mockClinic,
  mockUser,
  mockItem,
  mockItemVaccine,
  mockBatch1,
  mockBarcode,
  mockClinicCategory,
  mockClinicUnit,
} from './inventory.fixtures.js';
import { INVENTORY_CATEGORIES } from '@breeyo/types';
import { INVENTORY_UNITS } from '@breeyo/types';

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

describe('InventoryItemService', () => {
  let service: InventoryItemService;
  let repository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    repository = createMockRepository();
    service = new InventoryItemService(repository as any);
  });

  describe('createItem', () => {
    it('creates item with valid input (happy path)', async () => {
      repository.create.mockResolvedValue(mockItem);

      const result = await service.createItem(mockClinic.id, mockUser.id, {
        name: mockItem.name,
        category: mockItem.category,
        unit: mockItem.unit,
        sellingPrice: mockItem.sellingPrice,
      });

      expect(result).toEqual(mockItem);
      expect(repository.create).toHaveBeenCalledWith(
        mockClinic.id,
        expect.objectContaining({ name: mockItem.name, category: mockItem.category }),
      );
    });

    it('rejects missing name', async () => {
      await expect(
        service.createItem(mockClinic.id, mockUser.id, {
          category: 'medicine',
          unit: 'tablets',
          sellingPrice: 10,
        } as any),
      ).rejects.toThrow();

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('creates item with barcodes', async () => {
      repository.create.mockResolvedValue({ ...mockItem, barcodes: [mockBarcode] });

      const result = await service.createItem(mockClinic.id, mockUser.id, {
        name: mockItem.name,
        category: mockItem.category,
        unit: mockItem.unit,
        sellingPrice: mockItem.sellingPrice,
        barcodes: [{ code: mockBarcode.code, format: mockBarcode.format }],
      });

      expect(result.barcodes).toEqual([mockBarcode]);
      expect(repository.create).toHaveBeenCalledWith(
        mockClinic.id,
        expect.objectContaining({
          barcodes: [{ code: mockBarcode.code, format: mockBarcode.format }],
        }),
      );
    });

    it('passes a new custom category through to the repository for upsert (D-61)', async () => {
      repository.create.mockResolvedValue({ ...mockItem, category: 'dewormer' });

      await service.createItem(mockClinic.id, mockUser.id, {
        name: 'Fenbendazole',
        category: 'dewormer',
        unit: mockItem.unit,
        sellingPrice: 20,
      });

      expect(repository.create).toHaveBeenCalledWith(
        mockClinic.id,
        expect.objectContaining({ category: 'dewormer' }),
      );
    });

    it('passes a predefined category through unchanged', async () => {
      repository.create.mockResolvedValue(mockItem);

      await service.createItem(mockClinic.id, mockUser.id, {
        name: mockItem.name,
        category: 'medicine',
        unit: mockItem.unit,
        sellingPrice: mockItem.sellingPrice,
      });

      expect(repository.create).toHaveBeenCalledWith(
        mockClinic.id,
        expect.objectContaining({ category: 'medicine' }),
      );
    });
  });

  describe('updateItem', () => {
    it('performs partial update', async () => {
      repository.update.mockResolvedValue({ ...mockItem, sellingPrice: 7.5 });

      const result = await service.updateItem(mockClinic.id, mockItem.id, { sellingPrice: 7.5 });

      expect(result.sellingPrice).toBe(7.5);
      expect(repository.update).toHaveBeenCalledWith(
        mockClinic.id,
        mockItem.id,
        expect.objectContaining({ sellingPrice: 7.5 }),
      );
    });

    it('throws 404 when item does not belong to clinic', async () => {
      repository.update.mockResolvedValue(null);

      await expect(
        service.updateItem(mockClinic.id, 'unknown-item', { sellingPrice: 7.5 }),
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', statusCode: 404 });
    });
  });

  describe('getItem', () => {
    it('returns item with batches and barcodes', async () => {
      repository.findById.mockResolvedValue({
        ...mockItem,
        barcodes: [mockBarcode],
        batches: [mockBatch1],
      });

      const result = await service.getItem(mockClinic.id, mockItem.id);

      expect(result.barcodes).toEqual([mockBarcode]);
      expect(result.batches).toEqual([mockBatch1]);
    });

    it('throws 404 for unknown item', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getItem(mockClinic.id, 'unknown-item')).rejects.toMatchObject({
        code: 'ITEM_NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('listItems', () => {
    it('returns filtered results with search', async () => {
      repository.list.mockResolvedValue({ items: [mockItem], total: 1, page: 1, limit: 30 });

      const result = await service.listItems(mockClinic.id, { search: 'amox' });

      expect(result.items).toEqual([mockItem]);
      expect(repository.list).toHaveBeenCalledWith(mockClinic.id, { search: 'amox' });
    });

    it('returns filtered results with category filter', async () => {
      repository.list.mockResolvedValue({ items: [mockItemVaccine], total: 1, page: 1, limit: 30 });

      const result = await service.listItems(mockClinic.id, { category: 'vaccine' });

      expect(result.items).toEqual([mockItemVaccine]);
      expect(repository.list).toHaveBeenCalledWith(mockClinic.id, { category: 'vaccine' });
    });
  });

  describe('getSummary', () => {
    it('returns correct counts', async () => {
      const summary = { totalItems: 42, lowStockCount: 3, expiringCount: 2, totalValue: 15000 };
      repository.getSummary.mockResolvedValue(summary);

      const result = await service.getSummary(mockClinic.id);

      expect(result).toEqual(summary);
    });
  });

  describe('getCategories', () => {
    it('returns predefined + clinic custom categories merged (D-61)', async () => {
      repository.listCategories.mockResolvedValue([
        ...INVENTORY_CATEGORIES,
        { value: mockClinicCategory.value, label: mockClinicCategory.label, icon: 'tag' },
      ]);

      const result = await service.getCategories(mockClinic.id);

      expect(result).toHaveLength(INVENTORY_CATEGORIES.length + 1);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: mockClinicCategory.value }),
        ]),
      );
    });
  });

  describe('getUnits', () => {
    it('returns predefined + clinic custom units merged (D-61)', async () => {
      repository.listUnits.mockResolvedValue([
        ...INVENTORY_UNITS,
        { value: mockClinicUnit.value, label: mockClinicUnit.label },
      ]);

      const result = await service.getUnits(mockClinic.id);

      expect(result).toHaveLength(INVENTORY_UNITS.length + 1);
      expect(result).toEqual(
        expect.arrayContaining([expect.objectContaining({ value: mockClinicUnit.value })]),
      );
    });
  });

  describe('addBarcode', () => {
    it('returns { success: true, barcode } on success', async () => {
      repository.addBarcode.mockResolvedValue({ success: true, barcode: mockBarcode });

      const result = await service.addBarcode(mockClinic.id, mockItem.id, {
        code: mockBarcode.code,
        format: mockBarcode.format,
      });

      expect(result).toEqual({ success: true, barcode: mockBarcode });
    });

    it('returns { success: false, conflict } for a barcode already linked to a different item (D-63)', async () => {
      repository.addBarcode.mockResolvedValue({
        success: false,
        conflict: { itemId: 'other-item', itemName: 'Other Item' },
      });

      const result = await service.addBarcode(mockClinic.id, mockItem.id, {
        code: mockBarcode.code,
        format: mockBarcode.format,
      });

      expect(result).toEqual({
        success: false,
        conflict: { itemId: 'other-item', itemName: 'Other Item' },
      });
    });
  });

  describe('getPhotoUploadUrl', () => {
    it('returns { uploadUrl, photoUrl, expiresIn } for a valid item (D-64)', async () => {
      repository.generatePhotoUploadUrl.mockResolvedValue({
        uploadUrl: 'http://localhost:9000/breeyo-uploads/inventory-photos/x.jpg',
        photoUrl: 'http://localhost:9000/breeyo-uploads/inventory-photos/x.jpg',
        expiresIn: 900,
      });

      const result = await service.getPhotoUploadUrl(mockClinic.id, mockItem.id);

      expect(result.expiresIn).toBe(900);
      expect(result.uploadUrl).toContain('inventory-photos');
    });

    it('throws 404 for unknown item', async () => {
      repository.generatePhotoUploadUrl.mockResolvedValue(null);

      await expect(
        service.getPhotoUploadUrl(mockClinic.id, 'unknown-item'),
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', statusCode: 404 });
    });
  });
});
