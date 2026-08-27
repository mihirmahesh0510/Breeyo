import * as SQLite from 'expo-sqlite';
import type {
  OfflineOperationEnvelope,
  ReplayPriority,
  ResolutionState,
  SyncConflictEnvelope,
  SyncFailureTaskRecord,
} from '@breeyo/types';

/**
 * On-device database name for the Phase 10 offline-sync ledger. Deliberately
 * separate from `apps/mobile/src/features/inventory/services/offline-barcode-cache.ts`'s
 * `breeyo-inventory-cache` -- that database predates Phase 10 and stays
 * scoped to inventory-only barcode/pending-operation state; this one is the
 * cross-domain replay ledger + same-day working-set cache shared by queue,
 * EMR, and inventory domain adapters (T-10-02: keeping the local cache
 * narrow and named per-purpose makes it easy to audit exactly what is
 * mirrored on-device).
 */
export const OFFLINE_SYNC_DB_NAME = 'breeyo-offline-sync';

let sharedDb: SQLite.SQLiteDatabase | null = null;

/**
 * Lazily opens (and caches) the single on-device sqlite database for the
 * offline-sync ledger. Only reached from real app code -- every exported
 * function in this module accepts an injected `db` so unit tests never open
 * a real (native) database (matches the inventory module's
 * `getInventoryOfflineDb` convention).
 */
export async function getOfflineSyncDb(): Promise<SQLite.SQLiteDatabase> {
  if (!sharedDb) {
    sharedDb = await SQLite.openDatabaseAsync(OFFLINE_SYNC_DB_NAME);
    await initializeOfflineDb(sharedDb);
  }
  return sharedDb;
}

/** The four same-day working-set snapshot tables (D-15 to D-17, D-35). */
export const WORKING_SET_SNAPSHOT_TABLES = [
  'queue_snapshot',
  'active_patient_snapshot',
  'consultation_draft_snapshot',
  'inventory_working_set_snapshot',
] as const;
export type WorkingSetSnapshotTable = (typeof WORKING_SET_SNAPSHOT_TABLES)[number];

const WORKING_SET_ANCHOR_META_KEY = 'working_set_anchored_at';

/**
 * Creates every Phase 10 offline-sync table if it does not already exist.
 * Idempotent and safe to call on every app start (Expo SQLite has no
 * built-in migration runner, so `CREATE TABLE IF NOT EXISTS` is the
 * project's existing convention -- see `offline-barcode-cache.ts`).
 *
 * `sync_operations` / `sync_operation_attempts` mirror `OfflineOperationEnvelope`
 * / `OfflineOperationAttempt` from `@breeyo/types`; `sync_conflicts` /
 * `sync_failure_tasks` mirror `SyncConflictEnvelope` / `SyncFailureTaskRecord`
 * so a locally-cached conflict or failure task can be rendered in the
 * failure center even before the device reconnects to refresh it from the
 * server. The four `*_snapshot` tables are the same-day working set (D-15 to
 * D-17) and all carry `working_set_anchored_at` (D-35).
 */
export async function initializeOfflineDb(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_operations (
      operation_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      clinic_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      priority TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_operations_priority ON sync_operations (priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_operations_synced ON sync_operations (synced_at);

    CREATE TABLE IF NOT EXISTS sync_operation_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      clinic_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      attempted_at TEXT NOT NULL,
      succeeded INTEGER NOT NULL,
      error_code TEXT,
      error_message TEXT,
      FOREIGN KEY (operation_id) REFERENCES sync_operations (operation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_operation_attempts_operation ON sync_operation_attempts (operation_id, attempt_number);

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      conflict_id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      local_payload_json TEXT NOT NULL,
      server_payload_json TEXT NOT NULL,
      recommended_owner_user_id TEXT,
      resolution_owner_user_id TEXT,
      resolution_state TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolution ON sync_conflicts (resolution_state, severity);

    CREATE TABLE IF NOT EXISTS sync_failure_tasks (
      task_id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      originating_user_id TEXT NOT NULL,
      current_owner_user_id TEXT NOT NULL,
      guided_retry_count INTEGER NOT NULL DEFAULT 0,
      resolution_state TEXT NOT NULL,
      next_suggested_action TEXT NOT NULL,
      last_attempted_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sync_failure_tasks_owner ON sync_failure_tasks (current_owner_user_id, resolution_state);

    CREATE TABLE IF NOT EXISTS queue_snapshot (
      entity_id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      record_date TEXT NOT NULL,
      working_set_anchored_at TEXT NOT NULL,
      is_fully_editable INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_patient_snapshot (
      entity_id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      record_date TEXT NOT NULL,
      working_set_anchored_at TEXT NOT NULL,
      is_fully_editable INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consultation_draft_snapshot (
      entity_id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      record_date TEXT NOT NULL,
      working_set_anchored_at TEXT NOT NULL,
      is_fully_editable INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_working_set_snapshot (
      entity_id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      record_date TEXT NOT NULL,
      working_set_anchored_at TEXT NOT NULL,
      is_fully_editable INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * Runs `task` inside a single Expo SQLite async transaction so an enqueue
 * (or a snapshot write) either fully commits or fully rolls back -- never a
 * partial write that a crash mid-write could leave behind. Every write in
 * this module goes through this helper rather than a bare `execAsync`.
 */
export async function writeOfflineTransaction(db: SQLite.SQLiteDatabase, task: () => Promise<void>): Promise<void> {
  await db.withTransactionAsync(task);
}

export interface EnqueueOperationInput {
  operationId: string;
  deviceId: string;
  clinicId: string;
  userId: string;
  domain: string;
  entityType: string;
  entityId: string;
  priority: string;
  payload: unknown;
  createdAt: string;
}

/**
 * Persists one offline operation into the replay ledger. Wrapped in
 * `writeOfflineTransaction` (via a prepared statement, finalized in a
 * `finally` block so a thrown error never leaks a dangling statement handle)
 * so a crash between preparing and executing the insert cannot leave a
 * half-written row.
 */
export async function enqueueOperation(db: SQLite.SQLiteDatabase, input: EnqueueOperationInput): Promise<void> {
  await writeOfflineTransaction(db, async () => {
    const statement = await db.prepareAsync(
      `INSERT INTO sync_operations
        (operation_id, device_id, clinic_id, user_id, domain, entity_type, entity_id, priority, payload_json, created_at, synced_at)
       VALUES ($operationId, $deviceId, $clinicId, $userId, $domain, $entityType, $entityId, $priority, $payloadJson, $createdAt, NULL)`,
    );
    try {
      await statement.executeAsync({
        $operationId: input.operationId,
        $deviceId: input.deviceId,
        $clinicId: input.clinicId,
        $userId: input.userId,
        $domain: input.domain,
        $entityType: input.entityType,
        $entityId: input.entityId,
        $priority: input.priority,
        $payloadJson: JSON.stringify(input.payload),
        $createdAt: input.createdAt,
      });
    } finally {
      await statement.finalizeAsync();
    }
  });
}

/**
 * One `sync_operations` row still awaiting replay, reconstructed into the
 * exact `OfflineOperationEnvelope` shape `buildQueueCheckInEnvelope` /
 * `buildStockReceiveEnvelope` / `buildConsultationDraftEnvelope` (and their
 * siblings) build on write -- so a real `ReplayCycleDeps.getPendingOperations`
 * (F2: `syncCoordinator.ts`'s `runReplayCycle` previously had zero
 * production callers) can hand `runReplayCycle` a `ReplayableOperation`
 * without a second, parallel definition of what an envelope looks like.
 */
export interface PendingSyncOperation {
  operationId: string;
  priority: ReplayPriority;
  envelope: OfflineOperationEnvelope;
}

/**
 * Read counterpart to `enqueueOperation`, scoped to one replay priority tier
 * and ordered oldest-first (D-12 to D-14: the coordinator always replays the
 * head of a tier's backlog next). Only `synced_at IS NULL` rows are pending;
 * a row `markSyncOperationSynced` has already stamped never comes back here.
 */
export async function listPendingSyncOperationsByPriority(
  db: SQLite.SQLiteDatabase,
  priority: ReplayPriority,
): Promise<PendingSyncOperation[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM sync_operations WHERE priority = $priority AND synced_at IS NULL ORDER BY created_at ASC',
    { $priority: priority },
  );
  return rows.map((row) => ({
    operationId: row.operation_id as string,
    priority: row.priority as ReplayPriority,
    envelope: {
      deviceId: row.device_id as string,
      operationId: row.operation_id as string,
      clinicId: row.clinic_id as string,
      userId: row.user_id as string,
      domain: row.domain as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      priority: row.priority as ReplayPriority,
      createdAt: row.created_at as string,
      payload: JSON.parse(row.payload_json as string),
    },
  }));
}

/**
 * Write counterpart: marks one replay ledger row as durably acknowledged by
 * the server so it stops being returned by `listPendingSyncOperationsByPriority`.
 * Mirrors `enqueueOperation`'s transaction-wrapped convention.
 */
export async function markSyncOperationSynced(db: SQLite.SQLiteDatabase, operationId: string): Promise<void> {
  await writeOfflineTransaction(db, async () => {
    await db.runAsync('UPDATE sync_operations SET synced_at = $syncedAt WHERE operation_id = $operationId', {
      $syncedAt: new Date().toISOString(),
      $operationId: operationId,
    });
  });
}

/**
 * Returns the current working-set anchor, setting it the first time this is
 * called after the device goes offline (D-35). Every subsequent call during
 * the same offline stretch returns the SAME stored value -- this function
 * never calls `Date.now()`/`new Date()` again once a value exists, which is
 * exactly what prevents the "recomputed at local midnight" bug D-35 rules
 * out: an overnight shift never sees the anchor silently roll forward to a
 * new calendar day just because the wall clock crossed midnight while still
 * offline.
 *
 * `clearWorkingSetAnchor` should be called once the device fully reconnects
 * and replay completes, so the NEXT offline stretch gets its own fresh
 * anchor rather than reusing a stale one.
 */
export async function getOrCreateWorkingSetAnchor(db: SQLite.SQLiteDatabase): Promise<string> {
  const existing = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = $key',
    { $key: WORKING_SET_ANCHOR_META_KEY },
  );
  if (existing?.value) {
    return existing.value;
  }

  const anchoredAt = new Date().toISOString();
  await writeOfflineTransaction(db, async () => {
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_meta (key, value) VALUES ($key, $value)',
      { $key: WORKING_SET_ANCHOR_META_KEY, $value: anchoredAt },
    );
  });
  return anchoredAt;
}

/** Clears the working-set anchor so the next offline stretch gets a fresh one. */
export async function clearWorkingSetAnchor(db: SQLite.SQLiteDatabase): Promise<void> {
  await writeOfflineTransaction(db, async () => {
    await db.runAsync('DELETE FROM sync_meta WHERE key = $key', { $key: WORKING_SET_ANCHOR_META_KEY });
  });
}

/**
 * D-35: a record is still inside the fully-editable same-day working set if
 * its own record date is on or after the FROZEN anchor day -- not "today" as
 * recomputed against the device's advancing clock. Both inputs are ISO
 * date(-time) strings; only the leading `YYYY-MM-DD` is compared, and
 * neither this function nor its caller re-derives "today" from `Date.now()`,
 * which is what allows a record from before midnight to stay editable after
 * midnight during the same continuous offline stretch.
 */
export function isWithinWorkingSet(workingSetAnchoredAt: string, recordDateIso: string): boolean {
  const anchorDay = workingSetAnchoredAt.slice(0, 10);
  const recordDay = recordDateIso.slice(0, 10);
  return recordDay >= anchorDay;
}

export interface WorkingSetSnapshotInput {
  entityId: string;
  clinicId: string;
  deviceId: string;
  data: unknown;
  recordDate: string;
}

/**
 * Writes (or replaces) one row of a same-day working-set snapshot table,
 * stamping it with the current offline-session anchor (creating that anchor
 * if this is the first snapshot write since going offline) and the
 * `isFullyEditable` verdict `isWithinWorkingSet` derives from it (D-35).
 */
export async function writeWorkingSetSnapshot(
  db: SQLite.SQLiteDatabase,
  table: WorkingSetSnapshotTable,
  input: WorkingSetSnapshotInput,
): Promise<void> {
  const workingSetAnchoredAt = await getOrCreateWorkingSetAnchor(db);
  const isFullyEditable = isWithinWorkingSet(workingSetAnchoredAt, input.recordDate);
  const updatedAt = new Date().toISOString();

  await writeOfflineTransaction(db, async () => {
    const statement = await db.prepareAsync(
      `INSERT OR REPLACE INTO ${table}
        (entity_id, clinic_id, device_id, data_json, record_date, working_set_anchored_at, is_fully_editable, updated_at)
       VALUES ($entityId, $clinicId, $deviceId, $dataJson, $recordDate, $workingSetAnchoredAt, $isFullyEditable, $updatedAt)`,
    );
    try {
      await statement.executeAsync({
        $entityId: input.entityId,
        $clinicId: input.clinicId,
        $deviceId: input.deviceId,
        $dataJson: JSON.stringify(input.data),
        $recordDate: input.recordDate,
        $workingSetAnchoredAt: workingSetAnchoredAt,
        $isFullyEditable: isFullyEditable ? 1 : 0,
        $updatedAt: updatedAt,
      });
    } finally {
      await statement.finalizeAsync();
    }
  });
}

/**
 * Plan 10-05 Task 1: read counterparts for the sync-visibility aggregate
 * (`useSyncStatus.ts`). `sync_operations`/`sync_failure_tasks`/`sync_conflicts`
 * are all written elsewhere (the coordinator, replay ingress acks, and
 * domain adapters); these are the first reads of them for anything other
 * than replay itself, so the badge/failure center can render the exact same
 * locally-cached state without a second source of truth.
 */

/** A row still awaiting replay (`synced_at IS NULL`) -- D-18/D-19's PENDING count. */
export async function countPendingSyncOperations(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM sync_operations WHERE synced_at IS NULL',
  );
  return row?.count ?? 0;
}

/** D-11: every failure task that has not reached RESOLVED yet. */
export async function listUnresolvedSyncFailureTasks(db: SQLite.SQLiteDatabase): Promise<SyncFailureTaskRecord[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM sync_failure_tasks WHERE resolution_state != 'RESOLVED'",
  );
  return rows.map((row) => ({
    taskId: row.task_id as string,
    clinicId: row.clinic_id as string,
    operationId: row.operation_id as string,
    domain: row.domain as string,
    originatingUserId: row.originating_user_id as string,
    currentOwnerUserId: row.current_owner_user_id as string,
    guidedRetryCount: row.guided_retry_count as number,
    resolutionState: row.resolution_state as ResolutionState,
    nextSuggestedAction: row.next_suggested_action as string,
    lastAttemptedAt: row.last_attempted_at as string,
    createdAt: row.created_at as string,
  }));
}

/** D-11: every conflict record that has not reached RESOLVED yet. */
export async function listUnresolvedSyncConflicts(db: SQLite.SQLiteDatabase): Promise<SyncConflictEnvelope[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM sync_conflicts WHERE resolution_state != 'RESOLVED'",
  );
  return rows.map((row) => ({
    conflictId: row.conflict_id as string,
    clinicId: row.clinic_id as string,
    deviceId: row.device_id as string,
    operationId: row.operation_id as string,
    domain: row.domain as string,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string,
    severity: row.severity as SyncConflictEnvelope['severity'],
    localPayload: JSON.parse(row.local_payload_json as string),
    serverPayload: JSON.parse(row.server_payload_json as string),
    recommendedOwnerUserId: (row.recommended_owner_user_id as string | null) ?? undefined,
    resolutionOwnerUserId: (row.resolution_owner_user_id as string | null) ?? undefined,
    resolutionState: row.resolution_state as ResolutionState,
    createdAt: row.created_at as string,
  }));
}

export interface WorkingSetSnapshotRow {
  entityId: string;
  clinicId: string;
  deviceId: string;
  data: unknown;
  recordDate: string;
  workingSetAnchoredAt: string;
  isFullyEditable: boolean;
  updatedAt: string;
}

/**
 * Read counterpart to `writeWorkingSetSnapshot` (Plan 10-03 Task 1) -- until
 * now no domain adapter needed to read a same-day working-set snapshot back
 * (queue/inventory only ever write one to render optimistically off other
 * in-memory state), but the offline consultation draft store needs to
 * restore a persisted draft across an app restart, which means reading
 * `consultation_draft_snapshot` back out. Returns `null` when nothing has
 * been snapshotted for this entity, exactly mirroring `loadDraft`'s
 * "no draft yet" contract on the server side.
 */
export async function readWorkingSetSnapshot(
  db: SQLite.SQLiteDatabase,
  table: WorkingSetSnapshotTable,
  entityId: string,
): Promise<WorkingSetSnapshotRow | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE entity_id = $entityId`,
    { $entityId: entityId },
  );
  if (!row) {
    return null;
  }
  return {
    entityId: row.entity_id as string,
    clinicId: row.clinic_id as string,
    deviceId: row.device_id as string,
    data: JSON.parse(row.data_json as string),
    recordDate: row.record_date as string,
    workingSetAnchoredAt: row.working_set_anchored_at as string,
    isFullyEditable: Boolean(row.is_fully_editable),
    updatedAt: row.updated_at as string,
  };
}
