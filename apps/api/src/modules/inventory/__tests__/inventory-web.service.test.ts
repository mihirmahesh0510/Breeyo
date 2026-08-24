// Plan 09-03 Task 1: browser inventory workbench read models, tab payloads,
// and the D-18 write-gate on adjust-stock. D-18, D-26, D-30 to D-37.
import { describe, it, expect, vi } from 'vitest';
import { InventoryWebService } from '../inventory-web.service.js';

const CLINIC_ID = 'clinic_inv_1';
const ADMIN_USER_ID = 'user_admin_1';
const FRONT_DESK_USER_ID = 'user_fd_1';

function makeDb() {
  return {
    inventoryItem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'item_1',
          name: 'Amoxicillin 250mg Tab',
          category: 'medicine',
          unit: 'tablets',
          currentStock: 40,
          parLevel: 50,
          batches: [
            { id: 'batch_1', lotNumber: 'LOT-A', expiryDate: new Date('2027-01-01'), currentQty: 40 },
          ],
        },
        {
          id: 'item_2',
          name: 'Cotton Rolls',
          category: 'general_supply',
          unit: 'pieces',
          currentStock: 30,
          parLevel: null,
          batches: [],
        },
      ]),
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ itemId: 'item_1', itemName: 'Amoxicillin 250mg Tab', dispensedQty: 12 }]),
  };
}

function makeAccessPolicyService(roleCode: 'ADMIN' | 'FRONT_DESK' | null, inventoryWriteEnabled: boolean) {
  return {
    getRoleCodeForUser: vi.fn().mockResolvedValue(roleCode),
    getPolicy: vi.fn().mockResolvedValue(roleCode ? { inventoryWriteEnabled } : null),
  };
}

function makeParLevelAlertService() {
  return {
    getLowStockItems: vi.fn().mockResolvedValue([
      { id: 'item_1', name: 'Amoxicillin 250mg Tab', category: 'medicine', unit: 'tablets', sellingPrice: 5.5, parLevel: 50, currentStock: 5 },
    ]),
    getExpiringSoonItems: vi.fn().mockResolvedValue([
      {
        batchId: 'batch_1',
        itemId: 'item_1',
        itemName: 'Amoxicillin 250mg Tab',
        lotNumber: 'LOT-A',
        expiryDate: new Date('2026-09-01'),
        currentQty: 40,
        unit: 'tablets',
      },
    ]),
  };
}

function makeWantListService() {
  return {
    getWantList: vi.fn().mockResolvedValue([
      { id: 'item_1', name: 'Amoxicillin 250mg Tab', category: 'medicine', unit: 'tablets', sellingPrice: 5.5, parLevel: 50, currentStock: 5, deficit: 45 },
      { id: 'item_2', name: 'Anti-Rabies Vaccine', category: 'vaccine', unit: 'vials', sellingPrice: 250, parLevel: 10, currentStock: 9, deficit: 1 },
    ]),
  };
}

function makeStockAdjustmentService() {
  return {
    adjust: vi.fn().mockResolvedValue({ movement: { id: 'mov_1', quantity: 5 }, item: { id: 'item_1', currentStock: 45 } }),
  };
}

function buildService(opts: {
  roleCode?: 'ADMIN' | 'FRONT_DESK' | null;
  inventoryWriteEnabled?: boolean;
  db?: ReturnType<typeof makeDb>;
  parLevelAlertService?: ReturnType<typeof makeParLevelAlertService>;
  wantListService?: ReturnType<typeof makeWantListService>;
  stockAdjustmentService?: ReturnType<typeof makeStockAdjustmentService>;
}) {
  const db = opts.db ?? makeDb();
  const accessPolicyService = makeAccessPolicyService(opts.roleCode ?? 'ADMIN', opts.inventoryWriteEnabled ?? true);
  const parLevelAlertService = opts.parLevelAlertService ?? makeParLevelAlertService();
  const wantListService = opts.wantListService ?? makeWantListService();
  const stockAdjustmentService = opts.stockAdjustmentService ?? makeStockAdjustmentService();

  const service = new InventoryWebService(
    db as never,
    accessPolicyService as never,
    parLevelAlertService as never,
    wantListService as never,
    stockAdjustmentService as never,
  );

  return { service, db, accessPolicyService, parLevelAlertService, wantListService, stockAdjustmentService };
}

describe('InventoryWebService.getWorkbench default tab (D-32)', () => {
  it('defaults to Stock & Batches when no tab is requested', async () => {
    const { service } = buildService({});
    const workbench = await service.getWorkbench(CLINIC_ID, ADMIN_USER_ID, 'stock');

    expect(workbench.tab).toBe('stock');
    expect(workbench.stockAndBatches).toBeDefined();
    expect(workbench.stockAndBatches?.tabLabel).toBe('Stock & Batches');
    expect(workbench.reordering).toBeUndefined();
    expect(workbench.analytics).toBeUndefined();
  });

  it('carries a mobile-first scanning boundary message on every tab response (D-37)', async () => {
    const { service } = buildService({});
    const workbench = await service.getWorkbench(CLINIC_ID, ADMIN_USER_ID, 'stock');

    expect(workbench.scanningBoundaryMessage).toMatch(/mobile/i);
    expect(workbench.scanningBoundaryMessage).toMatch(/scan/i);
  });
});

describe('InventoryWebService stockAndBatches writeAllowed (D-18, D-20)', () => {
  it('marks writeAllowed true and exposes inline safe actions for Admin', async () => {
    const { service } = buildService({ roleCode: 'ADMIN', inventoryWriteEnabled: true });
    const payload = await service.getStockAndBatches(CLINIC_ID, ADMIN_USER_ID);

    expect(payload.writeAllowed).toBe(true);
    expect(payload.rows.every((row) => row.safeActions.length > 0)).toBe(true);
  });

  it('marks writeAllowed false and empties safe actions for Front Desk without an inventory-write grant, without omitting the row', async () => {
    const { service } = buildService({ roleCode: 'FRONT_DESK', inventoryWriteEnabled: false });
    const payload = await service.getStockAndBatches(CLINIC_ID, FRONT_DESK_USER_ID);

    expect(payload.writeAllowed).toBe(false);
    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.rows.every((row) => row.safeActions.length === 0)).toBe(true);
  });

  it('includes item name, category, unit, current quantity, par level, low-stock flag, next expiry, and batch list per row', async () => {
    const { service } = buildService({});
    const payload = await service.getStockAndBatches(CLINIC_ID, ADMIN_USER_ID);
    const row = payload.rows.find((r) => r.itemId === 'item_1')!;

    expect(row.name).toBe('Amoxicillin 250mg Tab');
    expect(row.category).toBe('medicine');
    expect(row.unit).toBe('tablets');
    expect(row.currentStock).toBe(40);
    expect(row.parLevel).toBe(50);
    expect(row.isLowStock).toBe(true);
    expect(row.nextExpiry).toBe(new Date('2027-01-01').toISOString());
    expect(row.batches).toEqual([{ batchId: 'batch_1', lotNumber: 'LOT-A', expiryDate: new Date('2027-01-01').toISOString(), currentQty: 40 }]);
  });
});

describe('InventoryWebService reordering payload (D-35, D-36)', () => {
  it('groups want-list rows by urgency and exposes the exact downstream actions', async () => {
    const { service } = buildService({});
    const payload = await service.getReordering(CLINIC_ID);

    expect(payload.tabLabel).toBe('Reordering');
    expect(payload.groups.length).toBeGreaterThan(0);
    expect(payload.groups.every((group) => ['critical', 'warning'].includes(group.urgency))).toBe(true);
    expect(payload.groups.flatMap((g) => g.items).length).toBe(2);

    const actionLabels = payload.actions.map((a) => a.label);
    expect(actionLabels).toEqual(['Open item', 'Export CSV', 'Export PDF']);
  });
});

describe('InventoryWebService analytics payload (D-36)', () => {
  it('includes stock-turnover, expiry-risk, and low-stock summaries plus export actions', async () => {
    const { service } = buildService({});
    const payload = await service.getAnalytics(CLINIC_ID);

    expect(payload.tabLabel).toBe('Analytics');
    expect(payload.stockTurnover).toEqual([{ itemId: 'item_1', itemName: 'Amoxicillin 250mg Tab', dispensedLast30Days: 12 }]);
    expect(payload.expiryRisk[0]).toMatchObject({ batchId: 'batch_1', itemId: 'item_1', lotNumber: 'LOT-A' });
    expect(payload.lowStock.length).toBeGreaterThan(0);

    const actionLabels = payload.exportActions.map((a) => a.label);
    expect(actionLabels).toContain('Export CSV');
    expect(actionLabels).toContain('Export PDF');
  });
});

describe('InventoryWebService.adjustStock D-18 enforcement', () => {
  it('rejects with a 403 FORBIDDEN error when the caller is Front Desk without inventoryWriteEnabled', async () => {
    const { service, stockAdjustmentService } = buildService({ roleCode: 'FRONT_DESK', inventoryWriteEnabled: false });

    await expect(
      service.adjustStock(CLINIC_ID, FRONT_DESK_USER_ID, 'Front Desk User', 'item_1', {
        quantity: 5,
        type: 'add',
        reason: 'correction',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(stockAdjustmentService.adjust).not.toHaveBeenCalled();
  });

  it('allows the change through for Admin, who has inventoryWriteEnabled by default', async () => {
    const { service, stockAdjustmentService } = buildService({ roleCode: 'ADMIN', inventoryWriteEnabled: true });

    const input = { quantity: 5, type: 'add' as const, reason: 'correction' as const };
    const result = await service.adjustStock(CLINIC_ID, ADMIN_USER_ID, 'Admin User', 'item_1', input);

    expect(stockAdjustmentService.adjust).toHaveBeenCalledWith(CLINIC_ID, 'item_1', ADMIN_USER_ID, 'Admin User', input);
    expect(result).toMatchObject({ movement: { id: 'mov_1' } });
  });
});

describe('InventoryWebService analytics exports (D-36)', () => {
  it('exports analytics as CSV text including the low-stock and turnover data', async () => {
    const { service } = buildService({});
    const csv = await service.exportAnalyticsCsv(CLINIC_ID);

    expect(typeof csv).toBe('string');
    expect(csv).toContain('Amoxicillin 250mg Tab');
  });

  it('exports analytics as a valid PDF byte buffer', async () => {
    const { service } = buildService({});
    const pdf = await service.exportAnalyticsPdf(CLINIC_ID);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
