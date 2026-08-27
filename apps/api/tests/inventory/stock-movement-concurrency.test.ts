import { describe, it, expect, afterEach } from 'vitest';
import { prisma, createTestUser, createTestClinic, createTestInventoryItem } from '../helpers/factories.js';
import { StockMovementService } from '../../src/modules/inventory/stock-movement.service.js';
import { StockAdjustmentService } from '../../src/modules/inventory/stock-adjustment.service.js';

/**
 * WR-2 (WHOLE-REPO-AUDIT-FIX-PLAN.md): `StockMovementService.recordMovement`
 * read the last `StockMovement` row via a plain `findFirst` (no lock),
 * computed `runningTotal = lastMovement.runningTotal + quantity` in
 * application code, then created a new row -- under Postgres's default Read
 * Committed isolation, two concurrent movements on the same item could both
 * read the same `lastMovement` before either committed, both compute the
 * same `runningTotal`, and corrupt the ledger.
 *
 * This fires two GENUINELY concurrent stock adjustments on the same item
 * (`Promise.all`, real Postgres, no mocked Prisma delegate -- same
 * convention as `tests/queue/queue-web-optimistic-concurrency.test.ts` and
 * `tests/billing/billing-web-optimistic-concurrency.test.ts`, adapted to a
 * direct service call per those tests' own "real service calls" allowance)
 * and asserts both resulting movements land non-colliding running totals --
 * one is exactly `quantity` more than the other, never both derived from the
 * same stale base.
 *
 * `apps/api/vitest.config.ts` sets `fileParallelism: false`, so this file's
 * own concurrency has to come from `Promise.all` inside one test. Unlike the
 * two tests referenced above, this file deliberately does NOT call the
 * shared `cleanupTestData()` -- that helper truncates dozens of unrelated
 * tables shared with every other suite in the repo, which under this repo's
 * heavier-than-usual concurrent CI/dev load turns into cross-file lock
 * contention having nothing to do with WR-2. Every fixture below is created
 * with a randomized name/email (the factories' own default), and teardown
 * only deletes the exact rows this test created, scoped by id.
 */
describe('Stock-movement ledger race (WR-2)', () => {
  let clinicId: string | undefined;
  let userId: string | undefined;
  let itemId: string | undefined;

  afterEach(async () => {
    if (itemId) await prisma.stockMovement.deleteMany({ where: { itemId } });
    if (itemId) await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
    if (clinicId) await prisma.clinic.deleteMany({ where: { id: clinicId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    clinicId = undefined;
    userId = undefined;
    itemId = undefined;
  });

  it('gives two genuinely concurrent adjustments on the same item non-colliding, correct running totals', async () => {
    const user = await createTestUser({ fullName: 'Concurrency Vet' });
    const clinic = await createTestClinic(user.id, { name: 'Stock Movement Concurrency Clinic' });
    userId = user.id;
    clinicId = clinic.id;

    const item = await createTestInventoryItem(clinicId, { currentStock: 0 });
    itemId = item.id;

    const stockMovementService = new StockMovementService(prisma as any);
    const stockAdjustmentService = new StockAdjustmentService(prisma as any, stockMovementService);

    const adjust = () =>
      stockAdjustmentService.adjust(clinicId!, itemId!, userId!, 'Concurrency Vet', {
        type: 'add',
        quantity: 5,
        reason: 'correction',
      });

    // Two callers, both racing to append a movement for the same item at
    // once. Before the fix, both could read the same (null) `lastMovement`
    // and both compute `runningTotal = 5`, leaving the ledger with two rows
    // claiming a running total of 5 instead of one at 5 and one at 10.
    const [first, second] = await Promise.all([adjust(), adjust()]);

    expect(first.movement.runningTotal).not.toBe(second.movement.runningTotal);

    const movements = await prisma.stockMovement.findMany({
      where: { itemId, clinicId },
      orderBy: { runningTotal: 'asc' },
    });

    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.runningTotal)).toEqual([5, 10]);

    // The item's real currentStock (maintained independently via atomic
    // `increment`) must agree with the ledger's final running total -- both
    // adjustments genuinely applied.
    const finalItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(finalItem.currentStock).toBe(10);
  });
});
