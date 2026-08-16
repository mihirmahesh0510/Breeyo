import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StockAdjustmentService } from '../stock-adjustment.service.js';
import { StockMovementService } from '../stock-movement.service.js';
import { mockClinic, mockUser, mockItem } from './inventory.fixtures.js';

function createMockTx() {
  return {
    stockMovement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'mov_adj_1', ...data })),
    },
    inventoryItem: {
      update: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({
          ...mockItem,
          currentStock: mockItem.currentStock + (data.currentStock?.increment ?? 0),
        }),
      ),
    },
  };
}

function createMockPrisma(tx: ReturnType<typeof createMockTx>) {
  return {
    $transaction: vi.fn((callback: any) => callback(tx)),
    inventoryItem: { findFirst: vi.fn().mockResolvedValue(mockItem) },
  };
}

describe('StockAdjustmentService', () => {
  let tx: ReturnType<typeof createMockTx>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: StockAdjustmentService;

  beforeEach(() => {
    tx = createMockTx();
    prisma = createMockPrisma(tx);
    const stockMovementService = new StockMovementService(prisma as any);
    service = new StockAdjustmentService(prisma as any, stockMovementService);
  });

  it('creates a positive movement for an "add" adjustment', async () => {
    const result = await service.adjust(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
      quantity: 10,
      type: 'add',
      reason: 'correction',
    });

    expect(result.movement.quantity).toBe(10);
    expect(result.movement.type).toBe('adjusted');
    expect(result.movement.reason).toBe('correction');
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: mockItem.id },
      data: { currentStock: { increment: 10 } },
    });
  });

  it('creates a negative movement for a "remove" adjustment', async () => {
    const result = await service.adjust(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
      quantity: 10,
      type: 'remove',
      reason: 'damage',
    });

    expect(result.movement.quantity).toBe(-10);
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: mockItem.id },
      data: { currentStock: { increment: -10 } },
    });
  });

  it('rejects a missing reason (D-04)', async () => {
    await expect(
      service.adjust(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 10,
        type: 'add',
      } as any),
    ).rejects.toThrow();

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a reason outside the ADJUSTMENT_REASONS preset list', async () => {
    await expect(
      service.adjust(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 10,
        type: 'add',
        reason: 'not_a_real_reason',
      } as any),
    ).rejects.toThrow();
  });

  it('rejects removal exceeding current stock', async () => {
    // mockItem.currentStock === 100
    await expect(
      service.adjust(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 1000,
        type: 'remove',
        reason: 'theft',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('throws ITEM_NOT_FOUND when the item does not belong to the clinic', async () => {
    prisma.inventoryItem.findFirst.mockResolvedValue(null);

    await expect(
      service.adjust(mockClinic.id, 'unknown-item', mockUser.id, mockUser.name, {
        quantity: 5,
        type: 'add',
        reason: 'other',
      }),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', statusCode: 404 });
  });

  it('updates InventoryItem.currentStock accordingly', async () => {
    await service.adjust(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
      quantity: 5,
      type: 'add',
      reason: 'other',
      notes: 'found extra units during cleanup',
    });

    expect(tx.inventoryItem.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: 'found extra units during cleanup' }),
      }),
    );
  });
});
