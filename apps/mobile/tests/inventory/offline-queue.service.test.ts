import { describe, it, expect, vi, beforeEach } from 'vitest';

// expo-sqlite is a native module; never actually import the real thing in
// this vitest "node" environment (matches the mocking convention every
// other native-module-touching test in this repo already uses, e.g.
// tests/inventory/useItemPhotoUpload.test.ts's expo-file-system mock).
vi.mock('expo-sqlite', () => ({
  openDatabaseSync: vi.fn(() => {
    throw new Error('openDatabaseSync should never be called when a db is injected in tests');
  }),
}));

const mockApiClient = vi.fn();
vi.mock('../../src/lib/api', () => {
  class ApiClientError extends Error {
    code: string;
    status: number;
    details?: Record<string, unknown>;
    constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
      super(message);
      this.name = 'ApiClientError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
  return {
    apiClient: (...args: unknown[]) => mockApiClient(...args),
    ApiClientError,
  };
});

import { OfflineQueueService, isConnectivityError } from '../../src/features/inventory/services/offline-queue.service';
import { ApiClientError } from '../../src/lib/api';

/**
 * Minimal in-memory fake of the expo-sqlite SQLiteDatabase surface this
 * service actually uses (execSync/runSync/getFirstSync/getAllSync). Real
 * SQL strings from the implementation are pattern-matched so this test
 * exercises the service's actual query logic (ORDER BY, WHERE synced=0,
 * DELETE ... WHERE synced=1) rather than a hand-waved stub.
 */
function createFakeDb() {
  let rows: Array<{
    id: number;
    client_operation_id: string;
    operation_type: string;
    item_id: string;
    data: string;
    created_at: number;
    synced: number;
  }> = [];
  let nextId = 1;

  return {
    execSync: vi.fn(),
    runSync: vi.fn((sql: string, params: unknown[] = []) => {
      if (/^\s*INSERT INTO pending_operations/i.test(sql)) {
        const [clientOperationId, operationType, itemId, data, createdAt] = params as [
          string,
          string,
          string,
          string,
          number,
        ];
        rows.push({
          id: nextId++,
          client_operation_id: clientOperationId,
          operation_type: operationType,
          item_id: itemId,
          data,
          created_at: createdAt,
          synced: 0,
        });
      } else if (/^\s*UPDATE pending_operations SET synced = 1/i.test(sql)) {
        const [id] = params as [number];
        const row = rows.find((r) => r.id === id);
        if (row) row.synced = 1;
      } else if (/^\s*DELETE FROM pending_operations WHERE synced = 1/i.test(sql)) {
        rows = rows.filter((r) => r.synced !== 1);
      } else {
        throw new Error(`Fake db runSync: unrecognized SQL: ${sql}`);
      }
      return { changes: 1, lastInsertRowId: nextId - 1 };
    }),
    getFirstSync: vi.fn((sql: string) => {
      if (/COUNT\(\*\)/i.test(sql) && /synced = 0/i.test(sql)) {
        return { count: rows.filter((r) => r.synced === 0).length };
      }
      throw new Error(`Fake db getFirstSync: unrecognized SQL: ${sql}`);
    }),
    getAllSync: vi.fn((sql: string) => {
      if (/WHERE synced = 0/i.test(sql) && /ORDER BY created_at ASC/i.test(sql)) {
        return rows
          .filter((r) => r.synced === 0)
          .slice()
          .sort((a, b) => a.created_at - b.created_at);
      }
      throw new Error(`Fake db getAllSync: unrecognized SQL (must ORDER BY created_at ASC): ${sql}`);
    }),
    _debugRows: () => rows,
  };
}

describe('OfflineQueueService', () => {
  beforeEach(() => {
    mockApiClient.mockReset();
  });

  describe('enqueue', () => {
    it('generates a clientOperationId per call and persists it with the operation', () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);

      const id1 = service.enqueue('dispense', 'item-1', { quantity: 2 });
      const id2 = service.enqueue('dispense', 'item-1', { quantity: 3 });

      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id1).not.toBe(id2);

      const rows = db._debugRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].client_operation_id).toBe(id1);
      expect(rows[1].client_operation_id).toBe(id2);
    });

    it('serializes the operation data as JSON', () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);
      service.enqueue('receipt', 'item-9', { quantity: 10, supplier: 'Acme' });

      const rows = db._debugRows();
      expect(JSON.parse(rows[0].data)).toEqual({ quantity: 10, supplier: 'Acme' });
      expect(rows[0].operation_type).toBe('receipt');
      expect(rows[0].item_id).toBe('item-9');
    });
  });

  describe('getPendingCount', () => {
    it('counts only unsynced operations', () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);
      expect(service.getPendingCount()).toBe(0);

      service.enqueue('dispense', 'item-1', { quantity: 1 });
      service.enqueue('adjustment', 'item-2', { quantity: 1, type: 'add', reason: 'correction' });
      expect(service.getPendingCount()).toBe(2);
    });
  });

  describe('syncPending — FIFO replay order', () => {
    it('replays queued operations in created_at ASC order, not enqueue-call order', async () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);

      // Deliberately enqueue with DECREASING timestamps so enqueue-call order
      // is the exact reverse of chronological order. If syncPending failed to
      // ORDER BY created_at ASC and instead relied on array/insertion order,
      // this test would observe the wrong replay order.
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValueOnce(3000);
      service.enqueue('dispense', 'item-C', { quantity: 1 }); // created_at 3000, enqueued 1st
      nowSpy.mockReturnValueOnce(2000);
      service.enqueue('dispense', 'item-B', { quantity: 1 }); // created_at 2000, enqueued 2nd
      nowSpy.mockReturnValueOnce(1000);
      service.enqueue('dispense', 'item-A', { quantity: 1 }); // created_at 1000, enqueued 3rd
      nowSpy.mockRestore();

      mockApiClient.mockResolvedValue({ data: { alreadyApplied: false, operationType: 'dispense', result: {} } });

      const result = await service.syncPending('token-abc');

      expect(result).toEqual({ synced: 3, failed: false });
      expect(mockApiClient).toHaveBeenCalledTimes(3);
      const itemIdsInCallOrder = mockApiClient.mock.calls.map((call) => {
        const body = JSON.parse((call[1] as { body: string }).body);
        return body.itemId;
      });
      // Chronological order (created_at ASC): A (1000) -> B (2000) -> C (3000)
      expect(itemIdsInCallOrder).toEqual(['item-A', 'item-B', 'item-C']);
    });

    it('sends operationType, itemId, clientOperationId, and data to the sync-operation endpoint', async () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);
      const clientOperationId = service.enqueue('adjustment', 'item-5', {
        quantity: 4,
        type: 'remove',
        reason: 'damage',
      });

      mockApiClient.mockResolvedValue({ data: { alreadyApplied: false, operationType: 'adjustment', result: {} } });
      await service.syncPending('token-xyz');

      expect(mockApiClient).toHaveBeenCalledWith(
        '/api/v1/inventory/sync-operation',
        expect.objectContaining({ method: 'POST', token: 'token-xyz' }),
      );
      const body = JSON.parse(mockApiClient.mock.calls[0][1].body);
      expect(body).toEqual({
        operationType: 'adjustment',
        itemId: 'item-5',
        clientOperationId,
        data: { quantity: 4, type: 'remove', reason: 'damage' },
      });
    });

    it('marks successfully synced operations so they no longer count as pending', async () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);
      service.enqueue('dispense', 'item-1', { quantity: 1 });
      service.enqueue('dispense', 'item-2', { quantity: 1 });

      mockApiClient.mockResolvedValue({ data: { alreadyApplied: false, operationType: 'dispense', result: {} } });
      await service.syncPending('token');

      expect(service.getPendingCount()).toBe(0);
    });
  });

  describe('syncPending — stop on first failure', () => {
    it('stops replaying after the first failed operation and never calls the API for later ones', async () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);

      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValueOnce(1000);
      service.enqueue('dispense', 'item-1', { quantity: 1 });
      nowSpy.mockReturnValueOnce(2000);
      service.enqueue('dispense', 'item-2', { quantity: 1 });
      nowSpy.mockReturnValueOnce(3000);
      service.enqueue('dispense', 'item-3', { quantity: 1 });
      nowSpy.mockRestore();

      mockApiClient
        .mockResolvedValueOnce({ data: { alreadyApplied: false, operationType: 'dispense', result: {} } })
        .mockRejectedValueOnce(new ApiClientError('Insufficient stock', 'INSUFFICIENT_STOCK', 409))
        .mockResolvedValueOnce({ data: { alreadyApplied: false, operationType: 'dispense', result: {} } });

      const result = await service.syncPending('token');

      expect(mockApiClient).toHaveBeenCalledTimes(2); // 3rd op never attempted
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(true);
      expect(result.error).toMatchObject({
        itemId: 'item-2',
        code: 'INSUFFICIENT_STOCK',
        message: 'Insufficient stock',
        isConnectivityError: false,
      });

      // The first (successful) op is no longer pending; the failed one and
      // the never-attempted one both remain queued for retry.
      expect(service.getPendingCount()).toBe(2);
    });

    it('reports a connectivity error distinctly from a structured API error', async () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);
      service.enqueue('dispense', 'item-1', { quantity: 1 });

      mockApiClient.mockRejectedValueOnce(new TypeError('Network request failed'));

      const result = await service.syncPending('token');

      expect(result.failed).toBe(true);
      expect(result.error?.isConnectivityError).toBe(true);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });
  });

  describe('clearSynced', () => {
    it('removes only synced operations, leaving pending ones intact', async () => {
      const db = createFakeDb();
      const service = new OfflineQueueService(db as any);
      service.enqueue('dispense', 'item-1', { quantity: 1 });
      service.enqueue('dispense', 'item-2', { quantity: 1 });

      mockApiClient
        .mockResolvedValueOnce({ data: { alreadyApplied: false, operationType: 'dispense', result: {} } })
        .mockRejectedValueOnce(new ApiClientError('boom', 'UNKNOWN_ERROR', 500));
      await service.syncPending('token');

      expect(db._debugRows()).toHaveLength(2);
      service.clearSynced();
      const remaining = db._debugRows();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].item_id).toBe('item-2');
    });
  });
});

describe('isConnectivityError', () => {
  it('returns false for a structured ApiClientError (we reached the server)', () => {
    expect(isConnectivityError(new ApiClientError('not found', 'ITEM_NOT_FOUND', 404))).toBe(false);
  });

  it('returns true for a plain TypeError thrown by a failed fetch', () => {
    expect(isConnectivityError(new TypeError('Network request failed'))).toBe(true);
  });

  it('returns false for an unrelated Error', () => {
    expect(isConnectivityError(new Error('some other failure'))).toBe(false);
  });
});
