import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// expo-sqlite is a native module; never import the real thing in this vitest
// "node" environment (matches offlineDb.test.ts's / offlineConsultationDraftStore.test.ts's
// own mocking convention -- this file exercises the offline stock action store
// against an in-memory fake db, never a real SQLite connection).
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(() => {
    throw new Error('openDatabaseAsync should never be called when a db is injected in tests');
  }),
}));

import { ReplayPriority } from '@breeyo/types';
import { ApiClientError } from '../../../lib/api';
import {
  recordOfflineStockReceive,
  recordOfflineStockDispense,
  recordOfflineStockAdjust,
  recordOfflineStockReturn,
  readStockWorkingSetItem,
  cacheScannedStockItem,
  isNetworkFailure,
  INVENTORY_MEDIUM,
  INVENTORY_SYNC_DOMAIN,
  STOCK_RECEIVE_ENTITY_TYPE,
  STOCK_DISPENSE_ENTITY_TYPE,
  STOCK_ADJUST_ENTITY_TYPE,
  STOCK_RETURN_ENTITY_TYPE,
} from '../services/offlineStockActionStore';

const CLINIC_ID = 'clinic-1';
const DEVICE_ID = 'device-1';
const USER_ID = 'user-1';
const ITEM_ID = 'item-1';

function knownItem(overrides: Partial<{ name: string; category: string; unit: string; currentStock: number }> = {}) {
  return {
    itemId: ITEM_ID,
    name: 'Amoxicillin 250mg',
    category: 'medicine',
    unit: 'tablets',
    currentStock: 10,
    ...overrides,
  };
}

/**
 * Minimal in-memory fake of the Expo SQLite async surface `offlineDb.ts`
 * actually uses -- same convention as `offlineDb.test.ts`/
 * `offlineConsultationDraftStore.test.ts`'s own fakes, extended just enough
 * to back `inventory_working_set_snapshot` reads/writes and `sync_operations`
 * inserts.
 */
function createFakeDb() {
  const tables: {
    sync_meta: Record<string, unknown>[];
    inventory_working_set_snapshot: Record<string, unknown>[];
    sync_operations: Record<string, unknown>[];
  } = { sync_meta: [], inventory_working_set_snapshot: [], sync_operations: [] };

  const db = {
    execAsync: vi.fn(async () => undefined),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => {
      await task();
    }),
    runAsync: vi.fn(async (sql: string, params: Record<string, unknown>) => {
      if (/^INSERT OR REPLACE INTO sync_meta/.test(sql)) {
        tables.sync_meta = tables.sync_meta.filter((r) => r.key !== params.$key);
        tables.sync_meta.push({ key: params.$key, value: params.$value });
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getFirstAsync: vi.fn(async (sql: string, params: Record<string, unknown>) => {
      if (/FROM sync_meta/.test(sql)) {
        return tables.sync_meta.find((r) => r.key === params.$key) ?? null;
      }
      if (/FROM inventory_working_set_snapshot/.test(sql)) {
        return tables.inventory_working_set_snapshot.find((r) => r.entity_id === params.$entityId) ?? null;
      }
      return null;
    }),
    prepareAsync: vi.fn(async (sql: string) => ({
      executeAsync: vi.fn(async (params: Record<string, unknown>) => {
        if (/INTO inventory_working_set_snapshot/.test(sql)) {
          tables.inventory_working_set_snapshot = tables.inventory_working_set_snapshot.filter(
            (r) => r.entity_id !== params.$entityId,
          );
          tables.inventory_working_set_snapshot.push({
            entity_id: params.$entityId,
            clinic_id: params.$clinicId,
            device_id: params.$deviceId,
            data_json: params.$dataJson,
            record_date: params.$recordDate,
            working_set_anchored_at: params.$workingSetAnchoredAt,
            is_fully_editable: params.$isFullyEditable,
            updated_at: params.$updatedAt,
          });
        } else if (/INTO sync_operations/.test(sql)) {
          tables.sync_operations.push({
            operation_id: params.$operationId,
            device_id: params.$deviceId,
            clinic_id: params.$clinicId,
            user_id: params.$userId,
            domain: params.$domain,
            entity_type: params.$entityType,
            entity_id: params.$entityId,
            priority: params.$priority,
            payload_json: params.$payloadJson,
            created_at: params.$createdAt,
          });
        }
        return { changes: 1, lastInsertRowId: 0 };
      }),
      finalizeAsync: vi.fn(async () => undefined),
    })),
  };

  return { db, tables };
}

let opCounter = 0;
function nextOperationId(): string {
  opCounter += 1;
  return `op-${opCounter}`;
}

describe('offlineStockActionStore (Plan 10-04 Task 1, D-04, D-10, D-15 to D-17)', () => {
  let fake: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    fake = createFakeDb();
    opCounter = 0;
  });

  it('re-exports INVENTORY_MEDIUM as ReplayPriority.INVENTORY_MEDIUM so inventory replay never rides the queue/clinical tiers', () => {
    expect(INVENTORY_MEDIUM).toBe(ReplayPriority.INVENTORY_MEDIUM);
  });

  describe('isNetworkFailure', () => {
    it('treats a server response (ApiClientError) as NOT a network failure -- must surface to the caller unchanged', () => {
      expect(isNetworkFailure(new ApiClientError('insufficient', 'INSUFFICIENT_STOCK', 409))).toBe(false);
    });

    it('treats anything else (fetch TypeError, offline rejection) as a network failure', () => {
      expect(isNetworkFailure(new TypeError('Network request failed'))).toBe(true);
      expect(isNetworkFailure(new Error('generic'))).toBe(true);
    });
  });

  describe('readStockWorkingSetItem', () => {
    it('returns null when nothing has been cached for this item yet', async () => {
      const cached = await readStockWorkingSetItem(fake.db as any, ITEM_ID);
      expect(cached).toBeNull();
    });
  });

  describe('recordOfflineStockReceive', () => {
    it('seeds the working-set cache from knownItem, applies the received quantity, and enqueues an INVENTORY_MEDIUM STOCK_RECEIVE envelope', async () => {
      const { item, operationId } = await recordOfflineStockReceive(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem({ currentStock: 10 }),
        payload: { quantity: 20, lotNumber: 'LOT-1', expiryDate: '2027-01-01', purchasePrice: 50, supplier: 'Acme' },
        generateOperationId: nextOperationId,
      });

      expect(item.currentStock).toBe(30);
      expect(operationId).toBe('op-1');

      const cached = await readStockWorkingSetItem(fake.db as any, ITEM_ID);
      expect(cached!.currentStock).toBe(30);
      expect(cached!.pendingOperationIds).toEqual(['op-1']);

      expect(fake.tables.sync_operations).toHaveLength(1);
      const op = fake.tables.sync_operations[0];
      expect(op.priority).toBe(ReplayPriority.INVENTORY_MEDIUM);
      expect(op.domain).toBe(INVENTORY_SYNC_DOMAIN);
      expect(op.entity_type).toBe(STOCK_RECEIVE_ENTITY_TYPE);
      expect(op.entity_id).toBe(ITEM_ID);
      expect(JSON.parse(op.payload_json as string).quantity).toBe(20);
    });

    it('throws when no cache exists yet and no knownItem is supplied to seed it', async () => {
      await expect(
        recordOfflineStockReceive(fake.db as any, {
          itemId: ITEM_ID,
          clinicId: CLINIC_ID,
          deviceId: DEVICE_ID,
          userId: USER_ID,
          payload: { quantity: 5 },
          generateOperationId: nextOperationId,
        }),
      ).rejects.toThrow();
    });
  });

  describe('recordOfflineStockDispense', () => {
    it('deducts the dispensed quantity from the cached working-set stock and enqueues a STOCK_DISPENSE envelope', async () => {
      await recordOfflineStockReceive(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem({ currentStock: 10 }),
        payload: { quantity: 0 },
        generateOperationId: nextOperationId,
      });

      const { item } = await recordOfflineStockDispense(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        payload: { quantity: 3, consultationId: null, invoiceId: null, ownerId: null },
        generateOperationId: nextOperationId,
      });

      expect(item.currentStock).toBe(7);
      const op = fake.tables.sync_operations[1];
      expect(op.entity_type).toBe(STOCK_DISPENSE_ENTITY_TYPE);
      expect(op.priority).toBe(ReplayPriority.INVENTORY_MEDIUM);
    });
  });

  describe('recordOfflineStockAdjust', () => {
    it('applies an "add" adjustment as a positive delta', async () => {
      const { item } = await recordOfflineStockAdjust(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem({ currentStock: 10 }),
        payload: { quantity: 4, type: 'add', reason: 'stock-take' },
        generateOperationId: nextOperationId,
      });
      expect(item.currentStock).toBe(14);
      expect(fake.tables.sync_operations[0].entity_type).toBe(STOCK_ADJUST_ENTITY_TYPE);
    });

    it('applies a "remove" adjustment as a negative delta', async () => {
      const { item } = await recordOfflineStockAdjust(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem({ currentStock: 10 }),
        payload: { quantity: 4, type: 'remove', reason: 'damage' },
        generateOperationId: nextOperationId,
      });
      expect(item.currentStock).toBe(6);
    });
  });

  describe('recordOfflineStockReturn', () => {
    it('restores quantity to the cached item and enqueues a STOCK_RETURN envelope carrying the movementId', async () => {
      const { item } = await recordOfflineStockReturn(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem({ currentStock: 10 }),
        payload: { movementId: 'movement-1', itemId: ITEM_ID, quantity: 2 },
        generateOperationId: nextOperationId,
      });

      expect(item.currentStock).toBe(12);
      const op = fake.tables.sync_operations[0];
      expect(op.entity_type).toBe(STOCK_RETURN_ENTITY_TYPE);
      expect(op.entity_id).toBe(ITEM_ID);
      expect(JSON.parse(op.payload_json as string).movementId).toBe('movement-1');
    });
  });

  describe('same-day working-set scoping (D-15 to D-17)', () => {
    it('writes the cached item through the shared same-day working-set snapshot mechanism (D-35)', async () => {
      await recordOfflineStockReceive(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem(),
        payload: { quantity: 1 },
        generateOperationId: nextOperationId,
      });

      const row = fake.tables.inventory_working_set_snapshot[0];
      expect(row).toBeDefined();
      expect(row.is_fully_editable).toBe(1);
    });
  });

  describe('cacheScannedStockItem (barcode-scan working-set seeding, D-15 to D-17)', () => {
    it('seeds the working-set cache the first time a scanned item is seen, so the scanner stays usable offline from local data', async () => {
      const cached = await cacheScannedStockItem(fake.db as any, {
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        ...knownItem({ currentStock: 25 }),
      });

      expect(cached.currentStock).toBe(25);
      expect(cached.pendingOperationIds).toEqual([]);

      const stored = await readStockWorkingSetItem(fake.db as any, ITEM_ID);
      expect(stored).toEqual(cached);
    });

    it('never clobbers an already-cached item with in-flight local stock deltas just because it was scanned again', async () => {
      await recordOfflineStockDispense(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem({ currentStock: 10 }),
        payload: { quantity: 4 },
        generateOperationId: nextOperationId,
      });

      const rescanned = await cacheScannedStockItem(fake.db as any, {
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        ...knownItem({ currentStock: 999 }), // a stale server figure the scan happened to carry
      });

      // The locally-known truth (10 - 4 = 6, with its pending operation)
      // wins -- a bare re-scan must never silently discard an unreplayed
      // local stock action.
      expect(rescanned.currentStock).toBe(6);
      expect(rescanned.pendingOperationIds).toEqual(['op-1']);
    });
  });

  describe('accumulating multiple offline actions on the same item', () => {
    it('stacks pendingOperationIds and compounds the running stock across receive then dispense', async () => {
      await recordOfflineStockReceive(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        knownItem: knownItem({ currentStock: 10 }),
        payload: { quantity: 5 },
        generateOperationId: nextOperationId,
      });
      const { item } = await recordOfflineStockDispense(fake.db as any, {
        itemId: ITEM_ID,
        clinicId: CLINIC_ID,
        deviceId: DEVICE_ID,
        userId: USER_ID,
        payload: { quantity: 2 },
        generateOperationId: nextOperationId,
      });

      expect(item.currentStock).toBe(13); // 10 + 5 - 2
      expect(item.pendingOperationIds).toEqual(['op-1', 'op-2']);
    });
  });
});

describe('useOfflineStockActions.ts (RN import -- exercised via source assertions, matching this repo\'s established convention for RN-locked files)', () => {
  it('imports INVENTORY_MEDIUM and the offline stock action recorders, and updates a local pending-sync store', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../hooks/useOfflineStockActions.ts'),
      'utf-8',
    );

    expect(source).toMatch(/INVENTORY_MEDIUM/);
    expect(source).toMatch(/recordOfflineStockReceive/);
    expect(source).toMatch(/recordOfflineStockDispense/);
    expect(source).toMatch(/recordOfflineStockAdjust/);
    expect(source).toMatch(/recordOfflineStockReturn/);
    expect(source).toMatch(/readStockWorkingSetItem/);
    expect(source).toMatch(/SyncVisibilityState/);
  });
});
