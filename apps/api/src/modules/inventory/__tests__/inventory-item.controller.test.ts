import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryController } from '../inventory-item.controller.js';
import type { InventoryItemService } from '../inventory-item.service.js';
import type { StockReceiptService } from '../stock-receipt.service.js';
import type { BarcodeLookupService } from '../barcode-lookup.service.js';
import { mockClinic, mockUser, mockItem, mockBarcode } from './inventory.fixtures.js';

function createMockService() {
  return {
    createItem: vi.fn(),
    updateItem: vi.fn(),
    getItem: vi.fn(),
    listItems: vi.fn(),
    getSummary: vi.fn(),
    getCategories: vi.fn(),
    getUnits: vi.fn(),
    addBarcode: vi.fn(),
    removeBarcode: vi.fn(),
    getPhotoUploadUrl: vi.fn(),
  } as unknown as InventoryItemService;
}

function createMockStockReceiptService() {
  return { receiveStock: vi.fn() } as unknown as StockReceiptService;
}

function createMockBarcodeLookupService() {
  return { lookup: vi.fn(), getCatalog: vi.fn() } as unknown as BarcodeLookupService;
}

function createMockReply() {
  const reply: any = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: mockUser.id, activeClinicId: mockClinic.id },
    ...overrides,
  } as any;
}

describe('InventoryController', () => {
  let service: ReturnType<typeof createMockService>;
  let stockReceiptService: ReturnType<typeof createMockStockReceiptService>;
  let barcodeLookupService: ReturnType<typeof createMockBarcodeLookupService>;
  let controller: InventoryController;

  beforeEach(() => {
    service = createMockService();
    stockReceiptService = createMockStockReceiptService();
    barcodeLookupService = createMockBarcodeLookupService();
    controller = new InventoryController(service, stockReceiptService, barcodeLookupService);
  });

  describe('createItem', () => {
    it('creates an item and returns 201', async () => {
      vi.mocked(service.createItem).mockResolvedValue(mockItem as any);

      const request = createMockRequest({
        body: {
          name: mockItem.name,
          category: mockItem.category,
          unit: mockItem.unit,
          sellingPrice: mockItem.sellingPrice,
        },
      });
      const reply = createMockReply();

      await controller.createItem(request, reply);

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({ data: mockItem });
      expect(service.createItem).toHaveBeenCalledWith(
        mockClinic.id,
        mockUser.id,
        expect.objectContaining({ name: mockItem.name }),
      );
    });

    it('returns 400 for invalid body', async () => {
      const request = createMockRequest({ body: { category: 'medicine' } });
      const reply = createMockReply();

      await controller.createItem(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(service.createItem).not.toHaveBeenCalled();
    });
  });

  describe('getItem', () => {
    it('returns 200 with the item', async () => {
      vi.mocked(service.getItem).mockResolvedValue(mockItem as any);

      const request = createMockRequest({ params: { itemId: mockItem.id } });
      const reply = createMockReply();

      await controller.getItem(request, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ data: mockItem });
    });
  });

  describe('addBarcode (D-63)', () => {
    it('returns 201 with the barcode on success', async () => {
      vi.mocked(service.addBarcode).mockResolvedValue({ success: true, barcode: mockBarcode } as any);

      const request = createMockRequest({
        params: { itemId: mockItem.id },
        body: { code: mockBarcode.code, format: mockBarcode.format },
      });
      const reply = createMockReply();

      await controller.addBarcode(request, reply);

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({ data: mockBarcode });
    });

    it('returns 409 with a typed existingItem when the barcode is already linked elsewhere', async () => {
      vi.mocked(service.addBarcode).mockResolvedValue({
        success: false,
        conflict: { itemId: 'other-item', itemName: 'Other Item' },
      } as any);

      const request = createMockRequest({
        params: { itemId: mockItem.id },
        body: { code: mockBarcode.code, format: mockBarcode.format },
      });
      const reply = createMockReply();

      await controller.addBarcode(request, reply);

      expect(reply.status).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'BARCODE_CONFLICT',
          message: expect.stringContaining('Other Item'),
          existingItem: { itemId: 'other-item', itemName: 'Other Item' },
        }),
      });
    });
  });

  describe('receiveStock', () => {
    it('returns 201 with { batch, movement }', async () => {
      const result = { batch: { id: 'batch-1' }, movement: { id: 'mov-1' } };
      vi.mocked(stockReceiptService.receiveStock).mockResolvedValue(result as any);

      const request = createMockRequest({
        params: { itemId: mockItem.id },
        body: { quantity: 10 },
      });
      const reply = createMockReply();

      await controller.receiveStock(request, reply);

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({ data: result });
    });
  });

  describe('lookupBarcode', () => {
    it('returns 200 with the lookup result', async () => {
      vi.mocked(barcodeLookupService.lookup).mockResolvedValue({ found: true, item: mockItem } as any);

      const request = createMockRequest({ query: { code: mockBarcode.code } });
      const reply = createMockReply();

      await controller.lookupBarcode(request, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ data: { found: true, item: mockItem } });
    });
  });
});
