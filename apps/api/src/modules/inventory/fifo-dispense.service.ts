import { Prisma, type PrismaClient } from '@prisma/client';
import { dispenseSchema } from '@breeyo/validators';
import type { DispenseResult, BatchDeduction } from '@breeyo/types';
import { StockMovementService } from './stock-movement.service.js';

function notFoundError(message: string, code = 'ITEM_NOT_FOUND'): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 404;
  error.code = code;
  return error;
}

function validationError(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

/** Thrown when the total available (non-expired) stock is less than the requested dispense quantity. */
export class InsufficientStockError extends Error {
  statusCode = 409;
  code = 'INSUFFICIENT_STOCK';

  constructor(
    public readonly itemId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Insufficient stock for item ${itemId}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientStockError';
  }
}

/** Raw-SQL row shape for a locked batch, aliased to match the StockBatch camelCase interface. */
interface LockedBatchRow {
  id: string;
  itemId: string;
  clinicId: string;
  lotNumber: string | null;
  expiryDate: Date | null;
  purchasePrice: string | number | null;
  supplier: string | null;
  initialQty: number;
  currentQty: number;
  receivedAt: Date;
  isExpired: boolean;
}

export class FifoDispenseService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stockMovementService: StockMovementService,
  ) {}

  /**
   * D-22/D-25/D-60: FIFO dispensing, transactional with row locking.
   *
   * 1. Loads the item's current sellingPrice (for the D-60 unitPrice snapshot).
   * 2. SELECT ... FOR UPDATE the eligible batch(es) — either the single
   *    overrideBatchId batch (D-22 manual override) or all non-expired
   *    batches for the item ordered oldest-received-first (FIFO).
   * 3. Blocks expired batches: isExpired = false AND (expiryDate IS NULL OR
   *    expiryDate > NOW()) (D-25).
   * 4. Throws InsufficientStockError if total available < requested quantity.
   * 5. Deducts FIFO across batches, creating one 'dispensed' StockMovement
   *    per batch touched, each carrying the unitPrice snapshot and the
   *    optional ownerId (D-60 counter-sale attribution).
   * 6. Decrements InventoryItem.currentStock by the total dispensed.
   */
  async dispense(
    clinicId: string,
    itemId: string,
    userId: string,
    userName: string,
    input: unknown,
  ): Promise<DispenseResult> {
    const parsed = dispenseSchema.parse(input);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId, clinicId } });
      if (!item) throw notFoundError('Inventory item not found');

      const batches = parsed.overrideBatchId
        ? await tx.$queryRaw<LockedBatchRow[]>(Prisma.sql`
            SELECT
              id, item_id AS "itemId", clinic_id AS "clinicId", lot_number AS "lotNumber",
              expiry_date AS "expiryDate", purchase_price AS "purchasePrice", supplier,
              initial_qty AS "initialQty", current_qty AS "currentQty",
              received_at AS "receivedAt", is_expired AS "isExpired"
            FROM stock_batches
            WHERE id = ${parsed.overrideBatchId}::uuid
              AND clinic_id = ${clinicId}::uuid
              AND current_qty > 0
              AND is_expired = false
              AND (expiry_date IS NULL OR expiry_date > NOW())
            FOR UPDATE
          `)
        : await tx.$queryRaw<LockedBatchRow[]>(Prisma.sql`
            SELECT
              id, item_id AS "itemId", clinic_id AS "clinicId", lot_number AS "lotNumber",
              expiry_date AS "expiryDate", purchase_price AS "purchasePrice", supplier,
              initial_qty AS "initialQty", current_qty AS "currentQty",
              received_at AS "receivedAt", is_expired AS "isExpired"
            FROM stock_batches
            WHERE item_id = ${itemId}::uuid
              AND clinic_id = ${clinicId}::uuid
              AND current_qty > 0
              AND is_expired = false
              AND (expiry_date IS NULL OR expiry_date > NOW())
            ORDER BY received_at ASC
            FOR UPDATE
          `);

      const totalAvailable = batches.reduce((sum, b) => sum + b.currentQty, 0);
      if (totalAvailable < parsed.quantity) {
        throw new InsufficientStockError(itemId, parsed.quantity, totalAvailable);
      }

      let remaining = parsed.quantity;
      const deductions: BatchDeduction[] = [];
      const movementIds: string[] = [];
      const unitPrice = Number(item.sellingPrice);

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deductAmount = Math.min(remaining, batch.currentQty);

        await tx.stockBatch.update({
          where: { id: batch.id },
          data: { currentQty: { decrement: deductAmount } },
        });

        const movement = await this.stockMovementService.recordMovement(tx, {
          clinicId,
          itemId,
          batchId: batch.id,
          type: 'dispensed',
          quantity: -deductAmount,
          userId,
          userName,
          consultationId: parsed.consultationId ?? null,
          invoiceId: parsed.invoiceId ?? null,
          // D-60: ownerId is only meaningful for counter sales (no consultationId)
          ownerId: !parsed.consultationId ? parsed.ownerId ?? null : null,
          unitPrice,
        });

        deductions.push({ batchId: batch.id, lotNumber: batch.lotNumber, quantity: deductAmount });
        movementIds.push(movement.id);
        remaining -= deductAmount;
      }

      const updatedItem = await tx.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: { decrement: parsed.quantity } },
      });

      return { deductions, newTotal: updatedItem.currentStock, movementIds };
    });
  }

  /**
   * D-51/D-57: reverses a single dispensed movement — restores the batch's
   * currentQty, increments InventoryItem.currentStock, and creates a new
   * 'returned' StockMovement (append-only; the original dispensed movement
   * is never edited or deleted, per D-45).
   */
  async returnToStock(clinicId: string, movementId: string, userId: string, userName: string) {
    const movement = await this.prisma.stockMovement.findFirst({
      where: { id: movementId, clinicId },
    });
    if (!movement) throw notFoundError('Stock movement not found', 'MOVEMENT_NOT_FOUND');
    if (movement.type !== 'dispensed' || movement.quantity >= 0) {
      throw validationError('Only dispensed movements can be returned to stock');
    }

    const restoreQty = Math.abs(movement.quantity);

    return this.prisma.$transaction(async (tx) => {
      if (movement.batchId) {
        await tx.stockBatch.update({
          where: { id: movement.batchId },
          data: { currentQty: { increment: restoreQty } },
        });
      }

      const returnMovement = await this.stockMovementService.recordMovement(tx, {
        clinicId,
        itemId: movement.itemId,
        batchId: movement.batchId,
        type: 'returned',
        quantity: restoreQty,
        userId,
        userName,
        notes: `Returned from movement ${movement.id}`,
      });

      await tx.inventoryItem.update({
        where: { id: movement.itemId },
        data: { currentStock: { increment: restoreQty } },
      });

      return returnMovement;
    });
  }
}
