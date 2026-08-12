import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Data accepted by recordMovement. `quantity` is signed (positive = stock
 * increase, negative = decrease) per D-45. `unitPrice`/`ownerId` are D-60
 * fields — callers (fifo-dispense.service.ts) populate them on dispensed
 * movements; every other movement type passes them through as undefined/null.
 */
export interface RecordMovementInput {
  clinicId: string;
  itemId: string;
  batchId?: string | null;
  type: string; // MovementType: 'received'|'dispensed'|'adjusted'|'disposed'|'stock_take'|'returned'
  quantity: number;
  reason?: string | null;
  userId: string;
  userName: string;
  consultationId?: string | null;
  invoiceId?: string | null;
  ownerId?: string | null; // D-60
  unitPrice?: number | null; // D-60
  notes?: string | null;
}

export interface GetHistoryOptions {
  page?: number;
  limit?: number;
}

const DEFAULT_HISTORY_LIMIT = 20;
const EXPORT_RETENTION_MONTHS = 12; // D-48 rolling 12-month retention window

export class StockMovementService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * D-45: append-only movement creation. No UPDATE or DELETE on movements —
   * every stock event (received/dispensed/adjusted/disposed/stock_take/returned)
   * gets a brand-new row here. runningTotal is derived from the previous
   * movement for this item+clinic (0 if this is the first movement ever).
   *
   * Takes the transaction client explicitly so callers (fifo-dispense,
   * stock-adjustment, stock-take services) can compose this into their own
   * atomic transaction rather than opening a nested one.
   */
  async recordMovement(tx: Prisma.TransactionClient, data: RecordMovementInput) {
    const lastMovement = await tx.stockMovement.findFirst({
      where: { itemId: data.itemId, clinicId: data.clinicId },
      orderBy: { createdAt: 'desc' },
    });

    const runningTotal = (lastMovement?.runningTotal ?? 0) + data.quantity;

    return tx.stockMovement.create({
      data: {
        clinicId: data.clinicId,
        itemId: data.itemId,
        batchId: data.batchId ?? null,
        type: data.type,
        quantity: data.quantity,
        reason: data.reason ?? null,
        runningTotal,
        userId: data.userId,
        userName: data.userName,
        consultationId: data.consultationId ?? null,
        invoiceId: data.invoiceId ?? null,
        ownerId: data.ownerId ?? null,
        unitPrice: data.unitPrice ?? null,
        notes: data.notes ?? null,
      },
    });
  }

  /**
   * D-46: chronological timeline (newest first), paginated. Used by the
   * item profile's "History" tab.
   */
  async getHistory(clinicId: string, itemId: string, options: GetHistoryOptions = {}) {
    const page = options.page ?? 1;
    const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { clinicId, itemId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where: { clinicId, itemId } }),
    ]);

    return { movements, total, page, limit };
  }

  /**
   * D-47: flat rows for CSV export, scoped to the D-48 rolling 12-month
   * retention window (older rows are archived by the retention job, not
   * queryable here).
   */
  async getMovementsForExport(clinicId: string, itemId: string) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - EXPORT_RETENTION_MONTHS);

    return this.prisma.stockMovement.findMany({
      where: { clinicId, itemId, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
