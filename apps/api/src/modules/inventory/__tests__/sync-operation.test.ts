import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SyncOperationService,
  SYNC_OPERATION_PERMISSIONS,
  type PermissionsProvider,
} from '../sync-operation.service.js';
import { INVENTORY_PERMISSIONS } from '../middleware/inventory-permissions.middleware.js';
import { mockClinic, mockUser } from './inventory.fixtures.js';

function createMockServices() {
  return {
    fifoDispenseService: { dispense: vi.fn(), returnToStock: vi.fn() } as any,
    stockAdjustmentService: { adjust: vi.fn() } as any,
    stockReceiptService: { receiveStock: vi.fn() } as any,
  };
}

function createMockPermissionsProvider(permissions: string[]): PermissionsProvider {
  return { getUserPermissions: vi.fn().mockResolvedValue(permissions) };
}

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    __store: store,
  } as any;
}

describe('SyncOperationService', () => {
  let services: ReturnType<typeof createMockServices>;
  const clinicId = mockClinic.id;
  const userId = mockUser.id;
  const userName = mockUser.name;

  beforeEach(() => {
    services = createMockServices();
  });

  function buildService(permissions: string[], redis?: ReturnType<typeof createMockRedis>) {
    return new SyncOperationService(
      services.fifoDispenseService,
      services.stockAdjustmentService,
      services.stockReceiptService,
      createMockPermissionsProvider(permissions),
      redis,
    );
  }

  describe('routing per operation type', () => {
    it('routes "receipt" to StockReceiptService.receiveStock', async () => {
      services.stockReceiptService.receiveStock.mockResolvedValue({ batch: { id: 'batch_new' } });
      const service = buildService([INVENTORY_PERMISSIONS.manageStock]);

      const result = await service.execute(clinicId, userId, userName, {
        operationType: 'receipt',
        itemId: 'item_1',
        data: { quantity: 10 },
      });

      expect(services.stockReceiptService.receiveStock).toHaveBeenCalledWith(
        clinicId,
        'item_1',
        userId,
        userName,
        { quantity: 10 },
      );
      expect(services.fifoDispenseService.dispense).not.toHaveBeenCalled();
      expect(services.stockAdjustmentService.adjust).not.toHaveBeenCalled();
      expect(result).toEqual({
        alreadyApplied: false,
        operationType: 'receipt',
        result: { batch: { id: 'batch_new' } },
      });
    });

    it('routes "dispense" to FifoDispenseService.dispense', async () => {
      services.fifoDispenseService.dispense.mockResolvedValue({ newTotal: 80 });
      const service = buildService([INVENTORY_PERMISSIONS.dispense]);

      const result = await service.execute(clinicId, userId, userName, {
        operationType: 'dispense',
        itemId: 'item_1',
        data: { quantity: 20 },
      });

      expect(services.fifoDispenseService.dispense).toHaveBeenCalledWith(
        clinicId,
        'item_1',
        userId,
        userName,
        { quantity: 20 },
      );
      expect(services.stockReceiptService.receiveStock).not.toHaveBeenCalled();
      expect(services.stockAdjustmentService.adjust).not.toHaveBeenCalled();
      expect(result.result).toEqual({ newTotal: 80 });
    });

    it('routes "adjustment" to StockAdjustmentService.adjust', async () => {
      services.stockAdjustmentService.adjust.mockResolvedValue({ movement: { id: 'mov_1' } });
      const service = buildService([INVENTORY_PERMISSIONS.manageStock]);

      const result = await service.execute(clinicId, userId, userName, {
        operationType: 'adjustment',
        itemId: 'item_1',
        data: { quantity: 5, type: 'add', reason: 'correction' },
      });

      expect(services.stockAdjustmentService.adjust).toHaveBeenCalledWith(
        clinicId,
        'item_1',
        userId,
        userName,
        { quantity: 5, type: 'add', reason: 'correction' },
      );
      expect(result.result).toEqual({ movement: { id: 'mov_1' } });
    });
  });

  describe('unknown operation type', () => {
    it('throws a structured UNKNOWN_OPERATION_TYPE error for an unrecognized type', async () => {
      const service = buildService([INVENTORY_PERMISSIONS.manageStock]);

      await expect(
        service.execute(clinicId, userId, userName, {
          operationType: 'teleport',
          itemId: 'item_1',
          data: {},
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_OPERATION_TYPE', statusCode: 400 });

      expect(services.fifoDispenseService.dispense).not.toHaveBeenCalled();
      expect(services.stockReceiptService.receiveStock).not.toHaveBeenCalled();
      expect(services.stockAdjustmentService.adjust).not.toHaveBeenCalled();
    });

    it('throws a structured error when operationType is missing entirely', async () => {
      const service = buildService([INVENTORY_PERMISSIONS.manageStock]);

      await expect(
        service.execute(clinicId, userId, userName, { itemId: 'item_1', data: {} }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_OPERATION_TYPE', statusCode: 400 });
    });

    it('throws a VALIDATION_ERROR when itemId is missing', async () => {
      const service = buildService([INVENTORY_PERMISSIONS.manageStock, INVENTORY_PERMISSIONS.dispense]);

      await expect(
        service.execute(clinicId, userId, userName, { operationType: 'dispense', data: {} }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    });
  });

  describe('permission enforcement per type', () => {
    it('rejects "receipt" without MANAGE_INVENTORY_STOCK permission', async () => {
      const service = buildService([INVENTORY_PERMISSIONS.viewInventory]);

      await expect(
        service.execute(clinicId, userId, userName, {
          operationType: 'receipt',
          itemId: 'item_1',
          data: { quantity: 10 },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });

      expect(services.stockReceiptService.receiveStock).not.toHaveBeenCalled();
    });

    it('rejects "dispense" without DISPENSE_INVENTORY permission (e.g. Front Desk, D-43)', async () => {
      const service = buildService([INVENTORY_PERMISSIONS.manageStock, INVENTORY_PERMISSIONS.viewInventory]);

      await expect(
        service.execute(clinicId, userId, userName, {
          operationType: 'dispense',
          itemId: 'item_1',
          data: { quantity: 5 },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });

      expect(services.fifoDispenseService.dispense).not.toHaveBeenCalled();
    });

    it('rejects "adjustment" without MANAGE_INVENTORY_STOCK permission', async () => {
      const service = buildService([INVENTORY_PERMISSIONS.dispense]);

      await expect(
        service.execute(clinicId, userId, userName, {
          operationType: 'adjustment',
          itemId: 'item_1',
          data: { quantity: 5, type: 'add', reason: 'correction' },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });

      expect(services.stockAdjustmentService.adjust).not.toHaveBeenCalled();
    });

    it('allows "dispense" for a Clinician holding DISPENSE_INVENTORY', async () => {
      services.fifoDispenseService.dispense.mockResolvedValue({ newTotal: 90 });
      const service = buildService([INVENTORY_PERMISSIONS.dispense]);

      await expect(
        service.execute(clinicId, userId, userName, {
          operationType: 'dispense',
          itemId: 'item_1',
          data: { quantity: 10 },
        }),
      ).resolves.toMatchObject({ alreadyApplied: false });
    });

    it('maps each operation type to its expected permission action', () => {
      expect(SYNC_OPERATION_PERMISSIONS.receipt).toBe('manageStock');
      expect(SYNC_OPERATION_PERMISSIONS.dispense).toBe('dispense');
      expect(SYNC_OPERATION_PERMISSIONS.adjustment).toBe('manageStock');
    });
  });

  describe('downstream errors propagate with their structured shape', () => {
    it('propagates ITEM_NOT_FOUND from the downstream service unchanged', async () => {
      const notFound = Object.assign(new Error('Inventory item not found'), {
        statusCode: 404,
        code: 'ITEM_NOT_FOUND',
      });
      services.fifoDispenseService.dispense.mockRejectedValue(notFound);
      const service = buildService([INVENTORY_PERMISSIONS.dispense]);

      await expect(
        service.execute(clinicId, userId, userName, {
          operationType: 'dispense',
          itemId: 'missing-item',
          data: { quantity: 5 },
        }),
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', statusCode: 404 });
    });

    it('propagates INSUFFICIENT_STOCK from the downstream service unchanged', async () => {
      const insufficient = Object.assign(new Error('Insufficient stock'), {
        statusCode: 409,
        code: 'INSUFFICIENT_STOCK',
      });
      services.fifoDispenseService.dispense.mockRejectedValue(insufficient);
      const service = buildService([INVENTORY_PERMISSIONS.dispense]);

      await expect(
        service.execute(clinicId, userId, userName, {
          operationType: 'dispense',
          itemId: 'item_1',
          data: { quantity: 999 },
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', statusCode: 409 });
    });
  });

  describe('D-59 already-applied duplicate-replay detection (Redis-backed)', () => {
    it('executes the operation and caches the result when clientOperationId is provided', async () => {
      services.stockAdjustmentService.adjust.mockResolvedValue({ movement: { id: 'mov_1' } });
      const redis = createMockRedis();
      const service = buildService([INVENTORY_PERMISSIONS.manageStock], redis);

      const result = await service.execute(clinicId, userId, userName, {
        operationType: 'adjustment',
        itemId: 'item_1',
        clientOperationId: 'client-op-abc',
        data: { quantity: 5, type: 'add', reason: 'correction' },
      });

      expect(result.alreadyApplied).toBe(false);
      expect(services.stockAdjustmentService.adjust).toHaveBeenCalledTimes(1);
      expect(redis.setex).toHaveBeenCalledWith(
        `inventory:sync-op:${clinicId}:client-op-abc`,
        expect.any(Number),
        JSON.stringify({ movement: { id: 'mov_1' } }),
      );
    });

    it('returns the cached result with alreadyApplied=true on a replay, without re-running the mutation', async () => {
      services.stockAdjustmentService.adjust.mockResolvedValue({ movement: { id: 'mov_1' } });
      const redis = createMockRedis();
      const service = buildService([INVENTORY_PERMISSIONS.manageStock], redis);

      const body = {
        operationType: 'adjustment' as const,
        itemId: 'item_1',
        clientOperationId: 'client-op-replay',
        data: { quantity: 5, type: 'add', reason: 'correction' },
      };

      const first = await service.execute(clinicId, userId, userName, body);
      const second = await service.execute(clinicId, userId, userName, body);

      expect(first.alreadyApplied).toBe(false);
      expect(second.alreadyApplied).toBe(true);
      expect(second.result).toEqual(first.result);
      // The mutation itself must only have run once -- this is the whole point
      // of idempotent replay (D-59): a retried sync must not double-adjust stock.
      expect(services.stockAdjustmentService.adjust).toHaveBeenCalledTimes(1);
    });

    it('re-executes every time when no clientOperationId is provided (no idempotency key to dedupe on)', async () => {
      services.stockAdjustmentService.adjust.mockResolvedValue({ movement: { id: 'mov_1' } });
      const redis = createMockRedis();
      const service = buildService([INVENTORY_PERMISSIONS.manageStock], redis);

      const body = {
        operationType: 'adjustment' as const,
        itemId: 'item_1',
        data: { quantity: 5, type: 'add', reason: 'correction' },
      };

      await service.execute(clinicId, userId, userName, body);
      await service.execute(clinicId, userId, userName, body);

      expect(services.stockAdjustmentService.adjust).toHaveBeenCalledTimes(2);
    });

    it('re-executes every time when redis is not provided (idempotency is best-effort, not required)', async () => {
      services.stockAdjustmentService.adjust.mockResolvedValue({ movement: { id: 'mov_1' } });
      const service = buildService([INVENTORY_PERMISSIONS.manageStock]); // no redis

      const body = {
        operationType: 'adjustment' as const,
        itemId: 'item_1',
        clientOperationId: 'client-op-no-redis',
        data: { quantity: 5, type: 'add', reason: 'correction' },
      };

      const first = await service.execute(clinicId, userId, userName, body);
      const second = await service.execute(clinicId, userId, userName, body);

      expect(first.alreadyApplied).toBe(false);
      expect(second.alreadyApplied).toBe(false);
      expect(services.stockAdjustmentService.adjust).toHaveBeenCalledTimes(2);
    });
  });
});
