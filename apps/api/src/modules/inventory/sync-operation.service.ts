import type { Redis } from 'ioredis';
import type { FifoDispenseService } from './fifo-dispense.service.js';
import type { StockAdjustmentService } from './stock-adjustment.service.js';
import type { StockReceiptService } from './stock-receipt.service.js';
import { INVENTORY_PERMISSIONS } from './middleware/inventory-permissions.middleware.js';

/**
 * D-53: the three operation types the mobile offline queue (Plan 05-05) can
 * replay through this single generic dispatcher, instead of calling
 * /receive, /dispense, /adjust directly.
 */
export const SYNC_OPERATION_TYPES = ['receipt', 'dispense', 'adjustment'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

/**
 * D-41-D-44: maps each sync operation type to the permission ACTION (not the
 * raw code -- see INVENTORY_PERMISSIONS) required to perform it. A single
 * route handles three operation types with three different permission
 * requirements, and Fastify's route-level preHandler can't vary by request
 * body, so this map is consulted inside SyncOperationService.execute() --
 * matching the same INVENTORY_PERMISSIONS codes the direct
 * /receive|/dispense|/adjust routes already enforce at registration time
 * (inventory.routes.ts, dispense.routes.ts), just resolved per-request here.
 */
export const SYNC_OPERATION_PERMISSIONS: Record<SyncOperationType, keyof typeof INVENTORY_PERMISSIONS> = {
  receipt: 'manageStock',
  dispense: 'dispense',
  adjustment: 'manageStock',
};

/** Minimal shape SyncOperationService needs from PermissionService -- kept as
 * a local interface instead of importing the concrete class, so this file
 * doesn't take on an auth-module dependency it only needs one method from. */
export interface PermissionsProvider {
  getUserPermissions(userId: string, clinicId: string): Promise<string[]>;
}

export interface SyncOperationInput {
  operationType: unknown;
  itemId: unknown;
  clientOperationId?: unknown;
  data: unknown;
}

export interface SyncOperationResult {
  /** True when this clientOperationId was already processed and the cached
   *  result is being replayed -- D-59: lets the mobile retry banner tell a
   *  successful duplicate replay apart from a genuine failure. */
  alreadyApplied: boolean;
  operationType: SyncOperationType;
  result: unknown;
}

function structuredError(
  code: string,
  message: string,
  statusCode: number,
): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isSyncOperationType(value: unknown): value is SyncOperationType {
  return typeof value === 'string' && (SYNC_OPERATION_TYPES as readonly string[]).includes(value);
}

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24h -- generous window for an offline device to reconnect (D-19)

function idempotencyKey(clinicId: string, clientOperationId: string): string {
  return `inventory:sync-op:${clinicId}:${clientOperationId}`;
}

/**
 * D-53: generic sync dispatcher backing POST /api/v1/inventory/sync-operation.
 * Inspects `operationType` in the request body and routes to whichever of
 * the three existing stock-mutation services actually owns it -- the mobile
 * offline queue replays every queued operation through this one endpoint
 * rather than calling the individual /receive, /dispense, /adjust routes.
 *
 * D-59: every thrown error carries a structured { code, statusCode } (same
 * convention as the other inventory services) so the mobile retry banner has
 * something to key off of. A replayed operation whose clientOperationId was
 * already processed is NOT reported as a failure -- it returns the cached
 * result with alreadyApplied=true, distinguishing "already applied" (safe to
 * discard from the pending queue) from a genuine failure (needs retry).
 *
 * Idempotency is Redis-backed (reusing the same ioredis connection every
 * other module already uses for caching/BullMQ, e.g. PermissionService's
 * cache) rather than a new database column/table, since no client-operation
 * ledger exists in the schema and inventing one is out of scope for this
 * gap-fill. `redis` is optional -- if omitted (e.g. not wired in a given
 * environment), every replay simply re-executes the underlying operation.
 */
export class SyncOperationService {
  constructor(
    private readonly fifoDispenseService: FifoDispenseService,
    private readonly stockAdjustmentService: StockAdjustmentService,
    private readonly stockReceiptService: StockReceiptService,
    private readonly permissionsProvider: PermissionsProvider,
    private readonly redis?: Redis,
  ) {}

  async execute(
    clinicId: string,
    userId: string,
    userName: string,
    input: unknown,
  ): Promise<SyncOperationResult> {
    const body = (input && typeof input === 'object' ? input : {}) as Partial<SyncOperationInput>;

    if (!isSyncOperationType(body.operationType)) {
      throw structuredError(
        'UNKNOWN_OPERATION_TYPE',
        `Unknown sync operation type: ${JSON.stringify(body.operationType)}. Expected one of ${SYNC_OPERATION_TYPES.join(', ')}.`,
        400,
      );
    }

    if (typeof body.itemId !== 'string' || body.itemId.length === 0) {
      throw structuredError('VALIDATION_ERROR', 'itemId is required', 400);
    }

    const { operationType, itemId } = body;
    const clientOperationId =
      typeof body.clientOperationId === 'string' && body.clientOperationId.length > 0
        ? body.clientOperationId
        : undefined;

    // D-41-D-44 permission enforcement -- varies per operationType, so it
    // must happen here rather than as a route-level preHandler.
    const requiredPermission = INVENTORY_PERMISSIONS[SYNC_OPERATION_PERMISSIONS[operationType]];
    const userPermissions = await this.permissionsProvider.getUserPermissions(userId, clinicId);
    if (!userPermissions.includes(requiredPermission)) {
      throw structuredError(
        'FORBIDDEN',
        `Permission denied: ${operationType} requires ${requiredPermission}`,
        403,
      );
    }

    // D-59: already-applied duplicate-replay detection via Redis.
    if (this.redis && clientOperationId) {
      const cached = await this.redis.get(idempotencyKey(clinicId, clientOperationId));
      if (cached) {
        return { alreadyApplied: true, operationType, result: JSON.parse(cached) };
      }
    }

    const result = await this.runOperation(operationType, clinicId, itemId, userId, userName, body.data);

    if (this.redis && clientOperationId) {
      await this.redis.setex(idempotencyKey(clinicId, clientOperationId), IDEMPOTENCY_TTL_SECONDS, JSON.stringify(result));
    }

    return { alreadyApplied: false, operationType, result };
  }

  private async runOperation(
    operationType: SyncOperationType,
    clinicId: string,
    itemId: string,
    userId: string,
    userName: string,
    data: unknown,
  ): Promise<unknown> {
    switch (operationType) {
      case 'receipt':
        return this.stockReceiptService.receiveStock(clinicId, itemId, userId, userName, data);
      case 'dispense':
        return this.fifoDispenseService.dispense(clinicId, itemId, userId, userName, data);
      case 'adjustment':
        return this.stockAdjustmentService.adjust(clinicId, itemId, userId, userName, data);
      /* c8 ignore next 2 -- exhaustive over SyncOperationType, unreachable at runtime */
      default:
        throw structuredError('UNKNOWN_OPERATION_TYPE', `Unknown sync operation type: ${operationType}`, 400);
    }
  }
}
