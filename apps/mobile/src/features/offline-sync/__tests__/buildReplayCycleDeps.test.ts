import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// expo-sqlite is a native module; never import the real thing in this
// vitest "node" environment (matches offlineDb.test.ts's / offlineStockActions.test.ts's
// own mocking convention -- buildReplayCycleDeps.ts pulls in offlineDb.ts
// transitively, and this file's `db` is always a fake anyway since every
// offlineDb.ts function it calls is mocked below).
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(() => {
    throw new Error('openDatabaseAsync should never be called when a db is injected in tests');
  }),
}));

import { ReplayPriority } from '@breeyo/types';
import type { OfflineOperationEnvelope } from '@breeyo/types';

/**
 * F8 (Phase 10 review-fix round 2): `useInventoryOfflineSyncStore.pendingCount`
 * (the counter `BarcodeScannerScreen.tsx`'s "N stock update(s) pending sync"
 * banner reads) is only ever incremented, in `useOfflineStockActions.ts`'s
 * offline-capture path -- nothing decrements it on a confirmed replay, so
 * once F2's real `ConnectivityReplayProvider` wiring makes replay genuinely
 * happen, the banner sticks at a stale count forever. This file drives the
 * REAL `buildReplayCycleDeps.ts` production wiring (not a reimplementation)
 * against the REAL `useInventoryOfflineSyncStore`, stubbing only the network
 * boundary (`apiClient`) and the on-device DB boundary (`offlineDb.ts`).
 */

const markSyncOperationSynced = vi.fn().mockResolvedValue(undefined);
const listPendingSyncOperationsByPriority = vi.fn().mockResolvedValue([]);
const clearWorkingSetAnchor = vi.fn().mockResolvedValue(undefined);

vi.mock('../db/offlineDb', () => ({
  markSyncOperationSynced: (...args: unknown[]) => markSyncOperationSynced(...args),
  listPendingSyncOperationsByPriority: (...args: unknown[]) => listPendingSyncOperationsByPriority(...args),
  clearWorkingSetAnchor: (...args: unknown[]) => clearWorkingSetAnchor(...args),
}));

const apiClient = vi.fn();

vi.mock('../../../lib/api', () => ({
  apiClient: (...args: unknown[]) => apiClient(...args),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const DEVICE_ID = 'device-1';
const CLINIC_ID = 'clinic-1';

describe('buildReplayCycleDeps sendOperation -- inventory pendingCount reconciliation (F8)', () => {
  let buildReplayCycleDeps: typeof import('../services/buildReplayCycleDeps').buildReplayCycleDeps;
  let useInventoryOfflineSyncStore: typeof import('../../inventory/store/inventoryOfflineSyncStore').useInventoryOfflineSyncStore;
  let INVENTORY_SYNC_DOMAIN: typeof import('../../inventory/services/offlineStockActionStore').INVENTORY_SYNC_DOMAIN;

  beforeAll(async () => {
    ({ buildReplayCycleDeps } = await import('../services/buildReplayCycleDeps'));
    ({ useInventoryOfflineSyncStore } = await import('../../inventory/store/inventoryOfflineSyncStore'));
    ({ INVENTORY_SYNC_DOMAIN } = await import('../../inventory/services/offlineStockActionStore'));
  });

  function inventoryOperation(operationId: string) {
    const envelope: OfflineOperationEnvelope = {
      deviceId: DEVICE_ID,
      operationId,
      clinicId: CLINIC_ID,
      userId: 'user-1',
      domain: INVENTORY_SYNC_DOMAIN,
      entityType: 'STOCK_DISPENSE',
      entityId: 'item-1',
      priority: ReplayPriority.INVENTORY_MEDIUM,
      createdAt: new Date().toISOString(),
      payload: {},
    };
    return { operationId, priority: ReplayPriority.INVENTORY_MEDIUM as ReplayPriority, envelope };
  }

  function fakeDb(): Parameters<typeof buildReplayCycleDeps>[0]['db'] {
    return {} as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useInventoryOfflineSyncStore.getState().reset();
  });

  it('decrements the real useInventoryOfflineSyncStore.pendingCount when an inventory replay is acknowledged', async () => {
    useInventoryOfflineSyncStore.getState().incrementPending();
    expect(useInventoryOfflineSyncStore.getState().pendingCount).toBe(1);

    apiClient.mockResolvedValue({ data: { acknowledgedOperationIds: ['op-1'], rejectedOperations: [] } });

    const deps = buildReplayCycleDeps({ db: fakeDb(), deviceId: DEVICE_ID, accessToken: 'token' });
    const outcome = await deps.sendOperation(inventoryOperation('op-1'));

    expect(outcome.succeeded).toBe(true);
    expect(useInventoryOfflineSyncStore.getState().pendingCount).toBe(0);
  });

  it('leaves pendingCount untouched when the inventory replay is rejected, not acknowledged', async () => {
    useInventoryOfflineSyncStore.getState().incrementPending();

    apiClient.mockResolvedValue({
      data: { acknowledgedOperationIds: [], rejectedOperations: [{ operationId: 'op-1', message: 'STOCK_MISMATCH' }] },
    });

    const deps = buildReplayCycleDeps({ db: fakeDb(), deviceId: DEVICE_ID, accessToken: 'token' });
    const outcome = await deps.sendOperation(inventoryOperation('op-1'));

    expect(outcome.succeeded).toBe(false);
    expect(useInventoryOfflineSyncStore.getState().pendingCount).toBe(1);
  });

  it('never drops pendingCount below zero when a replay is acknowledged for an operation this session never counted', async () => {
    apiClient.mockResolvedValue({ data: { acknowledgedOperationIds: ['op-1'], rejectedOperations: [] } });

    const deps = buildReplayCycleDeps({ db: fakeDb(), deviceId: DEVICE_ID, accessToken: 'token' });
    await deps.sendOperation(inventoryOperation('op-1'));

    expect(useInventoryOfflineSyncStore.getState().pendingCount).toBe(0);
  });

  it('decrements exactly once per acknowledged operation, leaving other pending items counted', async () => {
    useInventoryOfflineSyncStore.getState().incrementPending();
    useInventoryOfflineSyncStore.getState().incrementPending();
    expect(useInventoryOfflineSyncStore.getState().pendingCount).toBe(2);

    apiClient.mockResolvedValue({ data: { acknowledgedOperationIds: ['op-1'], rejectedOperations: [] } });

    const deps = buildReplayCycleDeps({ db: fakeDb(), deviceId: DEVICE_ID, accessToken: 'token' });
    await deps.sendOperation(inventoryOperation('op-1'));

    expect(useInventoryOfflineSyncStore.getState().pendingCount).toBe(1);
  });
});

/**
 * WR-10: the server-side domain-specific replay endpoints
 * (`/inventory/sync/replay`, `/consultations/sync/replay`) enforce D-12 to
 * D-14 (queue always replays first) by verifying a client-reported list of
 * still-pending QUEUE_HIGH operationIds against their own receipt ledger --
 * they cannot pre-scan a mixed batch the way the generic `/sync/replay`
 * ingress does, since this coordinator always sends exactly one envelope
 * per call to that envelope's own domain path. This suite proves the real
 * production wiring (`sendOperation`, not a reimplementation) actually
 * reports that list for non-queue domains, using the SAME on-device
 * `listPendingSyncOperationsByPriority` this coordinator already relies on
 * for its own local tier-ordering (`syncCoordinator.ts`).
 */
describe('buildReplayCycleDeps sendOperation -- pendingQueueHighOperationIds reporting (WR-10)', () => {
  let buildReplayCycleDeps: typeof import('../services/buildReplayCycleDeps').buildReplayCycleDeps;
  let INVENTORY_SYNC_DOMAIN: typeof import('../../inventory/services/offlineStockActionStore').INVENTORY_SYNC_DOMAIN;
  let QUEUE_SYNC_DOMAIN: typeof import('../../queue/lib/queue-offline-utils').QUEUE_SYNC_DOMAIN;

  beforeAll(async () => {
    ({ buildReplayCycleDeps } = await import('../services/buildReplayCycleDeps'));
    ({ INVENTORY_SYNC_DOMAIN } = await import('../../inventory/services/offlineStockActionStore'));
    ({ QUEUE_SYNC_DOMAIN } = await import('../../queue/lib/queue-offline-utils'));
  });

  function operationFor(domain: string, operationId: string, priority: ReplayPriority) {
    const envelope: OfflineOperationEnvelope = {
      deviceId: DEVICE_ID,
      operationId,
      clinicId: CLINIC_ID,
      userId: 'user-1',
      domain,
      entityType: domain === QUEUE_SYNC_DOMAIN ? 'QUEUE_CHECK_IN' : 'STOCK_DISPENSE',
      entityId: 'entity-1',
      priority,
      createdAt: new Date().toISOString(),
      payload: {},
    };
    return { operationId, priority, envelope };
  }

  function fakeDb(): Parameters<typeof buildReplayCycleDeps>[0]['db'] {
    return {} as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.mockResolvedValue({ data: { acknowledgedOperationIds: ['op-1'], rejectedOperations: [] } });
  });

  it('reports this device\'s locally-pending QUEUE_HIGH operationIds when sending a non-queue (inventory) operation', async () => {
    listPendingSyncOperationsByPriority.mockResolvedValue([
      { operationId: 'queue-op-a', priority: ReplayPriority.QUEUE_HIGH, envelope: {} },
      { operationId: 'queue-op-b', priority: ReplayPriority.QUEUE_HIGH, envelope: {} },
    ]);

    const deps = buildReplayCycleDeps({ db: fakeDb(), deviceId: DEVICE_ID, accessToken: 'token' });
    await deps.sendOperation(operationFor(INVENTORY_SYNC_DOMAIN, 'op-1', ReplayPriority.INVENTORY_MEDIUM));

    expect(listPendingSyncOperationsByPriority).toHaveBeenCalledWith(expect.anything(), ReplayPriority.QUEUE_HIGH);

    const [, options] = apiClient.mock.calls[0];
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.pendingQueueHighOperationIds).toEqual(['queue-op-a', 'queue-op-b']);
  });

  it('reports an empty list when this device has no locally-pending QUEUE_HIGH operations', async () => {
    listPendingSyncOperationsByPriority.mockResolvedValue([]);

    const deps = buildReplayCycleDeps({ db: fakeDb(), deviceId: DEVICE_ID, accessToken: 'token' });
    await deps.sendOperation(operationFor(INVENTORY_SYNC_DOMAIN, 'op-1', ReplayPriority.INVENTORY_MEDIUM));

    const [, options] = apiClient.mock.calls[0];
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.pendingQueueHighOperationIds).toEqual([]);
  });

  it('never reports (or looks up) pending QUEUE_HIGH operationIds when sending a queue-domain operation itself', async () => {
    const deps = buildReplayCycleDeps({ db: fakeDb(), deviceId: DEVICE_ID, accessToken: 'token' });
    await deps.sendOperation(operationFor(QUEUE_SYNC_DOMAIN, 'op-1', ReplayPriority.QUEUE_HIGH));

    expect(listPendingSyncOperationsByPriority).not.toHaveBeenCalled();

    const [, options] = apiClient.mock.calls[0];
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.pendingQueueHighOperationIds).toEqual([]);
  });
});
