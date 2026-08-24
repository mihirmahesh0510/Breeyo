/**
 * Offline stock action persistence (Plan 10-04 Task 1, D-04, D-10, D-15 to
 * D-17). D-04 requires barcode scanning AND stock updates to support full
 * local stock actions on-device while offline, reconciling on reconnect --
 * this module is what makes an offline receive/dispense/adjust/return
 * durable and replayable, on top of Phase 5's existing offline barcode
 * lookup cache (`offline-barcode-cache.ts`) rather than duplicating it.
 *
 * Built directly on Plan 10-01's shared `offlineDb.ts`, the same way
 * `offlineConsultationDraftStore.ts` (Plan 10-03) is: `inventory_working_set_snapshot`
 * is the SAME same-day working-set table (D-15 to D-17, D-35) every other
 * domain adapter's snapshot lives in -- scoped here to items actively
 * scanned/acted upon today ("stock in motion"), not a full catalog mirror
 * (that broader, longer-lived catalog cache is Phase 5's
 * `OfflineBarcodeCache`, left untouched) -- and `sync_operations` is the SAME
 * replay ledger Plan 10-02/10-03 enqueue into, just tagged `INVENTORY_MEDIUM`
 * so `syncCoordinator.ts` replays it in its own tier (D-12 to D-14, D-37).
 *
 * No `expo-secure-store`/`expo-haptics`/`react-native` import here (matching
 * `offlineConsultationDraftStore.ts`'s own convention) -- this module only
 * needs `expo-sqlite` (via `offlineDb.ts`), so it stays directly testable
 * under vitest's plain-node environment. The caller (`useOfflineStockActions.ts`)
 * resolves `deviceId` itself, the same way `useOfflineQueueActions.ts` and
 * `useAutoSave.ts` do.
 */
import type * as SQLite from 'expo-sqlite';
import { ReplayPriority } from '@breeyo/types';
import type { OfflineOperationEnvelope } from '@breeyo/types';
import { enqueueOperation, readWorkingSetSnapshot, writeWorkingSetSnapshot } from '../../offline-sync/db/offlineDb';
import { ApiClientError } from '../../../lib/api';

/**
 * D-02: distinguishes "the server was never reached" (capture the stock
 * action locally and enqueue for replay) from "the server responded, and
 * rejected the request" (e.g. `INSUFFICIENT_STOCK`, a validation error -- a
 * real error that must surface to the caller, not be silently captured as
 * an offline action). Duplicated from `queue-offline-utils.ts`'s /
 * `offlineConsultationDraftStore.ts`'s own `isNetworkFailure` rather than
 * imported cross-feature, matching this repo's established per-feature
 * scoping convention -- `apiClient` only ever throws `ApiClientError` for a
 * request that reached the server and got a response.
 */
export function isNetworkFailure(error: unknown): boolean {
  return !(error instanceof ApiClientError);
}

/** Wire contract with `apps/api/src/modules/inventory/services/inventoryOfflineReplay.service.ts`. */
export const INVENTORY_SYNC_DOMAIN = 'inventory';
export const STOCK_RECEIVE_ENTITY_TYPE = 'STOCK_RECEIVE';
export const STOCK_DISPENSE_ENTITY_TYPE = 'STOCK_DISPENSE';
export const STOCK_ADJUST_ENTITY_TYPE = 'STOCK_ADJUST';
export const STOCK_RETURN_ENTITY_TYPE = 'STOCK_RETURN';

/**
 * D-12 to D-14, D-37: inventory replay always tags `INVENTORY_MEDIUM`, never
 * `QUEUE_HIGH`/`CLINICAL_MEDIUM` -- the shared `syncCoordinator.ts` (Plan
 * 10-01) owns tier ordering/preemption; this module never reimplements or
 * overrides it.
 */
export const INVENTORY_MEDIUM = ReplayPriority.INVENTORY_MEDIUM;

/** The minimal item view needed to seed the working-set cache the FIRST time
 *  an offline stock action touches an item this session (from Phase 5's
 *  online item fetch, barcode lookup, or offline barcode cache -- whichever
 *  the caller already has on hand). */
export interface StockActionKnownItem {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
}

/** The shape persisted in `inventory_working_set_snapshot.data_json`. */
export interface CachedStockWorkingSetItem extends StockActionKnownItem {
  /** Every locally-enqueued (not yet confirmed replayed) operationId that
   *  has touched this item's cached stock figure, oldest first. */
  pendingOperationIds: string[];
  updatedAt: string;
}

export interface StockReceivePayload {
  quantity: number;
  lotNumber?: string | null;
  expiryDate?: string | null;
  purchasePrice?: number | null;
  supplier?: string | null;
}

export interface StockDispensePayload {
  quantity: number;
  overrideBatchId?: string;
  consultationId?: string | null;
  invoiceId?: string | null;
  ownerId?: string | null;
}

export interface StockAdjustPayload {
  quantity: number;
  type: 'add' | 'remove';
  reason: string;
  notes?: string | null;
}

/** Return-to-stock always targets an already server-known StockMovement
 *  (D-57: the return action lives on an existing timeline row) -- an item
 *  dispensed itself while still offline (not yet replayed) cannot be
 *  returned offline in this plan; see 10-04-SUMMARY.md deviations. */
export interface StockReturnPayload {
  movementId: string;
  itemId: string;
  quantity: number;
}

interface BuildEnvelopeCommonInput {
  operationId: string;
  deviceId: string;
  clinicId: string;
  userId: string;
  createdAt: string;
}

export function buildStockReceiveEnvelope(
  input: BuildEnvelopeCommonInput & { itemId: string; payload: StockReceivePayload },
): OfflineOperationEnvelope<StockReceivePayload> {
  return {
    deviceId: input.deviceId,
    operationId: input.operationId,
    clinicId: input.clinicId,
    userId: input.userId,
    domain: INVENTORY_SYNC_DOMAIN,
    entityType: STOCK_RECEIVE_ENTITY_TYPE,
    entityId: input.itemId,
    priority: INVENTORY_MEDIUM,
    createdAt: input.createdAt,
    payload: input.payload,
  };
}

export function buildStockDispenseEnvelope(
  input: BuildEnvelopeCommonInput & { itemId: string; payload: StockDispensePayload },
): OfflineOperationEnvelope<StockDispensePayload> {
  return {
    deviceId: input.deviceId,
    operationId: input.operationId,
    clinicId: input.clinicId,
    userId: input.userId,
    domain: INVENTORY_SYNC_DOMAIN,
    entityType: STOCK_DISPENSE_ENTITY_TYPE,
    entityId: input.itemId,
    priority: INVENTORY_MEDIUM,
    createdAt: input.createdAt,
    payload: input.payload,
  };
}

export function buildStockAdjustEnvelope(
  input: BuildEnvelopeCommonInput & { itemId: string; payload: StockAdjustPayload },
): OfflineOperationEnvelope<StockAdjustPayload> {
  return {
    deviceId: input.deviceId,
    operationId: input.operationId,
    clinicId: input.clinicId,
    userId: input.userId,
    domain: INVENTORY_SYNC_DOMAIN,
    entityType: STOCK_ADJUST_ENTITY_TYPE,
    entityId: input.itemId,
    priority: INVENTORY_MEDIUM,
    createdAt: input.createdAt,
    payload: input.payload,
  };
}

export function buildStockReturnEnvelope(
  input: BuildEnvelopeCommonInput & { itemId: string; payload: StockReturnPayload },
): OfflineOperationEnvelope<StockReturnPayload> {
  return {
    deviceId: input.deviceId,
    operationId: input.operationId,
    clinicId: input.clinicId,
    userId: input.userId,
    domain: INVENTORY_SYNC_DOMAIN,
    entityType: STOCK_RETURN_ENTITY_TYPE,
    entityId: input.itemId,
    priority: INVENTORY_MEDIUM,
    createdAt: input.createdAt,
    payload: input.payload,
  };
}

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Read counterpart used by the scanner/hook to render an item's
 * currently-known (server figure plus any not-yet-replayed local deltas)
 * stock while offline. Returns `null` when nothing has been cached for this
 * item yet this offline session.
 */
export async function readStockWorkingSetItem(
  db: SQLite.SQLiteDatabase,
  itemId: string,
): Promise<CachedStockWorkingSetItem | null> {
  const row = await readWorkingSetSnapshot(db, 'inventory_working_set_snapshot', itemId);
  if (!row) return null;
  return row.data as CachedStockWorkingSetItem;
}

async function loadOrSeedWorkingSetItem(
  db: SQLite.SQLiteDatabase,
  itemId: string,
  knownItem?: StockActionKnownItem,
): Promise<CachedStockWorkingSetItem> {
  const existing = await readStockWorkingSetItem(db, itemId);
  if (existing) {
    return existing;
  }
  if (!knownItem) {
    throw new Error(
      `No cached working-set data for item ${itemId}, and no knownItem snapshot was supplied to seed it. ` +
        'The caller must have resolved the item (via barcode scan or a prior online fetch) before recording an offline stock action against it.',
    );
  }
  return { ...knownItem, pendingOperationIds: [], updatedAt: new Date().toISOString() };
}

export interface CacheScannedStockItemInput extends StockActionKnownItem {
  clinicId: string;
  deviceId: string;
  now?: () => Date;
}

/**
 * Seeds the same-day working-set cache from a resolved barcode scan (online
 * or from Phase 5's own `OfflineBarcodeCache`), so the scanner's quick
 * actions have local stock-in-motion data to work from the moment an item
 * is first scanned this session, per D-15 to D-17. Never overwrites an
 * already-cached row: if the item already has cached local stock (possibly
 * reflecting one or more not-yet-replayed offline actions), a bare re-scan
 * must not silently discard that in-flight local truth with a server figure
 * that may itself be stale by the time it was scanned.
 */
export async function cacheScannedStockItem(
  db: SQLite.SQLiteDatabase,
  input: CacheScannedStockItemInput,
): Promise<CachedStockWorkingSetItem> {
  const existing = await readStockWorkingSetItem(db, input.itemId);
  if (existing) {
    return existing;
  }

  const now = input.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const seeded: CachedStockWorkingSetItem = {
    itemId: input.itemId,
    name: input.name,
    category: input.category,
    unit: input.unit,
    currentStock: input.currentStock,
    pendingOperationIds: [],
    updatedAt: nowIso,
  };

  await writeWorkingSetSnapshot(db, 'inventory_working_set_snapshot', {
    entityId: input.itemId,
    clinicId: input.clinicId,
    deviceId: input.deviceId,
    data: seeded,
    recordDate: nowIso,
  });

  return seeded;
}

export interface RecordOfflineStockActionInput<TPayload> {
  itemId: string;
  clinicId: string;
  deviceId: string;
  userId: string;
  /** Required the FIRST time this item is touched while offline, if it has
   *  no cached working-set row yet. Ignored once a cached row exists. */
  knownItem?: StockActionKnownItem;
  payload: TPayload;
  /** Injectable for deterministic tests. */
  generateOperationId?: () => string;
  now?: () => Date;
}

export interface RecordOfflineStockActionResult {
  operationId: string;
  item: CachedStockWorkingSetItem;
}

async function persistAndEnqueue<TPayload>(
  db: SQLite.SQLiteDatabase,
  input: RecordOfflineStockActionInput<TPayload>,
  updatedItem: CachedStockWorkingSetItem,
  buildEnvelope: (
    common: BuildEnvelopeCommonInput & { itemId: string; payload: TPayload },
  ) => OfflineOperationEnvelope<TPayload>,
): Promise<RecordOfflineStockActionResult> {
  const now = input.now ?? (() => new Date());
  const generateOperationId = input.generateOperationId ?? generateLocalId;
  const operationId = generateOperationId();
  const nowIso = now().toISOString();

  const withOperation: CachedStockWorkingSetItem = {
    ...updatedItem,
    pendingOperationIds: [...updatedItem.pendingOperationIds, operationId],
    updatedAt: nowIso,
  };

  await writeWorkingSetSnapshot(db, 'inventory_working_set_snapshot', {
    entityId: input.itemId,
    clinicId: input.clinicId,
    deviceId: input.deviceId,
    data: withOperation,
    // D-35: an item actively scanned/acted upon offline is always "of
    // today" from the moment it is recorded -- the shared same-day
    // working-set anchor is what actually governs whether it stays
    // editable across a midnight-spanning offline stretch, not this date.
    recordDate: nowIso,
  });

  const envelope = buildEnvelope({
    operationId,
    deviceId: input.deviceId,
    clinicId: input.clinicId,
    userId: input.userId,
    createdAt: nowIso,
    itemId: input.itemId,
    payload: input.payload,
  });

  await enqueueOperation(db, {
    operationId: envelope.operationId,
    deviceId: envelope.deviceId,
    clinicId: envelope.clinicId,
    userId: envelope.userId,
    domain: envelope.domain,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    priority: envelope.priority,
    payload: envelope.payload,
    createdAt: envelope.createdAt,
  });

  return { operationId, item: withOperation };
}

/** D-04: full local stock actions on-device for a stock receipt. Every
 *  receipt is additive, so there is no "mismatch" possible client-side --
 *  reconciliation against live batch state happens server-side on replay. */
export async function recordOfflineStockReceive(
  db: SQLite.SQLiteDatabase,
  input: RecordOfflineStockActionInput<StockReceivePayload>,
): Promise<RecordOfflineStockActionResult> {
  const working = await loadOrSeedWorkingSetItem(db, input.itemId, input.knownItem);
  const updated: CachedStockWorkingSetItem = {
    ...working,
    currentStock: working.currentStock + input.payload.quantity,
  };
  return persistAndEnqueue(db, input, updated, buildStockReceiveEnvelope);
}

/** D-04, D-22: full local stock actions on-device for a FIFO dispense. The
 *  device's own optimistic deduction is just a local projection -- the
 *  authoritative FIFO/batch/expiry re-check happens server-side on replay
 *  (`inventoryOfflineReplay.service.ts`), which is what actually enforces
 *  D-25's expired-batch block and D-10's review-before-overwrite posture. */
export async function recordOfflineStockDispense(
  db: SQLite.SQLiteDatabase,
  input: RecordOfflineStockActionInput<StockDispensePayload>,
): Promise<RecordOfflineStockActionResult> {
  const working = await loadOrSeedWorkingSetItem(db, input.itemId, input.knownItem);
  const updated: CachedStockWorkingSetItem = {
    ...working,
    currentStock: working.currentStock - input.payload.quantity,
  };
  return persistAndEnqueue(db, input, updated, buildStockDispenseEnvelope);
}

/** D-04: full local stock actions on-device for a manual add/remove
 *  adjustment (D-04 from Phase 5 -- required reason preset carried in the
 *  payload, validated again server-side on replay). */
export async function recordOfflineStockAdjust(
  db: SQLite.SQLiteDatabase,
  input: RecordOfflineStockActionInput<StockAdjustPayload>,
): Promise<RecordOfflineStockActionResult> {
  const working = await loadOrSeedWorkingSetItem(db, input.itemId, input.knownItem);
  const delta = input.payload.type === 'add' ? input.payload.quantity : -input.payload.quantity;
  const updated: CachedStockWorkingSetItem = {
    ...working,
    currentStock: working.currentStock + delta,
  };
  return persistAndEnqueue(db, input, updated, buildStockAdjustEnvelope);
}

/** D-04, D-51/D-57: full local stock actions on-device for returning a
 *  previously (server-known) dispensed movement back to stock. */
export async function recordOfflineStockReturn(
  db: SQLite.SQLiteDatabase,
  input: RecordOfflineStockActionInput<StockReturnPayload>,
): Promise<RecordOfflineStockActionResult> {
  const working = await loadOrSeedWorkingSetItem(db, input.itemId, input.knownItem);
  const updated: CachedStockWorkingSetItem = {
    ...working,
    currentStock: working.currentStock + input.payload.quantity,
  };
  return persistAndEnqueue(db, input, updated, buildStockReturnEnvelope);
}
