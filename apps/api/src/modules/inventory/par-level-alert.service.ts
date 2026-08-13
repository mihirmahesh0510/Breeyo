import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { LowStockItem, ExpiringBatchItem } from '@breeyo/types';

const DEFAULT_EXPIRY_LEAD_DAYS = 30; // D-21 default; per-clinic override lands via clinic settings

export interface AlertCounts {
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
}

export class ParLevelAlertService {
  constructor(private readonly prisma: TenantPrismaClient) {}

  /**
   * D-06/D-32: items whose combined non-expired batch stock has fallen
   * below their par level, ordered by how critical the shortfall is
   * (lowest stock/parLevel ratio first). Items with parLevel = null (D-06:
   * "no alert threshold") never appear here.
   */
  async getLowStockItems(clinicId: string): Promise<LowStockItem[]> {
    return this.prisma.$queryRaw<LowStockItem[]>(Prisma.sql`
      SELECT
        i.id, i.name, i.category, i.unit,
        i.selling_price AS "sellingPrice",
        i.par_level AS "parLevel",
        COALESCE(SUM(b.current_qty), 0)::int AS "currentStock"
      FROM inventory_items i
      LEFT JOIN stock_batches b ON b.item_id = i.id AND b.is_expired = false
      WHERE i.clinic_id = ${clinicId}::uuid
        AND i.par_level IS NOT NULL
        AND i.is_active = true
      GROUP BY i.id
      HAVING COALESCE(SUM(b.current_qty), 0) < i.par_level
      ORDER BY (COALESCE(SUM(b.current_qty), 0)::float / i.par_level) ASC
    `);
  }

  /**
   * D-21: batches expiring within `leadDays` (configurable 15/30/60/90,
   * default 30) that haven't expired yet, ordered soonest-first.
   */
  async getExpiringSoonItems(clinicId: string, leadDays: number = DEFAULT_EXPIRY_LEAD_DAYS): Promise<ExpiringBatchItem[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + leadDays);

    const batches = await this.prisma.stockBatch.findMany({
      where: {
        clinicId,
        currentQty: { gt: 0 },
        isExpired: false,
        expiryDate: { lte: cutoff, gt: new Date() },
      },
      include: { item: { select: { name: true, unit: true } } },
      orderBy: { expiryDate: 'asc' },
    });

    return batches.map((b) => this.toExpiringBatchItem(b));
  }

  /**
   * D-25: batches that are past their expiry date or already flagged
   * isExpired (by the daily expiry cron), still holding stock. These are
   * blocked from dispensing (fifo-dispense.service.ts) until manually
   * disposed via a stock adjustment with reason='expired_disposal'.
   */
  async getExpiredItems(clinicId: string): Promise<ExpiringBatchItem[]> {
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        clinicId,
        currentQty: { gt: 0 },
        OR: [{ expiryDate: { lte: new Date() } }, { isExpired: true }],
      },
      include: { item: { select: { name: true, unit: true } } },
      orderBy: { expiryDate: 'asc' },
    });

    return batches.map((b) => this.toExpiringBatchItem(b));
  }

  /** D-26: tab counts for the combined "Attention Needed" card. */
  async getAlertCounts(clinicId: string, leadDays: number = DEFAULT_EXPIRY_LEAD_DAYS): Promise<AlertCounts> {
    const [lowStock, expiringSoon, expired] = await Promise.all([
      this.getLowStockItems(clinicId),
      this.getExpiringSoonItems(clinicId, leadDays),
      this.getExpiredItems(clinicId),
    ]);

    return {
      lowStockCount: lowStock.length,
      expiringCount: expiringSoon.length,
      expiredCount: expired.length,
    };
  }

  private toExpiringBatchItem(batch: {
    id: string;
    itemId: string;
    lotNumber: string | null;
    expiryDate: Date | null;
    currentQty: number;
    item: { name: string; unit: string };
  }): ExpiringBatchItem {
    return {
      batchId: batch.id,
      itemId: batch.itemId,
      itemName: batch.item.name,
      lotNumber: batch.lotNumber,
      expiryDate: batch.expiryDate as Date,
      currentQty: batch.currentQty,
      unit: batch.item.unit,
    };
  }
}
