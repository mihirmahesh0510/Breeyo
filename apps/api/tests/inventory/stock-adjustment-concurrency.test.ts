import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { StockAdjustmentService } from '../../src/modules/inventory/stock-adjustment.service.js';
import { StockMovementService } from '../../src/modules/inventory/stock-movement.service.js';
import { cleanupTestData, createTestClinic, createTestUser, createTestInventoryItem, prisma } from '../helpers/factories.js';

/**
 * Access-control/whole-repo audit follow-up: the negative-stock residual gap
 * flagged during WR-2 (stock-movement ledger race). `StockAdjustmentService.adjust`
 * reads `item.currentStock` via a plain `findFirst` BEFORE entering its own
 * `$transaction`, then compares it against the requested removal quantity.
 * Two genuinely concurrent "remove" requests can both read the same
 * pre-decrement stock level, both pass that stale check, and both apply --
 * pushing `currentStock` negative even though neither individual request
 * should have been allowed to once the other's effect is accounted for.
 *
 * Real concurrency (`Promise.allSettled`, real Postgres), matching the
 * convention in `tests/queue/queue-web-optimistic-concurrency.test.ts` and
 * `tests/inventory/stock-movement-concurrency.test.ts` (WR-2) -- a mocked
 * Prisma delegate can't reproduce a genuine TOCTOU race between two requests.
 */
describe('StockAdjustmentService: concurrent removals must never push currentStock negative', () => {
  let clinicId: string;
  let userId: string;
  let service: StockAdjustmentService;

  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    const owner = await createTestUser();
    const clinic = await createTestClinic(owner.id);
    clinicId = clinic.id;
    userId = owner.id;
    service = new StockAdjustmentService(prisma as any, new StockMovementService(prisma as any));
  });

  it('rejects the losing concurrent "remove" once the winner has already taken the stock, and never lets currentStock go negative', async () => {
    const item = await createTestInventoryItem(clinicId, { currentStock: 5 });

    // Two concurrent removals of 3 units each against a stock of 5 -- each
    // individually looks valid against the pre-race stock level (3 <= 5),
    // but only one of them can actually be satisfied.
    const adjust = () =>
      service.adjust(clinicId, item.id, userId, 'Test User', {
        type: 'remove',
        quantity: 3,
        reason: 'correction',
      });

    const [first, second] = await Promise.allSettled([adjust(), adjust()]);
    const results = [first, second];

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one of the two genuinely-concurrent removals may succeed --
    // the other must be rejected rather than both silently applying.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason.statusCode).toBe(400);
    expect(rejectedReason.code).toBe('VALIDATION_ERROR');

    const finalItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(finalItem.currentStock).toBe(2);
    expect(finalItem.currentStock).toBeGreaterThanOrEqual(0);
  });

  it('still allows a single valid removal to succeed normally (no false-positive rejection)', async () => {
    const item = await createTestInventoryItem(clinicId, { currentStock: 5 });

    const result = await service.adjust(clinicId, item.id, userId, 'Test User', {
      type: 'remove',
      quantity: 3,
      reason: 'correction',
    });

    expect(result.item.currentStock).toBe(2);
  });
});
