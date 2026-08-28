import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StockAdjustmentService } from '../stock-adjustment.service.js';
import { StockMovementService } from '../stock-movement.service.js';
import { mockClinic, mockUser, mockItem } from './inventory.fixtures.js';

const LIVE_UPDATED_AT = new Date('2026-08-20T09:00:00.000Z');

function createMockTx() {
  let currentStock = mockItem.currentStock;
  return {
    // WR-2: `recordMovement` now takes a `SELECT ... FOR UPDATE` lock on the
    // item row (via `tx.$queryRaw`) before reading `lastMovement` -- the
    // mock's return value is irrelevant here since the caller only awaits it
    // for its locking side effect.
    $queryRaw: vi.fn().mockResolvedValue([]),
    stockMovement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'mov_adj_1', ...data })),
    },
    inventoryItem: {
      // F1 (Plan 10-05, D-05): the version check and the real stock mutation
      // are the SAME conditional `updateMany` -- `where.updatedAt` is only
      // present when the caller supplied `expectedVersion`, mirroring the
      // real conditional UPDATE's `WHERE id = ? AND updated_at = ?`.
      updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
        if (where.updatedAt && where.updatedAt.getTime() !== LIVE_UPDATED_AT.getTime()) {
          return Promise.resolve({ count: 0 });
        }
        currentStock += data.currentStock?.increment ?? 0;
        return Promise.resolve({ count: 1 });
      }),
      findUnique: vi.fn().mockResolvedValue({ updatedAt: LIVE_UPDATED_AT }),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve({ ...mockItem, currentStock })),
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
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
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
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
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

    expect(tx.inventoryItem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: 'found extra units during cleanup' }),
      }),
    );
  });

  describe('optimistic-concurrency enforcement (Plan 10-05, D-05, F1)', () => {
    it('applies normally when expectedVersion matches the item\'s live updatedAt', async () => {
      const result = await service.adjust(
        mockClinic.id,
        mockItem.id,
        mockUser.id,
        mockUser.name,
        { quantity: 10, type: 'add', reason: 'correction' },
        LIVE_UPDATED_AT.getTime(),
      );

      expect(result.movement.quantity).toBe(10);
      expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: mockItem.id, updatedAt: LIVE_UPDATED_AT },
        data: { currentStock: { increment: 10 } },
      });
    });

    it('rejects with a 409 STALE_WRITE_CONFLICT when expectedVersion is behind the item\'s live updatedAt (F1: the version check and the real stock mutation are the SAME conditional updateMany, inside the same transaction as the movement record, so a rejected claim rolls the whole transaction back -- no bumped version and no persisted movement)', async () => {
      const staleExpectedVersion = LIVE_UPDATED_AT.getTime() - 60_000;

      await expect(
        service.adjust(
          mockClinic.id,
          mockItem.id,
          mockUser.id,
          mockUser.name,
          { quantity: 10, type: 'add', reason: 'correction' },
          staleExpectedVersion,
        ),
      ).rejects.toMatchObject({ statusCode: 409, code: 'STALE_WRITE_CONFLICT' });
    });
  });
});
