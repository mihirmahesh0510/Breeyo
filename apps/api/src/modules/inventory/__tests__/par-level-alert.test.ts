import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParLevelAlertService } from '../par-level-alert.service.js';
import { WantListService } from '../want-list.service.js';
import { mockClinic, mockItem, mockItemVaccine } from './inventory.fixtures.js';

function createMockPrisma() {
  return {
    $queryRaw: vi.fn(),
    stockBatch: { findMany: vi.fn() },
    clinic: { findUnique: vi.fn() },
  };
}

describe('ParLevelAlertService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ParLevelAlertService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ParLevelAlertService(prisma as any);
  });

  describe('getLowStockItems', () => {
    it('returns items where currentStock < parLevel', async () => {
      const lowStockRow = {
        id: mockItemVaccine.id,
        name: mockItemVaccine.name,
        category: mockItemVaccine.category,
        unit: mockItemVaccine.unit,
        sellingPrice: mockItemVaccine.sellingPrice,
        parLevel: mockItemVaccine.parLevel,
        currentStock: mockItemVaccine.currentStock, // 8 < parLevel 10
      };
      prisma.$queryRaw.mockResolvedValue([lowStockRow]);

      const result = await service.getLowStockItems(mockClinic.id);

      expect(result).toEqual([lowStockRow]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('queries with the par_level IS NOT NULL exclusion for items without a par level', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.getLowStockItems(mockClinic.id);

      const sqlArg = prisma.$queryRaw.mock.calls[0][0];
      expect(sqlArg.sql).toContain('par_level IS NOT NULL');
      expect(sqlArg.sql).toContain('is_active = true');
    });
  });

  describe('getExpiringSoonItems', () => {
    it('returns batches expiring within the lead time window, nearest first', async () => {
      const batch = {
        id: 'batch_soon',
        itemId: mockItem.id,
        lotNumber: 'LOT-SOON',
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        currentQty: 5,
        item: { name: mockItem.name, unit: mockItem.unit },
      };
      prisma.stockBatch.findMany.mockResolvedValue([batch]);

      const result = await service.getExpiringSoonItems(mockClinic.id, 30);

      expect(result).toEqual([
        {
          batchId: batch.id,
          itemId: batch.itemId,
          itemName: mockItem.name,
          lotNumber: batch.lotNumber,
          expiryDate: batch.expiryDate,
          currentQty: batch.currentQty,
          unit: mockItem.unit,
        },
      ]);
      const args = prisma.stockBatch.findMany.mock.calls[0][0];
      expect(args.where.clinicId).toBe(mockClinic.id);
      expect(args.where.isExpired).toBe(false);
      expect(args.orderBy).toEqual({ expiryDate: 'asc' });
    });

    it('respects a custom leadDays configuration (D-21)', async () => {
      prisma.stockBatch.findMany.mockResolvedValue([]);

      await service.getExpiringSoonItems(mockClinic.id, 60);

      const args = prisma.stockBatch.findMany.mock.calls[0][0];
      const daysUntilCutoff = Math.round(
        (args.where.expiryDate.lte.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      );
      expect(daysUntilCutoff).toBeGreaterThanOrEqual(59);
      expect(daysUntilCutoff).toBeLessThanOrEqual(60);
    });
  });

  describe('getExpiredItems', () => {
    it('returns batches past their expiry date or flagged isExpired', async () => {
      const batch = {
        id: 'batch_expired_1',
        itemId: mockItem.id,
        lotNumber: 'LOT-OLD',
        expiryDate: new Date('2026-01-01'),
        currentQty: 5,
        item: { name: mockItem.name, unit: mockItem.unit },
      };
      prisma.stockBatch.findMany.mockResolvedValue([batch]);

      const result = await service.getExpiredItems(mockClinic.id);

      expect(result).toHaveLength(1);
      expect(result[0].batchId).toBe(batch.id);
      const args = prisma.stockBatch.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { expiryDate: { lte: expect.any(Date) } },
        { isExpired: true },
      ]);
    });
  });

  describe('getAlertCounts', () => {
    it('returns correct counts for all three categories', async () => {
      prisma.$queryRaw.mockResolvedValue([{}, {}]); // 2 low-stock
      prisma.stockBatch.findMany
        .mockResolvedValueOnce([{ id: 'b1', itemId: 'i1', lotNumber: null, expiryDate: new Date(), currentQty: 1, item: { name: 'x', unit: 'u' } }]) // 1 expiring
        .mockResolvedValueOnce([]); // 0 expired

      const counts = await service.getAlertCounts(mockClinic.id);

      expect(counts).toEqual({ lowStockCount: 2, expiringCount: 1, expiredCount: 0 });
    });
  });
});

describe('WantListService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let alertService: ParLevelAlertService;
  let wantListService: WantListService;

  beforeEach(() => {
    prisma = createMockPrisma();
    alertService = new ParLevelAlertService(prisma as any);
    wantListService = new WantListService(alertService, prisma as any);
  });

  describe('getWantList', () => {
    it('generates ordered list by deficit descending', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 'i1', name: 'Item A', category: 'medicine', unit: 'tablets', sellingPrice: 5, parLevel: 50, currentStock: 45 }, // deficit 5
        { id: 'i2', name: 'Item B', category: 'vaccine', unit: 'vials', sellingPrice: 100, parLevel: 20, currentStock: 2 }, // deficit 18
      ]);

      const result = await wantListService.getWantList(mockClinic.id);

      expect(result.map((r) => r.id)).toEqual(['i2', 'i1']);
      expect(result[0].deficit).toBe(18);
      expect(result[1].deficit).toBe(5);
    });
  });

  describe('generateWhatsAppText', () => {
    it('matches the D-28 want-list text specification', () => {
      const items = [
        { id: 'i1', name: 'Amoxicillin 250mg', category: 'medicine', unit: 'tablets', sellingPrice: 5, parLevel: 50, currentStock: 5, deficit: 45 },
        { id: 'i2', name: 'Anti-Rabies Vaccine', category: 'vaccine', unit: 'vials', sellingPrice: 250, parLevel: 10, currentStock: 2, deficit: 8 },
      ];

      const text = wantListService.generateWhatsAppText(items, 'Test Vet Clinic');
      const lines = text.split('\n');

      expect(lines[0]).toMatch(/^Breeyo Want-List \(\d{2} \w{3} \d{4}\)$/);
      expect(lines[1]).toBe('Test Vet Clinic');
      expect(lines[2]).toMatch(/^─+$/);
      expect(lines[3]).toBe('1. Amoxicillin 250mg - Current: 5, Par: 50');
      expect(lines[4]).toBe('2. Anti-Rabies Vaccine - Current: 2, Par: 10');
      expect(lines[5]).toMatch(/^─+$/);
      expect(lines[6]).toBe('Generated by Breeyo');
    });

    it('handles an empty want list', () => {
      const text = wantListService.generateWhatsAppText([], 'Test Vet Clinic');
      expect(text).toContain('Breeyo Want-List');
      expect(text).toContain('Generated by Breeyo');
    });
  });

  describe('getWantListWhatsAppText', () => {
    it('resolves the clinic name and formats the full message', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 'i1', name: 'Item A', category: 'medicine', unit: 'tablets', sellingPrice: 5, parLevel: 50, currentStock: 5 },
      ]);
      prisma.clinic.findUnique.mockResolvedValue({ name: 'Test Vet Clinic' });

      const text = await wantListService.getWantListWhatsAppText(mockClinic.id);

      expect(text).toContain('Test Vet Clinic');
      expect(text).toContain('Item A');
    });

    it('falls back to a generic clinic label if the clinic lookup misses', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.clinic.findUnique.mockResolvedValue(null);

      const text = await wantListService.getWantListWhatsAppText(mockClinic.id);

      expect(text).toContain('Clinic');
    });
  });
});
