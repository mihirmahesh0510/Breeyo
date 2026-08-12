import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FifoDispenseService, InsufficientStockError } from '../fifo-dispense.service.js';
import { StockMovementService } from '../stock-movement.service.js';
import { mockClinic, mockUser, mockItem, mockBatch1, mockBatch2 } from './inventory.fixtures.js';

function createMockTx() {
  let movementCounter = 0;
  return {
    $queryRaw: vi.fn(),
    inventoryItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    stockBatch: {
      update: vi.fn().mockResolvedValue({}),
    },
    stockMovement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: any) => {
        movementCounter += 1;
        return Promise.resolve({ id: `mov_${movementCounter}`, ...data });
      }),
    },
  };
}

function createMockPrisma(tx: ReturnType<typeof createMockTx>) {
  return {
    $transaction: vi.fn((callback: any) => callback(tx)),
    stockMovement: { findFirst: vi.fn() },
  };
}

describe('FifoDispenseService', () => {
  let tx: ReturnType<typeof createMockTx>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: FifoDispenseService;

  beforeEach(() => {
    tx = createMockTx();
    prisma = createMockPrisma(tx);
    const stockMovementService = new StockMovementService(prisma as any);
    service = new FifoDispenseService(prisma as any, stockMovementService);

    tx.inventoryItem.findFirst.mockResolvedValue(mockItem);
    tx.inventoryItem.update.mockImplementation(({ data }: any) =>
      Promise.resolve({
        ...mockItem,
        currentStock: mockItem.currentStock - (data.currentStock?.decrement ?? -(data.currentStock?.increment ?? 0)),
      }),
    );
  });

  describe('dispense', () => {
    it('dispenses from the oldest batch first (FIFO ordering)', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch1, mockBatch2]); // batch1.receivedAt < batch2.receivedAt

      const result = await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 20,
      });

      expect(result.deductions).toEqual([
        { batchId: mockBatch1.id, lotNumber: mockBatch1.lotNumber, quantity: 20 },
      ]);
      expect(tx.stockBatch.update).toHaveBeenCalledTimes(1);
      expect(tx.stockBatch.update).toHaveBeenCalledWith({
        where: { id: mockBatch1.id },
        data: { currentQty: { decrement: 20 } },
      });
    });

    it('cascades to the second batch when the first batch is insufficient', async () => {
      // mockBatch1.currentQty=60, mockBatch2.currentQty=40
      tx.$queryRaw.mockResolvedValue([mockBatch1, mockBatch2]);

      const result = await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 80,
      });

      expect(result.deductions).toEqual([
        { batchId: mockBatch1.id, lotNumber: mockBatch1.lotNumber, quantity: 60 },
        { batchId: mockBatch2.id, lotNumber: mockBatch2.lotNumber, quantity: 20 },
      ]);
      expect(tx.stockBatch.update).toHaveBeenCalledTimes(2);
      expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    });

    it('excludes expired-flagged/past-expiry batches from the eligible total (D-25)', async () => {
      // Simulates the SQL WHERE clause (is_expired = false AND (expiryDate
      // IS NULL OR expiryDate > NOW())) never returning the expired batch
      // (currentQty=5). Requesting more than the two non-expired batches
      // combined (100) must fail rather than silently drawing on it.
      tx.$queryRaw.mockResolvedValue([mockBatch1, mockBatch2]);

      await expect(
        service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, { quantity: 105 }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', available: 100, requested: 105 });
    });

    it('builds the eligible-batch query with the expired/expiry-date blocking predicates, oldest-first ordering, and a row lock', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch1, mockBatch2]);

      await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, { quantity: 10 });

      const sqlArg = tx.$queryRaw.mock.calls[0][0];
      expect(sqlArg.sql).toContain('is_expired = false');
      expect(sqlArg.sql).toContain('expiry_date IS NULL OR expiry_date > NOW()');
      expect(sqlArg.sql).toContain('ORDER BY received_at ASC');
      expect(sqlArg.sql).toContain('FOR UPDATE');
    });

    it('throws InsufficientStockError when total available is less than requested', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch2]); // only 40 available

      await expect(
        service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, { quantity: 50 }),
      ).rejects.toBeInstanceOf(InsufficientStockError);
    });

    it('allows manual override to a specific batch (D-22)', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch2]);

      const result = await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 10,
        overrideBatchId: mockBatch2.id,
      });

      expect(result.deductions).toEqual([
        { batchId: mockBatch2.id, lotNumber: mockBatch2.lotNumber, quantity: 10 },
      ]);
      const sqlArg = tx.$queryRaw.mock.calls[0][0];
      expect(sqlArg.sql).toContain('FOR UPDATE');
      expect(sqlArg.values).toContain(mockBatch2.id);
    });

    it('creates a movement for each batch deducted', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch1, mockBatch2]);

      const result = await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 80,
      });

      expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(result.movementIds).toHaveLength(2);
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'dispensed', quantity: -60 }) }),
      );
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'dispensed', quantity: -20 }) }),
      );
    });

    it('decrements InventoryItem.currentStock by the total dispensed', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch1]);

      await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, { quantity: 15 });

      expect(tx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: mockItem.id },
        data: { currentStock: { decrement: 15 } },
      });
    });

    it('snapshots item.sellingPrice into unitPrice on every dispensed movement (D-60)', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch1, mockBatch2]);

      await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, { quantity: 80 });

      for (const [args] of tx.stockMovement.create.mock.calls) {
        expect(args.data.unitPrice).toBe(mockItem.sellingPrice);
      }
    });

    it('includes ownerId on the movement when provided and consultationId is absent (D-60 counter sale)', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch1]);

      await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 10,
        ownerId: 'owner_inv_1',
      });

      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerId: 'owner_inv_1', consultationId: null }),
        }),
      );
    });

    it('does not attribute ownerId when a consultationId is present', async () => {
      tx.$queryRaw.mockResolvedValue([mockBatch1]);

      await service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, {
        quantity: 10,
        ownerId: 'owner_inv_1',
        consultationId: 'consult_1',
      });

      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerId: null, consultationId: 'consult_1' }),
        }),
      );
    });

    it('throws ITEM_NOT_FOUND when the item does not belong to the clinic', async () => {
      tx.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        service.dispense(mockClinic.id, 'unknown-item', mockUser.id, mockUser.name, { quantity: 10 }),
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', statusCode: 404 });
    });

    it('rejects a non-positive quantity via dispenseSchema', async () => {
      await expect(
        service.dispense(mockClinic.id, mockItem.id, mockUser.id, mockUser.name, { quantity: 0 }),
      ).rejects.toThrow();
    });
  });

  describe('returnToStock', () => {
    it('restores batch currentQty and increments InventoryItem.currentStock (D-51)', async () => {
      prisma.stockMovement.findFirst.mockResolvedValue({
        id: 'mov_1',
        clinicId: mockClinic.id,
        itemId: mockItem.id,
        batchId: mockBatch1.id,
        type: 'dispensed',
        quantity: -10,
      });

      const returnMovement = await service.returnToStock(mockClinic.id, 'mov_1', mockUser.id, mockUser.name);

      expect(tx.stockBatch.update).toHaveBeenCalledWith({
        where: { id: mockBatch1.id },
        data: { currentQty: { increment: 10 } },
      });
      expect(tx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: mockItem.id },
        data: { currentStock: { increment: 10 } },
      });
      expect(returnMovement.type).toBe('returned');
      expect(returnMovement.quantity).toBe(10);
    });

    it('rejects returning a movement that is not a negative dispensed movement', async () => {
      prisma.stockMovement.findFirst.mockResolvedValue({
        id: 'mov_2',
        clinicId: mockClinic.id,
        itemId: mockItem.id,
        batchId: mockBatch1.id,
        type: 'received',
        quantity: 10,
      });

      await expect(
        service.returnToStock(mockClinic.id, 'mov_2', mockUser.id, mockUser.name),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws when the movement does not exist', async () => {
      prisma.stockMovement.findFirst.mockResolvedValue(null);

      await expect(
        service.returnToStock(mockClinic.id, 'unknown-mov', mockUser.id, mockUser.name),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
