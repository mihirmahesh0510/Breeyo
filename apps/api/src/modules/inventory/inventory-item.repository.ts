import { Prisma } from '@prisma/client';
import type { TenantPrismaClient, TenantTransactionClient } from '../../lib/prisma-rls.js';
import crypto from 'crypto';
import { CATEGORY_VALUES, UNIT_VALUES, INVENTORY_CATEGORIES, INVENTORY_UNITS } from '@breeyo/types';
import type { AddBarcodeResult, InventorySummary } from '@breeyo/types';
import type {
  CreateItemSchemaInput,
  UpdateItemSchemaInput,
} from '@breeyo/validators';

const DEFAULT_LIST_LIMIT = 30;
const DEFAULT_EXPIRY_LEAD_DAYS = 30; // D-21 default; per-clinic override lands in a later plan

export type ItemSortOption =
  | 'name_asc'
  | 'stock_level_asc'
  | 'created_at_desc'
  | 'expiry_asc'
  | 'category_asc';

export interface ListItemsFilters {
  search?: string;
  category?: string;
  sort?: ItemSortOption;
  page?: number;
  limit?: number;
}

export interface ListItemsResult {
  items: unknown[];
  total: number;
  page: number;
  limit: number;
}

const ITEM_INCLUDE = {
  barcodes: true,
} as const;

export class InventoryItemRepository {
  constructor(private readonly prisma: TenantPrismaClient) {}

  /**
   * D-61: upserts a ClinicInventoryCategory (or ClinicInventoryUnit, in the
   * sibling method below) row when the caller typed a value that isn't one
   * of the predefined constants, via `INSERT ... ON CONFLICT (clinic_id,
   * value) DO NOTHING` (expressed here as a Prisma upsert with an empty
   * `update`, which compiles to the same upsert-or-noop statement).
   */
  private async upsertCustomCategoryIfNeeded(
    tx: TenantTransactionClient,
    clinicId: string,
    category: string,
  ): Promise<void> {
    if ((CATEGORY_VALUES as readonly string[]).includes(category)) return;
    await tx.clinicInventoryCategory.upsert({
      where: { clinicId_value: { clinicId, value: category } },
      create: { clinicId, value: category, label: category },
      update: {},
    });
  }

  private async upsertCustomUnitIfNeeded(
    tx: TenantTransactionClient,
    clinicId: string,
    unit: string,
  ): Promise<void> {
    if ((UNIT_VALUES as readonly string[]).includes(unit)) return;
    await tx.clinicInventoryUnit.upsert({
      where: { clinicId_value: { clinicId, value: unit } },
      create: { clinicId, value: unit, label: unit },
      update: {},
    });
  }

  /**
   * Creates a new InventoryItem (currentStock=0, isActive=true), upserting any
   * clinic-custom category/unit (D-61) and linking the given barcodes (D-16).
   */
  async create(clinicId: string, input: CreateItemSchemaInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.upsertCustomCategoryIfNeeded(tx, clinicId, input.category);
      await this.upsertCustomUnitIfNeeded(tx, clinicId, input.unit);

      const item = await tx.inventoryItem.create({
        data: {
          clinicId,
          name: input.name,
          category: input.category,
          unit: input.unit,
          sellingPrice: input.sellingPrice,
          parLevel: input.parLevel ?? null,
          scheduleH: input.scheduleH ?? false,
          notes: input.notes ?? null,
          photoUrl: input.photoUrl ?? null,
          hsnSacCode: input.hsnSacCode ?? null, // INV-09
          gstRate: input.gstRate ?? null, // INV-09
          currentStock: 0,
          isActive: true,
        },
      });

      if (input.barcodes && input.barcodes.length > 0) {
        await tx.inventoryBarcode.createMany({
          data: input.barcodes.map((barcode) => ({
            code: barcode.code,
            format: barcode.format,
            itemId: item.id,
            clinicId,
          })),
        });
      }

      return tx.inventoryItem.findUniqueOrThrow({
        where: { id: item.id },
        include: ITEM_INCLUDE,
      });
    });
  }

  /**
   * Partial update of an item's fields. Same clinic-custom category/unit
   * upsert as `create` (D-61). Returns null if the item doesn't belong to
   * this clinic (tenant isolation), which the service maps to a 404.
   */
  async update(clinicId: string, itemId: string, input: UpdateItemSchemaInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryItem.findFirst({ where: { id: itemId, clinicId } });
      if (!existing) return null;

      if (input.category !== undefined) {
        await this.upsertCustomCategoryIfNeeded(tx, clinicId, input.category);
      }
      if (input.unit !== undefined) {
        await this.upsertCustomUnitIfNeeded(tx, clinicId, input.unit);
      }

      return tx.inventoryItem.update({
        where: { id: itemId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.unit !== undefined && { unit: input.unit }),
          ...(input.sellingPrice !== undefined && { sellingPrice: input.sellingPrice }),
          ...(input.parLevel !== undefined && { parLevel: input.parLevel }),
          ...(input.scheduleH !== undefined && { scheduleH: input.scheduleH }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.photoUrl !== undefined && { photoUrl: input.photoUrl }),
          ...(input.hsnSacCode !== undefined && { hsnSacCode: input.hsnSacCode }), // INV-09
          ...(input.gstRate !== undefined && { gstRate: input.gstRate }), // INV-09
        },
        include: ITEM_INCLUDE,
      });
    });
  }

  /**
   * D-61: predefined categories/units merged with this clinic's custom entries.
   */
  async listCategories(clinicId: string) {
    const custom = await this.prisma.clinicInventoryCategory.findMany({ where: { clinicId } });
    return [
      ...INVENTORY_CATEGORIES,
      ...custom.map((row) => ({ value: row.value, label: row.label, icon: 'tag' })),
    ];
  }

  async listUnits(clinicId: string) {
    const custom = await this.prisma.clinicInventoryUnit.findMany({ where: { clinicId } });
    return [
      ...INVENTORY_UNITS,
      ...custom.map((row) => ({ value: row.value, label: row.label })),
    ];
  }

  /**
   * D-64: presigned S3 PUT URL for an item photo, following the same
   * dev/prod URL-construction pattern as attachment.service.ts's
   * generateUploadUrl. Returns null if the item doesn't belong to the clinic.
   */
  async generatePhotoUploadUrl(clinicId: string, itemId: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: itemId, clinicId } });
    if (!item) return null;

    const key = `inventory-photos/${clinicId}/${itemId}/${crypto.randomUUID()}.jpg`;
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://s3.ap-south-1.amazonaws.com/breeyo-uploads'
      : 'http://localhost:9000/breeyo-uploads';
    const url = `${baseUrl}/${key}`;

    return {
      uploadUrl: url,
      photoUrl: url,
      expiresIn: 900, // 15 minutes, matching attachment.service.ts
    };
  }

  async findById(clinicId: string, itemId: string) {
    return this.prisma.inventoryItem.findFirst({
      where: { id: itemId, clinicId },
      include: {
        barcodes: true,
        batches: {
          where: { currentQty: { gt: 0 }, isExpired: false },
          orderBy: { receivedAt: 'asc' },
        },
      },
    });
  }

  private sortToOrderBy(sort: ItemSortOption): Prisma.InventoryItemOrderByWithRelationInput {
    switch (sort) {
      case 'stock_level_asc':
        return { currentStock: 'asc' };
      case 'created_at_desc':
        return { createdAt: 'desc' };
      case 'category_asc':
        return { category: 'asc' };
      case 'name_asc':
      default:
        return { name: 'asc' };
    }
  }

  /**
   * PAT-04-style trigram search (D-31) over item name, with an ILIKE fallback
   * and a barcode-code match, scoped to the clinic. Returns item ids ordered
   * by relevance so the caller can paginate and re-fetch with relations.
   */
  private async searchItemIds(clinicId: string, search: string, category?: string): Promise<string[]> {
    const searchTerm = `%${search}%`;
    const categoryFilter = category ? Prisma.sql`AND i.category = ${category}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ id: string; relevance: number }>>(Prisma.sql`
      SELECT i.id::text AS id,
        GREATEST(
          COALESCE(similarity(i.name, ${search}), 0),
          CASE WHEN EXISTS (
            SELECT 1 FROM inventory_barcodes b WHERE b.item_id = i.id AND b.code LIKE ${searchTerm}
          ) THEN 1 ELSE 0 END
        ) AS relevance
      FROM inventory_items i
      WHERE i.clinic_id = ${clinicId}::uuid
        AND i.is_active = true
        ${categoryFilter}
        AND (
          similarity(i.name, ${search}) > 0.15
          OR i.name ILIKE ${searchTerm}
          OR EXISTS (SELECT 1 FROM inventory_barcodes b WHERE b.item_id = i.id AND b.code LIKE ${searchTerm})
        )
      ORDER BY relevance DESC
    `);

    return rows.map((row) => row.id);
  }

  /**
   * expiry_asc sort: nearest active-batch expiry per item, computed via a raw
   * LEFT JOIN + GROUP BY since Prisma's `orderBy` doesn't support MIN() over a
   * to-many relation.
   */
  private async sortIdsByNearestExpiry(clinicId: string, category?: string): Promise<string[]> {
    const categoryFilter = category ? Prisma.sql`AND i.category = ${category}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT i.id::text AS id, MIN(b.expiry_date) AS nearest_expiry
      FROM inventory_items i
      LEFT JOIN stock_batches b
        ON b.item_id = i.id AND b.current_qty > 0 AND b.is_expired = false
      WHERE i.clinic_id = ${clinicId}::uuid AND i.is_active = true ${categoryFilter}
      GROUP BY i.id
      ORDER BY nearest_expiry ASC NULLS LAST
    `);

    return rows.map((row) => row.id);
  }

  private async fetchByIdsPreservingOrder(ids: string[]) {
    if (ids.length === 0) return [];
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: ids } },
      include: ITEM_INCLUDE,
    });
    const order = new Map(ids.map((id, index) => [id, index]));
    return items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  /**
   * Item list/search (D-31, D-36): pg_trgm search on name (+ barcode match),
   * category filter, 5 sort options, pagination. Search and expiry_asc sort
   * both need raw SQL (see helpers above), so those paths resolve an ordered
   * id list first and re-fetch with relations to preserve ordering.
   */
  async list(clinicId: string, filters: ListItemsFilters): Promise<ListItemsResult> {
    const {
      search,
      category,
      sort = 'name_asc',
      page = 1,
      limit = DEFAULT_LIST_LIMIT,
    } = filters;
    const skip = (page - 1) * limit;

    if (search && search.trim().length >= 2) {
      const ids = await this.searchItemIds(clinicId, search.trim(), category);
      const pageIds = ids.slice(skip, skip + limit);
      const items = await this.fetchByIdsPreservingOrder(pageIds);
      return { items, total: ids.length, page, limit };
    }

    if (sort === 'expiry_asc') {
      const ids = await this.sortIdsByNearestExpiry(clinicId, category);
      const pageIds = ids.slice(skip, skip + limit);
      const items = await this.fetchByIdsPreservingOrder(pageIds);
      return { items, total: ids.length, page, limit };
    }

    const where: Prisma.InventoryItemWhereInput = {
      clinicId,
      isActive: true,
      ...(category ? { category } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: this.sortToOrderBy(sort),
        skip,
        take: limit,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * D-32 summary header: total items, low-stock count (D-06 par level),
   * expiring count (D-21 lead time, default 30 days), total catalog value.
   */
  async getSummary(clinicId: string, expiryLeadDays = DEFAULT_EXPIRY_LEAD_DAYS): Promise<InventorySummary> {
    const [totals] = await this.prisma.$queryRaw<Array<{
      totalItems: bigint;
      lowStockCount: bigint;
      totalValue: number | null;
    }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE is_active) AS "totalItems",
        COUNT(*) FILTER (WHERE is_active AND par_level IS NOT NULL AND current_stock < par_level) AS "lowStockCount",
        COALESCE(SUM(current_stock * selling_price) FILTER (WHERE is_active), 0) AS "totalValue"
      FROM inventory_items
      WHERE clinic_id = ${clinicId}::uuid
    `);

    const [expiring] = await this.prisma.$queryRaw<Array<{ expiringCount: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT b.item_id) AS "expiringCount"
      FROM stock_batches b
      JOIN inventory_items i ON i.id = b.item_id
      WHERE b.clinic_id = ${clinicId}::uuid
        AND b.current_qty > 0
        AND b.is_expired = false
        AND b.expiry_date IS NOT NULL
        AND b.expiry_date <= NOW() + (${expiryLeadDays} || ' days')::interval
        AND i.is_active = true
    `);

    return {
      totalItems: Number(totals?.totalItems ?? 0),
      lowStockCount: Number(totals?.lowStockCount ?? 0),
      expiringCount: Number(expiring?.expiringCount ?? 0),
      totalValue: Number(totals?.totalValue ?? 0),
    };
  }

  /**
   * D-63: adds a barcode; on a unique-constraint conflict (code already used
   * by a different item in this clinic), returns a structured conflict
   * instead of throwing, so the client can show "linked to [Item Name]".
   */
  async addBarcode(
    clinicId: string,
    itemId: string,
    code: string,
    format: string,
  ): Promise<AddBarcodeResult> {
    try {
      const barcode = await this.prisma.inventoryBarcode.create({
        data: { code, format, itemId, clinicId },
      });
      return { success: true, barcode } as AddBarcodeResult;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.inventoryBarcode.findUnique({
          where: { code_clinicId: { code, clinicId } },
          include: { item: { select: { id: true, name: true } } },
        });
        if (existing) {
          return {
            success: false,
            conflict: { itemId: existing.item.id, itemName: existing.item.name },
          };
        }
      }
      throw err;
    }
  }

  async removeBarcode(clinicId: string, barcodeId: string) {
    const existing = await this.prisma.inventoryBarcode.findFirst({
      where: { id: barcodeId, clinicId },
    });
    if (!existing) return null;
    await this.prisma.inventoryBarcode.delete({ where: { id: barcodeId } });
    return existing;
  }

  /**
   * Returns the InventoryBarcode row (with its item, item's barcodes, and
   * active batches) for a code within this clinic, or null if unmatched.
   * BarcodeLookupService wraps this into the { found, item, barcodeEntry }
   * shape (BarcodeLookupResult) that callers consume.
   */
  async findByBarcode(clinicId: string, code: string) {
    return this.prisma.inventoryBarcode.findFirst({
      where: { code, clinicId },
      include: {
        item: {
          include: {
            barcodes: true,
            batches: {
              where: { currentQty: { gt: 0 }, isExpired: false },
              orderBy: { receivedAt: 'asc' },
            },
          },
        },
      },
    });
  }

  /**
   * D-19: barcode-to-item mapping for the offline scan cache, with optional
   * incremental sync by `updatedSince`.
   */
  async getBarcodeCatalog(clinicId: string, updatedSince?: Date) {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        clinicId,
        barcodes: { some: {} },
        ...(updatedSince ? { updatedAt: { gt: updatedSince } } : {}),
      },
      include: { barcodes: { select: { code: true, format: true } } },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        currentStock: item.currentStock,
        barcodes: item.barcodes,
      })),
    };
  }
}
