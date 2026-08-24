import { describe, it, expect, vi, beforeEach } from 'vitest';

// expo-sqlite is a native module; never import the real thing in this
// vitest "node" environment (matches apps/mobile/tests/inventory/offline-queue.service.test.ts's mocking convention).
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(() => {
    throw new Error('openDatabaseAsync should never be called when a db is injected in tests');
  }),
}));

import {
  initializeOfflineDb,
  writeOfflineTransaction,
  enqueueOperation,
  getOrCreateWorkingSetAnchor,
  clearWorkingSetAnchor,
  isWithinWorkingSet,
  writeWorkingSetSnapshot,
} from '../db/offlineDb';

/**
 * Minimal in-memory fake of the Expo SQLite async `SQLiteDatabase` surface
 * this module actually uses: `execAsync`, `withTransactionAsync`,
 * `prepareAsync`/`executeAsync`/`finalizeAsync`, `runAsync`, `getFirstAsync`.
 * `execAsync` just records that schema setup ran (this repo's other
 * expo-sqlite fakes don't parse real DDL either -- see
 * apps/mobile/tests/inventory/offline-queue.service.test.ts).
 */
function createFakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    sync_meta: [],
    sync_operations: [],
    queue_snapshot: [],
    active_patient_snapshot: [],
    consultation_draft_snapshot: [],
    inventory_working_set_snapshot: [],
  };

  const db = {
    execAsync: vi.fn(async () => undefined),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => {
      await task();
    }),
    runAsync: vi.fn(async (sql: string, params: Record<string, unknown>) => {
      if (/^INSERT OR REPLACE INTO sync_meta/.test(sql)) {
        tables.sync_meta = tables.sync_meta.filter((r) => r.key !== params.$key);
        tables.sync_meta.push({ key: params.$key, value: params.$value });
      } else if (/^DELETE FROM sync_meta/.test(sql)) {
        tables.sync_meta = tables.sync_meta.filter((r) => r.key !== params.$key);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getFirstAsync: vi.fn(async (sql: string, params: Record<string, unknown>) => {
      if (/FROM sync_meta/.test(sql)) {
        return tables.sync_meta.find((r) => r.key === params.$key) ?? null;
      }
      return null;
    }),
    prepareAsync: vi.fn(async (sql: string) => ({
      executeAsync: vi.fn(async (params: Record<string, unknown>) => {
        const tableMatch = /INSERT (?:OR REPLACE )?INTO (\w+)/.exec(sql);
        const table = tableMatch?.[1];
        if (table && tables[table]) {
          const row: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(params)) {
            // Named params are camelCase ($entityId); columns are snake_case
            // (entity_id) -- convert so the fake's row shape matches the
            // real sqlite column names the implementation and this test's
            // assertions both expect.
            const columnName = key
              .slice(1)
              .replace(/([A-Z])/g, '_$1')
              .toLowerCase();
            row[columnName] = value;
          }
          if (sql.startsWith('INSERT OR REPLACE') && row.entity_id) {
            tables[table] = tables[table].filter((r) => r.entity_id !== row.entity_id);
          }
          if (sql.startsWith('INSERT OR REPLACE') && row.operation_id && table === 'sync_operations') {
            tables[table] = tables[table].filter((r) => r.operation_id !== row.operation_id);
          }
          tables[table].push(row);
        }
        return { changes: 1, lastInsertRowId: 0 };
      }),
      finalizeAsync: vi.fn(async () => undefined),
    })),
    __tables: tables,
  };

  return db as unknown as import('expo-sqlite').SQLiteDatabase & { __tables: typeof tables };
}

describe('offlineDb', () => {
  let db: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    db = createFakeDb();
  });

  it('initializeOfflineDb runs schema setup exactly once via execAsync', async () => {
    await initializeOfflineDb(db);
    expect(db.execAsync).toHaveBeenCalledTimes(1);
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('sync_operations'));
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('sync_conflicts'));
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('sync_failure_tasks'));
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('queue_snapshot'));
  });

  it('writeOfflineTransaction wraps the task in withTransactionAsync', async () => {
    const task = vi.fn(async () => undefined);
    await writeOfflineTransaction(db, task);
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('enqueueOperation writes through a transaction using a prepared statement', async () => {
    await enqueueOperation(db, {
      operationId: 'op-1',
      deviceId: 'device-1',
      clinicId: 'clinic-1',
      userId: 'user-1',
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: 'entity-1',
      priority: 'QUEUE_HIGH',
      payload: { foo: 'bar' },
      createdAt: '2026-08-24T10:00:00.000Z',
    });

    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.__tables.sync_operations).toHaveLength(1);
    expect(db.__tables.sync_operations[0]).toMatchObject({ operation_id: 'op-1', clinic_id: 'clinic-1' });
  });

  it('getOrCreateWorkingSetAnchor sets the anchor once and returns the same value on later calls', async () => {
    const first = await getOrCreateWorkingSetAnchor(db);
    const second = await getOrCreateWorkingSetAnchor(db);
    expect(second).toBe(first);
    // Only one write should have happened even though the getter was called twice.
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('clearWorkingSetAnchor lets the next call mint a fresh anchor', async () => {
    const first = await getOrCreateWorkingSetAnchor(db);
    await clearWorkingSetAnchor(db);
    // Force a later timestamp so a fresh anchor is distinguishable.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    const second = await getOrCreateWorkingSetAnchor(db);
    vi.useRealTimers();
    expect(second).not.toBe(first);
  });

  it('isWithinWorkingSet stays true across a midnight rollover during the same offline stretch (D-35)', () => {
    const anchoredAt = '2026-08-24T23:50:00.000Z';
    // A record touched just before the anchor moment.
    expect(isWithinWorkingSet(anchoredAt, '2026-08-24T23:55:00.000Z')).toBe(true);
    // A record created hours later, after midnight, during the SAME
    // continuous offline stretch -- must stay editable, not demoted just
    // because the calendar day rolled over.
    expect(isWithinWorkingSet(anchoredAt, '2026-08-25T03:00:00.000Z')).toBe(true);
  });

  it('isWithinWorkingSet demotes records from before the anchor day', () => {
    const anchoredAt = '2026-08-24T23:50:00.000Z';
    expect(isWithinWorkingSet(anchoredAt, '2026-08-20T09:00:00.000Z')).toBe(false);
  });

  it('writeWorkingSetSnapshot stamps rows with the anchor and computes isFullyEditable', async () => {
    await writeWorkingSetSnapshot(db, 'queue_snapshot', {
      entityId: 'queue-entry-1',
      clinicId: 'clinic-1',
      deviceId: 'device-1',
      data: { status: 'WAITING' },
      recordDate: new Date().toISOString(),
    });

    expect(db.__tables.queue_snapshot).toHaveLength(1);
    const row = db.__tables.queue_snapshot[0];
    expect(row.working_set_anchored_at).toBeTruthy();
    expect(row.is_fully_editable).toBe(1);
  });
});
