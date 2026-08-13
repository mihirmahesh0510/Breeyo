import type { PrismaClient } from '@prisma/client';
import { stockAdjustmentSchema } from '@breeyo/validators';
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
    private readonly prisma: PrismaClient,
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

      const updatedItem = await tx.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: { increment: signedQuantity } },
      });

      return { movement, item: updatedItem };
    });
  }
}
