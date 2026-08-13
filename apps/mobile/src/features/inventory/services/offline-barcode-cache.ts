import * as SQLite from 'expo-sqlite';
import { apiClient } from '../../../lib/api';
import type { BarcodeFormat } from '@breeyo/types';

/**
 * D-19: offline barcode-to-item cache backed by expo-sqlite. The camera
 * scanner (Plan 05-05 Task 2) looks up a scanned code here first when
 * offline; `OfflineQueueService` (offline-queue.service.ts) shares this
 * same on-device database for the pending-operations table.
 */
export const OFFLINE_DB_NAME = 'breeyo-inventory-cache';

let sharedDb: SQLite.SQLiteDatabase | null = null;

/**
 * Lazily opens (and caches) the single on-device sqlite database shared by
 * the barcode cache and the offline operations queue. Both services accept
 * an injected `db` in their constructors for testability — this function is
 * only reached in real app code, never in unit tests.
 */
export function getInventoryOfflineDb(): SQLite.SQLiteDatabase {
  if (!sharedDb) {
    sharedDb = SQLite.openDatabaseSync(OFFLINE_DB_NAME);
  }
  return sharedDb;
}

function initBarcodeCacheTables(db: SQLite.SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS barcode_cache (
      code TEXT PRIMARY KEY,
      format TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** The reduced item shape GET /inventory/barcode-catalog actually returns
 *  (inventory-item.repository.ts's getBarcodeCatalog) — not the full
 *  InventoryItem (no sellingPrice/parLevel/etc, just enough to resolve a
 *  scan to an item name + stock count while offline). */
export interface CachedCatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  barcodes: Array<{ code: string; format: BarcodeFormat }>;
}

export interface CachedBarcodeItem {
  code: string;
  format: BarcodeFormat;
  itemId: string;
  itemName: string;
  itemData: CachedCatalogItem;
  syncedAt: number;
}

interface BarcodeCacheRow {
  code: string;
  format: BarcodeFormat;
  item_id: string;
  item_name: string;
  item_data: string;
  synced_at: number;
}

interface CatalogResponse {
  data: { items: CachedCatalogItem[] };
}

const LAST_SYNC_KEY = 'last_barcode_sync';

export class OfflineBarcodeCache {
  private db: SQLite.SQLiteDatabase;

  constructor(db?: SQLite.SQLiteDatabase) {
    this.db = db ?? getInventoryOfflineDb();
    initBarcodeCacheTables(this.db);
  }

  /**
   * Pulls the barcode catalog from GET /inventory/barcode-catalog, using the
   * previous sync's timestamp as `updatedSince` for an incremental sync
   * (only items updated since last time come back). Returns the number of
   * barcode rows written.
   */
  async syncFromServer(token: string): Promise<number> {
    const updatedSince = this.getLastSyncTime();
    const qs = updatedSince ? `?updatedSince=${encodeURIComponent(updatedSince.toISOString())}` : '';
    const response = await apiClient<CatalogResponse>(`/api/v1/inventory/barcode-catalog${qs}`, {
      token,
    });

    const now = Date.now();
    let written = 0;
    for (const item of response.data.items) {
      for (const barcode of item.barcodes) {
        this.db.runSync(
          'INSERT OR REPLACE INTO barcode_cache (code, format, item_id, item_name, item_data, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
          [barcode.code, barcode.format, item.id, item.name, JSON.stringify(item), now],
        );
        written++;
      }
    }
    this.db.runSync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [
      LAST_SYNC_KEY,
      new Date(now).toISOString(),
    ]);
    return written;
  }

  /** Looks up a scanned barcode in the local cache. Returns null when the
   *  code isn't cached (unknown barcode -- D-14 prompt in the scanner UI). */
  lookupBarcode(code: string): CachedBarcodeItem | null {
    const row = this.db.getFirstSync<BarcodeCacheRow>('SELECT * FROM barcode_cache WHERE code = ?', [code]);
    if (!row) return null;
    return {
      code: row.code,
      format: row.format,
      itemId: row.item_id,
      itemName: row.item_name,
      itemData: JSON.parse(row.item_data),
      syncedAt: row.synced_at,
    };
  }

  /** Timestamp of the last successful catalog sync, for the "last synced
   *  X min ago" caption per the UI-SPEC's offline banner. */
  getLastSyncTime(): Date | null {
    const row = this.db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [
      LAST_SYNC_KEY,
    ]);
    return row ? new Date(row.value) : null;
  }

  /** Total number of cached barcode rows, for diagnostics/settings display. */
  getCacheCount(): number {
    const row = this.db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM barcode_cache');
    return row?.count ?? 0;
  }
}
