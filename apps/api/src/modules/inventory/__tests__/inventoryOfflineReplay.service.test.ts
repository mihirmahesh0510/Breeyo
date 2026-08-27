import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReplayPriority } from '@breeyo/types';
import {
  InventoryOfflineReplayService,
  STOCK_RECEIVE_ENTITY_TYPE,
  STOCK_DISPENSE_ENTITY_TYPE,
  STOCK_ADJUST_ENTITY_TYPE,
  STOCK_RETURN_ENTITY_TYPE,
  type InventoryOfflineReplayGateway,
  type InventoryReplayReceiptStore,
} from '../services/inventoryOfflineReplay.service.js';
import { InventoryConflictReviewService, type InventoryReviewTaskStore } from '../services/inventoryConflictReview.service.js';
import type { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const ITEM_ID = '00000000-0000-0000-0000-000000000003';
const DEVICE_A = 'device-a';
const FIXED_NOW = new Date('2026-08-24T10:00:00.000Z');

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: DEVICE_A,
    operationId: 'op-1',
    clinicId: CLINIC_ID,
    userId: USER_ID,
    domain: 'inventory',
    entityType: STOCK_DISPENSE_ENTITY_TYPE,
    entityId: ITEM_ID,
    priority: ReplayPriority.INVENTORY_MEDIUM,
    createdAt: FIXED_NOW.toISOString(),
    payload: { quantity: 3 },
    ...overrides,
  };
}

function createMockGateway(): InventoryOfflineReplayGateway {
  return {
    receiveStock: vi.fn(),
    dispense: vi.fn(),
    adjust: vi.fn(),
    returnToStock: vi.fn(),
  };
}

function createMockReceipts(): InventoryReplayReceiptStore {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ operationId: 'op-1' }),
  };
}

function createMockReviewTasks(): InventoryReviewTaskStore {
  return {
    create: vi.fn().mockResolvedValue({ id: 'review-task-1' }),
  };
}

function structuredError(code: string, message: string, statusCode: number, extra: Record<string, unknown> = {}) {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  Object.assign(error, { statusCode, code, ...extra });
  return error;
}

function createAllowAllPermissions() {
  return { getUserPermissions: vi.fn().mockResolvedValue(['MANAGE_INVENTORY_STOCK', 'DISPENSE_INVENTORY']) };
}

const context = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_A };

describe('InventoryOfflineReplayService', () => {
  let gateway: ReturnType<typeof createMockGateway>;
  let receipts: ReturnType<typeof createMockReceipts>;
  let reviewTasks: ReturnType<typeof createMockReviewTasks>;
  let reviewService: InventoryConflictReviewService;
  let permissions: ReturnType<typeof createAllowAllPermissions>;
  let service: InventoryOfflineReplayService;

  beforeEach(() => {
    gateway = createMockGateway();
    receipts = createMockReceipts();
    reviewTasks = createMockReviewTasks();
    reviewService = new InventoryConflictReviewService(reviewTasks);
    permissions = createAllowAllPermissions();
    service = new InventoryOfflineReplayService(gateway, receipts, reviewService, permissions, () => FIXED_NOW);
  });

  describe('permission enforcement (D-41 to D-44)', () => {
    it('rejects a dispense replay when the caller lacks DISPENSE_INVENTORY', async () => {
      permissions.getUserPermissions.mockResolvedValue(['MANAGE_INVENTORY_STOCK']);

      await expect(service.replayInventoryOperation(context, baseEnvelope())).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
      expect(gateway.dispense).not.toHaveBeenCalled();
    });

    it('rejects an adjust replay when the caller lacks MANAGE_INVENTORY_STOCK', async () => {
      permissions.getUserPermissions.mockResolvedValue(['DISPENSE_INVENTORY']);

      await expect(
        service.replayInventoryOperation(context, baseEnvelope({ entityType: STOCK_ADJUST_ENTITY_TYPE, payload: { type: 'add', quantity: 1, reason: 'found_stock' } })),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      expect(gateway.adjust).not.toHaveBeenCalled();
    });

    it('allows a dispense replay when the caller holds DISPENSE_INVENTORY', async () => {
      permissions.getUserPermissions.mockResolvedValue(['DISPENSE_INVENTORY']);
      vi.mocked(gateway.dispense).mockResolvedValue({
        deductions: [{ batchId: 'batch-1', lotNumber: null, quantity: 3 }],
        newTotal: 7,
        movementIds: ['movement-1'],
      } as any);

      const result = await service.replayInventoryOperation(context, baseEnvelope());

      expect(result.status).toBe('APPLIED');
      expect(gateway.dispense).toHaveBeenCalled();
    });
  });

  describe('idempotency (T-10-07, T-10-03 pattern reused for inventory)', () => {
    it('applies a new dispense operation exactly once and records a replay receipt', async () => {
      vi.mocked(gateway.dispense).mockResolvedValue({
        deductions: [{ batchId: 'batch-1', lotNumber: null, quantity: 3 }],
        newTotal: 7,
        movementIds: ['movement-1'],
      } as any);

      const result = await service.replayInventoryOperation(context, baseEnvelope());

      expect(result.status).toBe('APPLIED');
      expect(gateway.dispense).toHaveBeenCalledTimes(1);
      expect(receipts.create).toHaveBeenCalledTimes(1);
    });

    it('acknowledges a duplicate/flapping replay of an already-processed operation as a no-op without re-applying the mutation', async () => {
      vi.mocked(receipts.findUnique).mockResolvedValue({ operationId: 'op-1' });

      const result = await service.replayInventoryOperation(context, baseEnvelope());

      expect(result.status).toBe('ACKNOWLEDGED_DUPLICATE');
      expect(gateway.dispense).not.toHaveBeenCalled();
      expect(receipts.create).not.toHaveBeenCalled();
    });
  });

  describe('FIFO-safe dispense reconciliation (D-04, D-10, T-10-08)', () => {
    it('creates a lighter operational review instead of silently overwriting stock truth when live FIFO/batch state can no longer satisfy the queued dispense (InsufficientStockError)', async () => {
      vi.mocked(gateway.dispense).mockRejectedValue(
        structuredError('INSUFFICIENT_STOCK', 'Insufficient stock', 409, { itemId: ITEM_ID, requested: 3, available: 1 }),
      );

      const result = await service.replayInventoryOperation(context, baseEnvelope({ payload: { quantity: 3 } }));

      expect(result.status).toBe('REVIEW_CREATED');
      expect(result.reviewTaskId).toBe('review-task-1');
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
      expect(reviewTasks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clinicId: CLINIC_ID,
            severity: 'OPERATIONAL',
            entityId: ITEM_ID,
          }),
        }),
      );
      // The mismatch is not silently overwritten -- a receipt is still
      // recorded so a flapping replay of this same operationId resolves as
      // an idempotent no-op rather than re-triggering another review task.
      expect(receipts.create).toHaveBeenCalledTimes(1);
    });

    it('applies a dispense whose overrideBatchId is still live (no mismatch)', async () => {
      vi.mocked(gateway.dispense).mockResolvedValue({
        deductions: [{ batchId: 'batch-9', lotNumber: 'LOT-9', quantity: 2 }],
        newTotal: 8,
        movementIds: ['movement-2'],
      } as any);

      const result = await service.replayInventoryOperation(
        context,
        baseEnvelope({ payload: { quantity: 2, overrideBatchId: 'batch-9' } }),
      );

      expect(result.status).toBe('APPLIED');
      expect(gateway.dispense).toHaveBeenCalledWith(CLINIC_ID, ITEM_ID, USER_ID, undefined, {
        quantity: 2,
        overrideBatchId: 'batch-9',
      });
    });
  });

  describe('receive replay', () => {
    it('applies a receipt against a live item', async () => {
      vi.mocked(gateway.receiveStock).mockResolvedValue({ batch: { id: 'batch-1' }, movement: { id: 'movement-1' } } as any);

      const result = await service.replayInventoryOperation(
        context,
        baseEnvelope({
          entityType: STOCK_RECEIVE_ENTITY_TYPE,
          payload: { quantity: 20, lotNumber: 'LOT-1' },
        }),
      );

      expect(result.status).toBe('APPLIED');
      expect(gateway.receiveStock).toHaveBeenCalledTimes(1);
    });

    it('creates an operational review instead of silently failing when the item no longer exists', async () => {
      vi.mocked(gateway.receiveStock).mockRejectedValue(structuredError('ITEM_NOT_FOUND', 'Inventory item not found', 404));

      const result = await service.replayInventoryOperation(
        context,
        baseEnvelope({ entityType: STOCK_RECEIVE_ENTITY_TYPE, payload: { quantity: 20 } }),
      );

      expect(result.status).toBe('REVIEW_CREATED');
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('adjust replay', () => {
    it('applies a valid adjustment', async () => {
      vi.mocked(gateway.adjust).mockResolvedValue({
        movement: { id: 'movement-3' },
        item: { id: ITEM_ID, currentStock: 6 },
      } as any);

      const result = await service.replayInventoryOperation(
        context,
        baseEnvelope({
          entityType: STOCK_ADJUST_ENTITY_TYPE,
          payload: { quantity: 4, type: 'remove', reason: 'damage' },
        }),
      );

      expect(result.status).toBe('APPLIED');
    });

    it('creates an operational review when the live stock can no longer satisfy a queued "remove" adjustment', async () => {
      vi.mocked(gateway.adjust).mockRejectedValue(
        structuredError('VALIDATION_ERROR', 'Cannot remove 4 units — only 1 in stock', 400),
      );

      const result = await service.replayInventoryOperation(
        context,
        baseEnvelope({
          entityType: STOCK_ADJUST_ENTITY_TYPE,
          payload: { quantity: 4, type: 'remove', reason: 'damage' },
        }),
      );

      expect(result.status).toBe('REVIEW_CREATED');
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('return replay', () => {
    it('applies a valid return-to-stock', async () => {
      vi.mocked(gateway.returnToStock).mockResolvedValue({ id: 'movement-return-1' } as any);

      const result = await service.replayInventoryOperation(
        context,
        baseEnvelope({
          entityType: STOCK_RETURN_ENTITY_TYPE,
          payload: { movementId: 'movement-1', itemId: ITEM_ID, quantity: 2 },
        }),
      );

      expect(result.status).toBe('APPLIED');
      expect(gateway.returnToStock).toHaveBeenCalledWith(CLINIC_ID, 'movement-1', USER_ID, undefined);
    });

    it('creates an operational review instead of silently failing when the movement no longer exists or was already returned', async () => {
      vi.mocked(gateway.returnToStock).mockRejectedValue(
        structuredError('MOVEMENT_NOT_FOUND', 'Stock movement not found', 404),
      );

      const result = await service.replayInventoryOperation(
        context,
        baseEnvelope({
          entityType: STOCK_RETURN_ENTITY_TYPE,
          payload: { movementId: 'missing-movement', itemId: ITEM_ID, quantity: 2 },
        }),
      );

      expect(result.status).toBe('REVIEW_CREATED');
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it('rejects an envelope with an unsupported entityType', async () => {
      const result = await service.replayInventoryOperation(context, baseEnvelope({ entityType: 'STOCK_TELEPORT' }));
      expect(result.status).toBe('REJECTED');
    });

    it('rejects a malformed envelope without touching the gateway', async () => {
      const result = await service.replayInventoryOperation(context, { not: 'an envelope' });
      expect(result.status).toBe('REJECTED');
      expect(gateway.dispense).not.toHaveBeenCalled();
    });

    it('lets an unexpected (non-mismatch) error propagate rather than silently swallowing it into a review task', async () => {
      vi.mocked(gateway.dispense).mockRejectedValue(new Error('database connection lost'));

      await expect(service.replayInventoryOperation(context, baseEnvelope())).rejects.toThrow('database connection lost');
      expect(reviewTasks.create).not.toHaveBeenCalled();
    });
  });
});

// Verify-fix 10.3: `ReplayBroadcastService` was built but never called from
// `InventoryOfflineReplayService` -- proves the broadcast fires from the
// same `applyOrReview` path every one of the four operation types shares,
// which is exactly what `inventorySync.controller.ts`'s HTTP handler calls.
describe('InventoryOfflineReplayService replay-broadcast wiring (verify-fix 10.3)', () => {
  let gateway: ReturnType<typeof createMockGateway>;
  let receipts: ReturnType<typeof createMockReceipts>;
  let reviewTasks: ReturnType<typeof createMockReviewTasks>;
  let reviewService: InventoryConflictReviewService;
  let broadcast: { emitReplayApplied: ReturnType<typeof vi.fn>; emitReplayConflictOpened: ReturnType<typeof vi.fn>; emitReplayFailureEscalated: ReturnType<typeof vi.fn> };
  let service: InventoryOfflineReplayService;

  beforeEach(() => {
    gateway = createMockGateway();
    receipts = createMockReceipts();
    reviewTasks = createMockReviewTasks();
    reviewService = new InventoryConflictReviewService(reviewTasks);
    broadcast = {
      emitReplayApplied: vi.fn(),
      emitReplayConflictOpened: vi.fn(),
      emitReplayFailureEscalated: vi.fn(),
    };
    service = new InventoryOfflineReplayService(
      gateway,
      receipts,
      reviewService,
      createAllowAllPermissions(),
      () => FIXED_NOW,
      broadcast as unknown as ReplayBroadcastService,
    );
  });

  it('emits a clinic-scoped REPLAY_APPLIED broadcast after a successful dispense', async () => {
    vi.mocked(gateway.dispense).mockResolvedValue({
      deductions: [{ batchId: 'batch-1', lotNumber: null, quantity: 3 }],
      newTotal: 7,
      movementIds: ['movement-1'],
    } as any);

    await service.replayInventoryOperation(context, baseEnvelope());

    expect(broadcast.emitReplayApplied).toHaveBeenCalledWith({ clinicId: CLINIC_ID, domain: 'inventory', entityIds: [ITEM_ID] });
    expect(broadcast.emitReplayConflictOpened).not.toHaveBeenCalled();
  });

  it('emits a clinic-scoped REPLAY_CONFLICT_OPENED broadcast (not REPLAY_APPLIED) when a known mismatch creates a review task', async () => {
    vi.mocked(gateway.dispense).mockRejectedValue(
      structuredError('INSUFFICIENT_STOCK', 'Insufficient stock', 409, { itemId: ITEM_ID, requested: 3, available: 1 }),
    );

    await service.replayInventoryOperation(context, baseEnvelope());

    expect(broadcast.emitReplayConflictOpened).toHaveBeenCalledWith({ clinicId: CLINIC_ID, domain: 'inventory', entityIds: [ITEM_ID] });
    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
  });

  it('does not emit any broadcast for a duplicate/flapping replay of an already-processed operation', async () => {
    vi.mocked(receipts.findUnique).mockResolvedValue({ operationId: 'op-1' });

    await service.replayInventoryOperation(context, baseEnvelope());

    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
    expect(broadcast.emitReplayConflictOpened).not.toHaveBeenCalled();
  });

  it('does not emit any broadcast when an unexpected error propagates (no false "applied"/"reviewed" signal)', async () => {
    vi.mocked(gateway.dispense).mockRejectedValue(new Error('database connection lost'));

    await expect(service.replayInventoryOperation(context, baseEnvelope())).rejects.toThrow();

    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
    expect(broadcast.emitReplayConflictOpened).not.toHaveBeenCalled();
  });
});

describe('InventoryConflictReviewService (D-10: lighter operational review than EMR)', () => {
  let reviewTasks: ReturnType<typeof createMockReviewTasks>;
  let service: InventoryConflictReviewService;

  beforeEach(() => {
    reviewTasks = createMockReviewTasks();
    service = new InventoryConflictReviewService(reviewTasks);
  });

  it('summarizes an insufficient-stock mismatch and recommends a manual batch choice rather than blind retry', () => {
    const summary = service.summarizeMismatch({
      operationType: 'DISPENSE',
      itemId: ITEM_ID,
      errorCode: 'INSUFFICIENT_STOCK',
      errorMessage: 'Insufficient stock',
      requestedQuantity: 5,
      availableQuantity: 1,
    });

    expect(summary.recommendedAction).toBe('MANUAL_BATCH_CHOICE');
    expect(summary.summary).toContain('5');
    expect(summary.summary).toContain('1');
  });

  it('records an OPERATIONAL-severity review task (D-10), not a clinical-severity conflict', async () => {
    const taskId = await service.createInventoryReviewTask(
      { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_A },
      {
        operationId: 'op-x',
        itemId: ITEM_ID,
        mismatch: {
          operationType: 'DISPENSE',
          itemId: ITEM_ID,
          errorCode: 'INSUFFICIENT_STOCK',
          errorMessage: 'Insufficient stock',
          requestedQuantity: 5,
          availableQuantity: 1,
        },
      },
    );

    expect(taskId).toBe('review-task-1');
    expect(reviewTasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          severity: 'OPERATIONAL',
          resolutionState: 'OPEN',
          entityId: ITEM_ID,
          originatingUserId: USER_ID,
        }),
      }),
    );
  });
});
