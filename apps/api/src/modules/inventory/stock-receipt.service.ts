import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { stockReceiptSchema } from '@breeyo/validators';
import { EXPIRY_REQUIRED_CATEGORIES, getCategoryLabel } from '@breeyo/types';

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

export class StockReceiptService {
  constructor(private readonly prisma: TenantPrismaClient) {}

  /**
   * D-11: every receipt always creates a brand-new StockBatch (never merges
   * into an existing one), plus a 'received' StockMovement and an increment
   * of InventoryItem.currentStock, all in one transaction.
   */
  async receiveStock(
    clinicId: string,
    itemId: string,
    userId: string,
    userName: string,
    input: unknown,
  ) {
    const parsed = stockReceiptSchema.parse(input);

    const item = await this.prisma.inventoryItem.findFirst({ where: { id: itemId, clinicId } });
    if (!item) throw notFoundError('Inventory item not found');

    // D-27: expiry date is mandatory for medicine/vaccine/lab_consumable categories.
    if ((EXPIRY_REQUIRED_CATEGORIES as readonly string[]).includes(item.category) && !parsed.expiryDate) {
      throw validationError(`Expiry date is required for ${getCategoryLabel(item.category)} items`);
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.create({
        data: {
          itemId,
          clinicId,
          lotNumber: parsed.lotNumber ?? null,
          expiryDate: parsed.expiryDate ? new Date(parsed.expiryDate) : null,
          purchasePrice: parsed.purchasePrice ?? null, // D-03: purchase price per batch
          supplier: parsed.supplier ?? null,
          initialQty: parsed.quantity,
          currentQty: parsed.quantity,
        },
      });

      // WR-2: this duplicates stock-movement.service.ts's `recordMovement`
      // running-total computation rather than calling it, so it needs the
      // same `SELECT ... FOR UPDATE` lock on the item row first -- otherwise
      // a receipt racing a concurrent adjustment/dispense/stock-take on the
      // same item (which does go through `recordMovement`'s lock) could
      // still read a stale `lastMovement` and corrupt the ledger.
      await tx.$queryRaw`SELECT id FROM inventory_items WHERE id = ${itemId}::uuid FOR UPDATE`;

      const lastMovement = await tx.stockMovement.findFirst({
        where: { itemId, clinicId },
        orderBy: { createdAt: 'desc' },
      });
      const runningTotal = (lastMovement?.runningTotal ?? 0) + parsed.quantity;

      const movement = await tx.stockMovement.create({
        data: {
          clinicId,
          itemId,
          batchId: batch.id,
          type: 'received',
          quantity: parsed.quantity,
          runningTotal,
          userId,
          userName,
        },
      });

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: { increment: parsed.quantity } },
      });

      return { batch, movement };
    });
  }
}
