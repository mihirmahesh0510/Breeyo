import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markNewlyExpiredBatches, runExpiryCheck } from '../expiry-cron.job.js';
import { NotificationType, NotificationModule } from '@breeyo/types';

function createMockPrisma() {
  return {
    stockBatch: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    clinicMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function createMockNotificationBus() {
  return { emit: vi.fn().mockResolvedValue(undefined) } as any;
}

const expiredRow = {
  id: 'batch_expired_1',
  itemId: 'item_1',
  clinicId: 'clinic_1',
  item: { id: 'item_1', name: 'Amoxicillin 250mg Tab', clinicId: 'clinic_1' },
};

const secondExpiredRow = {
  id: 'batch_expired_2',
  itemId: 'item_2',
  clinicId: 'clinic_1',
  item: { id: 'item_2', name: 'Anti-Rabies Vaccine', clinicId: 'clinic_1' },
};

describe('markNewlyExpiredBatches', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('queries only isExpired=false batches with expiryDate < now', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([]);

    await markNewlyExpiredBatches(prisma as any);

    expect(prisma.stockBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isExpired: false,
          expiryDate: { lt: expect.any(Date) },
        },
      }),
    );
  });

  it('marks newly-expired batches isExpired=true', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([expiredRow, secondExpiredRow]);

    const result = await markNewlyExpiredBatches(prisma as any);

    expect(prisma.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['batch_expired_1', 'batch_expired_2'] } },
      data: { isExpired: true },
    });
    expect(result).toEqual([
      { batchId: 'batch_expired_1', itemId: 'item_1', itemName: 'Amoxicillin 250mg Tab', clinicId: 'clinic_1' },
      { batchId: 'batch_expired_2', itemId: 'item_2', itemName: 'Anti-Rabies Vaccine', clinicId: 'clinic_1' },
    ]);
  });

  it('does not touch anything when there are no newly-expired batches (not-yet-expired batches are untouched)', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([]);

    const result = await markNewlyExpiredBatches(prisma as any);

    expect(prisma.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('excludes already-expired batches from the query (idempotent across daily runs)', async () => {
    // The mock itself proves the intent: isExpired:false is always in the where
    // clause, so a batch already flagged isExpired=true is never re-selected
    // or re-updated by a subsequent run.
    prisma.stockBatch.findMany.mockResolvedValue([]);

    await markNewlyExpiredBatches(prisma as any);

    const whereArg = prisma.stockBatch.findMany.mock.calls[0][0].where;
    expect(whereArg.isExpired).toBe(false);
  });
});

describe('runExpiryCheck', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('returns an empty array and skips notification when nothing is newly expired', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([]);
    const bus = createMockNotificationBus();

    const result = await runExpiryCheck(prisma as any, bus);

    expect(result).toEqual([]);
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('marks batches expired and emits one notification per clinic with the newly-expired item ids', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([expiredRow, secondExpiredRow]);
    prisma.clinicMember.findMany.mockResolvedValue([{ userId: 'user_1' }, { userId: 'user_2' }]);
    const bus = createMockNotificationBus();

    const result = await runExpiryCheck(prisma as any, bus);

    expect(result).toHaveLength(2);
    expect(bus.emit).toHaveBeenCalledTimes(1); // both batches belong to clinic_1
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.EXPIRED_STOCK,
        module: NotificationModule.INVENTORY,
        clinicId: 'clinic_1',
        recipientUserIds: ['user_1', 'user_2'],
        data: expect.objectContaining({
          batchIds: ['batch_expired_1', 'batch_expired_2'],
          itemIds: ['item_1', 'item_2'],
        }),
      }),
    );
  });

  it('groups notifications per clinic when newly-expired batches span multiple clinics', async () => {
    const otherClinicRow = {
      id: 'batch_expired_3',
      itemId: 'item_3',
      clinicId: 'clinic_2',
      item: { id: 'item_3', name: 'Deworming Tablets', clinicId: 'clinic_2' },
    };
    prisma.stockBatch.findMany.mockResolvedValue([expiredRow, otherClinicRow]);
    prisma.clinicMember.findMany.mockResolvedValue([{ userId: 'user_1' }]);
    const bus = createMockNotificationBus();

    await runExpiryCheck(prisma as any, bus);

    expect(bus.emit).toHaveBeenCalledTimes(2);
    expect(prisma.clinicMember.findMany).toHaveBeenCalledWith({
      where: { clinicId: 'clinic_1', isActive: true },
      select: { userId: true },
    });
    expect(prisma.clinicMember.findMany).toHaveBeenCalledWith({
      where: { clinicId: 'clinic_2', isActive: true },
      select: { userId: true },
    });
  });

  it('still marks batches expired even when no NotificationBus is supplied', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([expiredRow]);

    const result = await runExpiryCheck(prisma as any);

    expect(prisma.stockBatch.updateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { batchId: 'batch_expired_1', itemId: 'item_1', itemName: 'Amoxicillin 250mg Tab', clinicId: 'clinic_1' },
    ]);
  });

  it('skips notifying a clinic with no active members without throwing', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([expiredRow]);
    prisma.clinicMember.findMany.mockResolvedValue([]);
    const bus = createMockNotificationBus();

    const result = await runExpiryCheck(prisma as any, bus);

    expect(result).toHaveLength(1);
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('does not throw when the notification bus itself fails -- the DB update already succeeded', async () => {
    prisma.stockBatch.findMany.mockResolvedValue([expiredRow]);
    prisma.clinicMember.findMany.mockResolvedValue([{ userId: 'user_1' }]);
    const bus = createMockNotificationBus();
    bus.emit.mockRejectedValue(new Error('queue unavailable'));

    await expect(runExpiryCheck(prisma as any, bus)).resolves.toHaveLength(1);
    expect(prisma.stockBatch.updateMany).toHaveBeenCalledTimes(1);
  });
});
