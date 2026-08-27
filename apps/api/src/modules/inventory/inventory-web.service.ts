import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { getStockLevelStatus, type InventoryCategory, type LowStockItem, type WantListItem } from '@breeyo/types';
import type { AccessPolicyService } from '../web-dashboard/access-policy.service.js';
import type { ParLevelAlertService } from './par-level-alert.service.js';
import type { WantListService } from './want-list.service.js';
import type { StockAdjustmentService } from './stock-adjustment.service.js';
import { BrowserSyncService } from '../../realtime/browser-sync.service.js';

function forbiddenError(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  return error;
}

/** D-37: barcode scanning and on-the-floor inventory actions stay clearly mobile-first even inside the richest browser module. */
export const MOBILE_SCANNING_BOUNDARY_MESSAGE =
  'Barcode scanning stays mobile-first. Use the mobile app to scan and update stock on the floor.';

export type InventoryWebTab = 'stock' | 'reordering' | 'analytics';

export interface InventoryWebBatchSummary {
  batchId: string;
  lotNumber: string | null;
  expiryDate: string | null;
  currentQty: number;
}

export interface InventoryWebStockRow {
  itemId: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  currentStock: number;
  parLevel: number | null;
  isLowStock: boolean;
  /** Nearest active-batch expiry (ISO date string), or null when no batch carries one. */
  nextExpiry: string | null;
  batches: InventoryWebBatchSummary[];
  /**
   * D-33/D-18/D-20: safe inline actions this row currently offers. Empty
   * (never omitted) when the caller's `writeAllowed` is false -- the browser
   * renders that as read-only rows, not as a missing field.
   */
  safeActions: string[];
}

export interface InventoryWebStockAndBatchesPayload {
  tab: 'stock';
  tabLabel: 'Stock & Batches';
  /** D-18: sourced from `AccessPolicyService`'s `inventoryWriteEnabled` for the caller's role. */
  writeAllowed: boolean;
  rows: InventoryWebStockRow[];
}

export interface InventoryWebReorderRow extends WantListItem {
  urgency: 'critical' | 'warning';
}

export interface InventoryWebWorkbenchAction {
  actionId: string;
  label: string;
}

export interface InventoryWebReorderGroup {
  urgency: 'critical' | 'warning';
  items: InventoryWebReorderRow[];
}

export interface InventoryWebReorderingPayload {
  tab: 'reordering';
  tabLabel: 'Reordering';
  groups: InventoryWebReorderGroup[];
  /** D-35, D-36: the exact downstream actions -- "Open item", "Export CSV", "Export PDF". */
  actions: InventoryWebWorkbenchAction[];
}

export interface InventoryWebTurnoverRow {
  itemId: string;
  itemName: string;
  dispensedLast30Days: number;
}

export interface InventoryWebExpiryRiskRow {
  batchId: string;
  itemId: string;
  itemName: string;
  lotNumber: string | null;
  expiryDate: string;
  currentQty: number;
}

export interface InventoryWebAnalyticsPayload {
  tab: 'analytics';
  tabLabel: 'Analytics';
  stockTurnover: InventoryWebTurnoverRow[];
  expiryRisk: InventoryWebExpiryRiskRow[];
  lowStock: LowStockItem[];
  exportActions: InventoryWebWorkbenchAction[];
}

export interface InventoryWebWorkbenchResponse {
  tab: InventoryWebTab;
  /** D-37: present on every tab response, regardless of which payload is attached. */
  scanningBoundaryMessage: string;
  stockAndBatches?: InventoryWebStockAndBatchesPayload;
  reordering?: InventoryWebReorderingPayload;
  analytics?: InventoryWebAnalyticsPayload;
}

interface DbBatchRow {
  id: string;
  lotNumber: string | null;
  expiryDate: Date | null;
  currentQty: number;
}

interface DbItemWithBatchesRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  parLevel: number | null;
  batches: DbBatchRow[];
}

/**
 * Browser inventory workbench (D-26, D-30 to D-37): aggregates the existing
 * Phase 5 inventory module into the three browser tab payloads -- Stock &
 * Batches, Reordering, and Analytics -- plus the D-18 write-gate that keeps
 * Front Desk inventory view-only in the browser unless an Admin has
 * separately granted `inventoryWriteEnabled`. This extends the Phase 5
 * inventory module rather than replacing it: reads reuse
 * `ParLevelAlertService`/`WantListService`, and the one write path
 * (`adjustStock`) delegates to the existing `StockAdjustmentService` so the
 * audit trail, reason requirement (D-04), and actor metadata (D-24) stay
 * identical to the mobile path -- only the D-18 browser-role gate is new.
 */
export class InventoryWebService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessPolicyService: AccessPolicyService,
    private readonly parLevelAlertService: ParLevelAlertService,
    private readonly wantListService: WantListService,
    private readonly stockAdjustmentService: StockAdjustmentService,
    private readonly browserSyncService: BrowserSyncService = new BrowserSyncService(null),
  ) {}

  /**
   * D-83-style fresh read: resolves the caller's current browser role and
   * policy on every call rather than caching, so a write grant an Admin
   * revokes mid-session is enforced on this caller's very next request.
   */
  private async resolveWriteAllowed(clinicId: string, userId: string): Promise<boolean> {
    const roleCode = await this.accessPolicyService.getRoleCodeForUser(clinicId, userId);
    if (!roleCode) return false;
    const policy = await this.accessPolicyService.getPolicy(clinicId, roleCode);
    return policy.inventoryWriteEnabled;
  }

  /** D-31, D-32: one workbench entry point, tabbed by query param -- default `stock`. */
  async getWorkbench(clinicId: string, userId: string, tab: InventoryWebTab): Promise<InventoryWebWorkbenchResponse> {
    const base = { tab, scanningBoundaryMessage: MOBILE_SCANNING_BOUNDARY_MESSAGE };

    switch (tab) {
      case 'reordering':
        return { ...base, reordering: await this.getReordering(clinicId) };
      case 'analytics':
        return { ...base, analytics: await this.getAnalytics(clinicId) };
      case 'stock':
      default:
        return { ...base, tab: 'stock', stockAndBatches: await this.getStockAndBatches(clinicId, userId) };
    }
  }

  /** D-30, D-33, D-18: item + batch rows with the caller's write-eligibility attached. */
  async getStockAndBatches(clinicId: string, userId: string): Promise<InventoryWebStockAndBatchesPayload> {
    const writeAllowed = await this.resolveWriteAllowed(clinicId, userId);

    const items = (await this.db.inventoryItem.findMany({
      where: { clinicId, isActive: true },
      include: {
        batches: { where: { currentQty: { gt: 0 } }, orderBy: { expiryDate: 'asc' } },
      },
      orderBy: { name: 'asc' },
    })) as unknown as DbItemWithBatchesRow[];

    const rows: InventoryWebStockRow[] = items.map((item) => {
      const nextExpiryBatch = item.batches.find((batch) => batch.expiryDate !== null);
      const isLowStock = item.parLevel !== null && item.currentStock < item.parLevel;

      return {
        itemId: item.id,
        name: item.name,
        category: item.category as InventoryCategory,
        unit: item.unit,
        currentStock: item.currentStock,
        parLevel: item.parLevel,
        isLowStock,
        nextExpiry: nextExpiryBatch?.expiryDate ? nextExpiryBatch.expiryDate.toISOString() : null,
        batches: item.batches.map((batch) => ({
          batchId: batch.id,
          lotNumber: batch.lotNumber,
          expiryDate: batch.expiryDate ? batch.expiryDate.toISOString() : null,
          currentQty: batch.currentQty,
        })),
        // D-18/D-20: read-only rows carry an empty action list rather than
        // omitting the field -- the browser hides controls, it never disables them.
        safeActions: writeAllowed ? ['receive', 'adjust'] : [],
      };
    });

    return { tab: 'stock', tabLabel: 'Stock & Batches', writeAllowed, rows };
  }

  /** D-35, D-36: want-list grouped by urgency, connected to the same operational data as Stock & Batches. */
  async getReordering(clinicId: string): Promise<InventoryWebReorderingPayload> {
    const wantList = await this.wantListService.getWantList(clinicId);

    const withUrgency: InventoryWebReorderRow[] = wantList.map((item) => ({
      ...item,
      urgency: getStockLevelStatus(item.currentStock, item.parLevel) === 'critical' ? 'critical' : 'warning',
    }));

    const groups: InventoryWebReorderGroup[] = (['critical', 'warning'] as const)
      .map((urgency) => ({ urgency, items: withUrgency.filter((row) => row.urgency === urgency) }))
      .filter((group) => group.items.length > 0);

    return {
      tab: 'reordering',
      tabLabel: 'Reordering',
      groups,
      actions: [
        { actionId: 'open-item', label: 'Open item' },
        { actionId: 'export-csv', label: 'Export CSV' },
        { actionId: 'export-pdf', label: 'Export PDF' },
      ],
    };
  }

  /** D-29, D-36: operational summaries (turnover, expiry risk, low stock) -- not a separate chart-first dashboard. */
  async getAnalytics(clinicId: string): Promise<InventoryWebAnalyticsPayload> {
    const [lowStock, expiringSoon, stockTurnover] = await Promise.all([
      this.parLevelAlertService.getLowStockItems(clinicId),
      this.parLevelAlertService.getExpiringSoonItems(clinicId),
      this.getTurnoverRows(clinicId),
    ]);

    return {
      tab: 'analytics',
      tabLabel: 'Analytics',
      stockTurnover,
      expiryRisk: expiringSoon.map((batch) => ({
        batchId: batch.batchId,
        itemId: batch.itemId,
        itemName: batch.itemName,
        lotNumber: batch.lotNumber,
        expiryDate: batch.expiryDate.toISOString(),
        currentQty: batch.currentQty,
      })),
      lowStock,
      exportActions: [
        { actionId: 'export-csv', label: 'Export CSV' },
        { actionId: 'export-pdf', label: 'Export PDF' },
      ],
    };
  }

  /** Dispensed quantity per item over the trailing 30 days -- the one metric with no existing repository method. */
  private async getTurnoverRows(clinicId: string): Promise<InventoryWebTurnoverRow[]> {
    const rows = await this.db.$queryRaw<Array<{ itemId: string; itemName: string; dispensedQty: number | bigint }>>(Prisma.sql`
      SELECT m.item_id AS "itemId", i.name AS "itemName", COALESCE(SUM(-m.quantity), 0)::int AS "dispensedQty"
      FROM stock_movements m
      JOIN inventory_items i ON i.id = m.item_id
      WHERE m.clinic_id = ${clinicId}::uuid
        AND m.type = 'dispensed'
        AND m.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY m.item_id, i.name
      ORDER BY "dispensedQty" DESC
    `);

    return rows.map((row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      dispensedLast30Days: Number(row.dispensedQty),
    }));
  }

  /**
   * D-18, D-34, D-37: the one browser write path. Rejects with 403 when the
   * caller's role does not have `inventoryWriteEnabled` -- Admin qualifies
   * by default; Front Desk only once an Admin has separately granted it via
   * `AccessPolicyService.updatePolicy`. Delegates the actual change to the
   * existing `StockAdjustmentService`, which already enforces the D-04
   * reason requirement and records D-24 actor metadata -- this is never a
   * barcode-scan endpoint (D-37), only a reason-bearing quantity change.
   *
   * Plan 10-05, D-05: when `expectedVersion` is present, the write only
   * applies if the item's LIVE `updatedAt` still matches it -- a stale claim
   * is rejected with a 409 `STALE_WRITE_CONFLICT` instead of silently
   * applying a write against a view the caller has not refreshed since
   * another session changed this item's stock. Omitting `expectedVersion`
   * (every caller before this plan) is unaffected.
   *
   * Verify-fix 10.10: the check used to be a separate `findUnique` read
   * followed, several awaits later, by `StockAdjustmentService.adjust`'s own
   * write -- two genuinely concurrent callers sharing a stale
   * `expectedVersion` could both read the row before either had written and
   * both proceed. That was tightened to an atomic conditional `updateMany`
   * claim run BEFORE `StockAdjustmentService.adjust`, but that always
   * committed a fresh `updatedAt` even when the downstream adjustment then
   * failed its own validation -- bumping the version with no real stock
   * change applied. `StockAdjustmentService.adjust` now takes
   * `expectedVersion` itself and folds the version check into the SAME
   * conditional `updateMany` (inside the same transaction as the movement
   * record) that applies the real stock change, so the version only ever
   * advances when a real change lands.
   */
  async adjustStock(
    clinicId: string,
    userId: string,
    userName: string,
    itemId: string,
    input: unknown,
    expectedVersion?: number,
  ) {
    const writeAllowed = await this.resolveWriteAllowed(clinicId, userId);
    if (!writeAllowed) {
      throw forbiddenError('Inventory write access is disabled for your role in the browser (D-18)');
    }

    return this.stockAdjustmentService.adjust(clinicId, itemId, userId, userName, input, expectedVersion);
  }

  /** D-36: CSV export of the same analytics summary shown in the tab. */
  async exportAnalyticsCsv(clinicId: string): Promise<string> {
    const analytics = await this.getAnalytics(clinicId);
    const lines: string[] = ['Section,Item,Metric,Value'];

    for (const row of analytics.stockTurnover) {
      lines.push(`Stock Turnover,${csvEscape(row.itemName)},Dispensed Last 30 Days,${row.dispensedLast30Days}`);
    }
    for (const row of analytics.expiryRisk) {
      lines.push(`Expiry Risk,${csvEscape(row.itemName)},Expiry Date,${row.expiryDate}`);
    }
    for (const row of analytics.lowStock) {
      lines.push(`Low Stock,${csvEscape(row.name)},Current Stock,${row.currentStock}`);
    }

    return lines.join('\n');
  }

  /** D-36: PDF export of the same analytics summary. No PDF dependency is installed in this repo, so this hand-builds a minimal valid PDF/1.4 byte stream rather than adding one for a single export button. */
  async exportAnalyticsPdf(clinicId: string): Promise<Buffer> {
    const analytics = await this.getAnalytics(clinicId);
    const lines = [
      'Breeyo Inventory Analytics',
      ...analytics.stockTurnover.map((row) => `${row.itemName}: dispensed ${row.dispensedLast30Days} (last 30 days)`),
      ...analytics.expiryRisk.map((row) => `${row.itemName}: expires ${row.expiryDate}`),
      ...analytics.lowStock.map((row) => `${row.name}: stock ${row.currentStock} / par ${row.parLevel}`),
    ];

    return buildSimplePdf(lines);
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Minimal hand-built single-page PDF/1.4 document: catalog, pages, one page,
 * a content stream of `Tj` text-show operators (one per line), and a
 * Helvetica font resource. Valid enough for any PDF viewer to open, without
 * pulling in a new dependency (pdfkit/pdf-lib/etc. are not installed
 * anywhere in this repo) for one export button.
 */
function buildSimplePdf(lines: string[]): Buffer {
  const escapePdfText = (line: string) => line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const textStream = lines
    .map((line, index) => `BT /F1 12 Tf 40 ${780 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(textStream, 'latin1')} >>\nstream\n${textStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}
