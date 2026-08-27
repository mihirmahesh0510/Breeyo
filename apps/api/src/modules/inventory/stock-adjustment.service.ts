import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { stockAdjustmentSchema } from '@breeyo/validators';
import { staleWriteConflictError } from '../../realtime/browser-sync.service.js';
import { StockMovementService } from './stock-movement.service.js';

function notFoundError(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 404;
  error.code = 'ITEM_NOT_FOUND';
  return error;
}

function validationError(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

export class StockAdjustmentService {
  constructor(
    private readonly prisma: TenantPrismaClient,
    private readonly stockMovementService: StockMovementService,
  ) {}

  /**
   * D-04: manual add/remove adjustment. `reason` is required and restricted
   * to the ADJUSTMENT_REASONS preset list — stockAdjustmentSchema.parse()
   * throws a ZodError (surfaced as 400 VALIDATION_ERROR by the global error
   * handler) when it's missing or not one of the presets.
   */
  async adjust(
    clinicId: string,
    itemId: string,
    userId: string,
    userName: string,
    input: unknown,
    expectedVersion?: number,
  ) {
    const parsed = stockAdjustmentSchema.parse(input);
    const signedQuantity = parsed.type === 'add' ? parsed.quantity : -parsed.quantity;

    const item = await this.prisma.inventoryItem.findFirst({ where: { id: itemId, clinicId } });
    if (!item) throw notFoundError('Inventory item not found');

    if (parsed.type === 'remove' && item.currentStock < parsed.quantity) {
      throw validationError(
        `Cannot remove ${parsed.quantity} units — only ${item.currentStock} in stock`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await this.stockMovementService.recordMovement(tx, {
        clinicId,
        itemId,
        batchId: null,
        type: 'adjusted',
        quantity: signedQuantity,
        reason: parsed.reason,
        userId,
        userName,
        notes: parsed.notes ?? null,
      });

      // D-05: the version check and the real stock mutation are the SAME
      // conditional `updateMany`, inside the SAME transaction as the
      // movement record above -- there is no separate claim write that can
      // commit ahead of (or independent of) the real change, so a failed
      // adjustment can never leave a bumped version with no real change.
      const claim = await tx.inventoryItem.updateMany({
        where: {
          id: itemId,
          ...(expectedVersion !== undefined ? { updatedAt: new Date(expectedVersion) } : {}),
        },
        data: { currentStock: { increment: signedQuantity } },
      });

      if (claim.count !== 1) {
        const current = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { updatedAt: true } });
        if (current && expectedVersion !== undefined) {
          throw staleWriteConflictError({
            domain: 'inventory',
            entityType: 'INVENTORY_ITEM',
            entityId: itemId,
            currentVersion: current.updatedAt.getTime(),
            expectedVersion,
          });
        }
        throw notFoundError('Inventory item not found');
      }

      const updatedItem = await tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });

      return { movement, item: updatedItem };
    });
  }
}
