import * as SQLite from 'expo-sqlite';
import { apiClient, ApiClientError } from '../../../lib/api';
import { getInventoryOfflineDb } from './offline-barcode-cache';

/**
 * D-53: the three operation types the offline queue replays through the
 * single generic dispatcher POST /api/v1/inventory/sync-operation, instead
 * of calling /receive, /dispense, /adjust directly (matches the API's own
 * `SYNC_OPERATION_TYPES` in apps/api/src/modules/inventory/sync-operation.service.ts).
 */
export const SYNC_OPERATION_TYPES = ['receipt', 'dispense', 'adjustment'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export interface PendingOperationError {
  clientOperationId: string;
  operationType: SyncOperationType;
  itemId: string;
  code: string;
  message: string;
  /** True when this failure means "device has no network path to the API"
   *  (a raw fetch-level error), as opposed to a real HTTP response the
   *  server sent back (a structured ApiClientError, meaning we ARE online
   *  but the operation itself failed). D-59: the mobile retry banner uses
   *  this to decide whether to show "offline, will retry" vs a real error
   *  the user needs to act on. */
  isConnectivityError: boolean;
}

export interface SyncPendingResult {
  synced: number;
  failed: boolean;
  error?: PendingOperationError;
}

export interface PendingOperation {
  id: number;
  clientOperationId: string;
  operationType: SyncOperationType;
  itemId: string;
  data: unknown;
  createdAt: number;
  synced: boolean;
}

interface PendingOperationRow {
  id: number;
  client_operation_id: string;
  operation_type: SyncOperationType;
  item_id: string;
  data: string;
  created_at: number;
  synced: number;
}

/**
 * RFC4122-v4-shaped UUID generated from Math.random. This is only ever used
 * as an idempotency key the server correlates a replay against (D-59) --
 * not a security-sensitive value -- so a cryptographically weak generator is
 * fine, and it avoids adding a new native dependency (`expo-crypto`) that
 * isn't installed anywhere else in this repo, purely for this one id.
 */
function generateClientOperationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Distinguishes a connectivity-level failure (fetch never reached the
 * server -- a plain TypeError in RN/web, or undici's "fetch failed") from a
 * structured `ApiClientError` (the server responded with a real HTTP
 * status, so the device IS online and the operation itself was rejected).
 * Exported so `useOfflineSync` can reuse the exact same classification when
 * a cache-sync call fails outside of `syncPending`'s own try/catch.
 */
export function isConnectivityError(error: unknown): boolean {
  if (error instanceof ApiClientError) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) return /network|fetch failed/i.test(error.message);
  return false;
}

function initPendingOperationsTable(db: SQLite.SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS pending_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_operation_id TEXT NOT NULL UNIQUE,
      operation_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function rowToPendingOperation(row: PendingOperationRow): PendingOperation {
  return {
    id: row.id,
    clientOperationId: row.client_operation_id,
    operationType: row.operation_type,
    itemId: row.item_id,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    synced: row.synced === 1,
  };
}

/**
 * D-19: pending stock-operation queue for offline scanning/dispensing.
 * Shares the same on-device sqlite database as `OfflineBarcodeCache`.
 */
export class OfflineQueueService {
  private db: SQLite.SQLiteDatabase;

  constructor(db?: SQLite.SQLiteDatabase) {
    this.db = db ?? getInventoryOfflineDb();
    initPendingOperationsTable(this.db);
  }

  /**
   * Queues an operation for later sync and generates a per-operation
   * `clientOperationId` so replaying it through POST /sync-operation is
   * safe even if the request is sent more than once (D-59's
   * already-applied idempotency mechanism on the API side keys off this
   * exact id). Returns the generated id.
   */
  enqueue(operationType: SyncOperationType, itemId: string, data: unknown): string {
    const clientOperationId = generateClientOperationId();
    this.db.runSync(
      'INSERT INTO pending_operations (client_operation_id, operation_type, item_id, data, created_at, synced) VALUES (?, ?, ?, ?, ?, ?)',
      [clientOperationId, operationType, itemId, JSON.stringify(data), Date.now(), 0],
    );
    return clientOperationId;
  }

  /** Count of operations not yet successfully synced. */
  getPendingCount(): number {
    const row = this.db.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM pending_operations WHERE synced = 0',
    );
    return row?.count ?? 0;
  }

  /** All unsynced operations, oldest first -- for a future retry/review UI (D-59). */
  getPendingOperations(): PendingOperation[] {
    const rows = this.db.getAllSync<PendingOperationRow>(
      'SELECT * FROM pending_operations WHERE synced = 0 ORDER BY created_at ASC',
    );
    return rows.map(rowToPendingOperation);
  }

  /**
   * Replays every unsynced operation through POST /inventory/sync-operation
   * in FIFO order (`created_at ASC`), stopping at the first failure so a
   * later operation that might depend on an earlier one's stock mutation
   * (e.g. two dispenses against the same batch) is never applied out of
   * order (RESEARCH.md Pitfall 3). Successfully replayed operations are
   * marked `synced = 1` (call `clearSynced()` afterwards for housekeeping).
   */
  async syncPending(token: string): Promise<SyncPendingResult> {
    const rows = this.db.getAllSync<PendingOperationRow>(
      'SELECT * FROM pending_operations WHERE synced = 0 ORDER BY created_at ASC',
    );

    let synced = 0;
    for (const row of rows) {
      try {
        await apiClient('/api/v1/inventory/sync-operation', {
          method: 'POST',
          token,
          body: JSON.stringify({
            operationType: row.operation_type,
            itemId: row.item_id,
            clientOperationId: row.client_operation_id,
            data: JSON.parse(row.data),
          }),
        });
        this.db.runSync('UPDATE pending_operations SET synced = 1 WHERE id = ?', [row.id]);
        synced++;
      } catch (err) {
        const apiErr = err instanceof ApiClientError ? err : null;
        const connectivityError = isConnectivityError(err);
        return {
          synced,
          failed: true,
          error: {
            clientOperationId: row.client_operation_id,
            operationType: row.operation_type,
            itemId: row.item_id,
            code: apiErr?.code ?? (connectivityError ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR'),
            message: apiErr?.message ?? (connectivityError ? 'No network connection' : 'Sync failed'),
            isConnectivityError: connectivityError,
          },
        };
      }
    }

    return { synced, failed: false };
  }

  /** Deletes already-synced rows (housekeeping, run after a successful `syncPending`). */
  clearSynced(): void {
    this.db.runSync('DELETE FROM pending_operations WHERE synced = 1');
  }
}
