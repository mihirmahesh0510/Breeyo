import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { stockTakeSchema } from '@breeyo/validators';
import type { StockTakeSummary, StockTakeResult } from '@breeyo/types';
import { StockMovementService } from './stock-movement.service.js';

export class StockTakeService {
  constructor(
    private readonly prisma: TenantPrismaClient,
    private readonly stockMovementService: StockMovementService,
  ) {}

  /**
   * D-37/D-40: physical stock-take. For each entry, re-reads
   * InventoryItem.currentStock *inside* the transaction (RESEARCH.md
   * Pitfall 5) so a concurrent dispense/receipt between the vet starting
   * the count and submitting it isn't silently overwritten. Discrepancies
   * create an 'adjusted' movement with reason='stock_take' (D-04 preset);
   * matches (difference === 0) create no movement row at all, per the
   * append-only principle of not writing no-op audit entries.
   */
  async processStockTake(
    clinicId: string,
    userId: string,
    userName: string,
    input: unknown,
  ): Promise<StockTakeSummary> {
    const parsed = stockTakeSchema.parse(input);

    return this.prisma.$transaction(async (tx) => {
      const results: StockTakeResult[] = [];

      for (const entry of parsed.entries) {
        const item = await tx.inventoryItem.findFirst({
          where: { id: entry.itemId, clinicId },
        });
        if (!item) {
          const error = new Error(`Inventory item not found: ${entry.itemId}`) as Error & {
            statusCode: number;
            code: string;
          };
          error.statusCode = 404;
          error.code = 'ITEM_NOT_FOUND';
          throw error;
        }

        const systemQty = item.currentStock;
        const difference = entry.actualCount - systemQty;

        if (difference !== 0) {
          await this.stockMovementService.recordMovement(tx, {
            clinicId,
            itemId: entry.itemId,
            batchId: null,
            type: 'stock_take',
            quantity: difference,
            reason: 'stock_take',
            userId,
            userName,
          });

          await tx.inventoryItem.update({
            where: { id: entry.itemId },
            data: { currentStock: entry.actualCount },
          });
        }

        results.push({
          itemId: entry.itemId,
          itemName: item.name,
          systemQty,
          actualQty: entry.actualCount,
          difference,
          valueDifference: difference * Number(item.sellingPrice),
        });
      }

      return {
        itemsCounted: results.length,
        matches: results.filter((r) => r.difference === 0).length,
        discrepancies: results.filter((r) => r.difference !== 0).length,
        overCount: results.filter((r) => r.difference > 0).length,
        underCount: results.filter((r) => r.difference < 0).length,
        totalValueDifference: results.reduce((sum, r) => sum + r.valueDifference, 0),
        results,
      };
    });
  }
}
