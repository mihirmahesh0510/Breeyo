import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { StockValidatorService } from '../stock-validator.service.js';
import type { StockPlanLine } from '../stock-validator.service.js';

/**
 * Unit coverage for the BIL-02 stock validator.
 *
 * The concurrency guarantee itself (two transactions racing for the last unit)
 * is a property only a real PostgreSQL can demonstrate and is covered by plan
 * 06-08's `tests/billing/finalize-stock.test.ts -t "concurrent"`. What is
 * testable here — and what these tests pin — is everything around it: the
 * contract assertion that keeps an already-dispensed line out of the deduction
 * path, the empty-plan no-op, the shape of the emitted SQL (row lock, expiry
 * exclusion, FIFO ordering, deterministic lock order), and the fact that a
 * shortfall aborts before a single batch is written.
 */

const CLINIC = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ACTOR = { invoiceId: INVOICE, userId: 'user-1', userName: 'Front Desk' };

interface FakeBatchRow {
  id: string;
  itemId: string;
  currentQty: number;
  expiryDate: Date | null;
  receivedAt: Date;
}

/**
 * A transaction double that answers the `FOR UPDATE` batch query from an
 * in-memory table keyed by item id, and records every write it is asked to
 * perform so a test can assert that a failed reservation wrote nothing.
 */
function createFakeTx(batchesByItem: Record<string, FakeBatchRow[]>) {
  const queries: Prisma.Sql[] = [];
  const batchUpdates: Array<{ id: string; decrement: number }> = [];
  const itemUpdates: Array<{ id: string; decrement: number }> = [];

  const tx = {
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
      queries.push(sql);
      // The item id is the second bound parameter (clinic id is the first).
      const itemId = sql.values.find(
        (value): value is string => typeof value === 'string' && value !== CLINIC,
      );
      return (batchesByItem[itemId ?? ''] ?? []).map((row) => ({ ...row }));
    }),
    stockBatch: {
      update: vi.fn(async (args: any) => {
        batchUpdates.push({ id: args.where.id, decrement: args.data.currentQty.decrement });
        return {};
      }),
    },
    inventoryItem: {
      update: vi.fn(async (args: any) => {
        itemUpdates.push({ id: args.where.id, decrement: args.data.currentStock.decrement });
        return {};
      }),
    },
    stockMovement: {
      findMany: vi.fn(async () => []),
    },
  };

  return { tx, queries, batchUpdates, itemUpdates };
}

function createFakeMovementService() {
  let counter = 0;
  return {
    recordMovement: vi.fn(async (_tx: unknown, data: Record<string, unknown>) => {
      counter += 1;
      return { id: `movement-${counter}`, ...data };
    }),
  };
}

function productLine(overrides: Partial<StockPlanLine> = {}): StockPlanLine {
  return {
    lineId: 'line-1',
    inventoryItemId: ITEM_A,
    stockMovementId: null,
    description: 'Meloxicam 5mg',
    quantity: 2,
    unitPricePaise: 5000,
    ...overrides,
  };
}

describe('StockValidatorService.reserveAndDeduct', () => {
  let movementService: ReturnType<typeof createFakeMovementService>;
  let service: StockValidatorService;

  beforeEach(() => {
    movementService = createFakeMovementService();
    service = new StockValidatorService({} as any, movementService as any);
  });

  it('is a no-op returning an empty plan when no line needs deduction', async () => {
    const { tx, queries } = createFakeTx({});

    const result = await service.reserveAndDeduct(tx as any, CLINIC, [], ACTOR);

    expect(result).toEqual([]);
    expect(queries).toHaveLength(0);
    expect(movementService.recordMovement).not.toHaveBeenCalled();
  });

  it('throws STOCK_PLAN_CONTRACT_VIOLATION when a line already carries a stockMovementId', async () => {
    const { tx, batchUpdates } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-1', itemId: ITEM_A, currentQty: 100, expiryDate: null, receivedAt: new Date() }],
    });

    await expect(
      service.reserveAndDeduct(
        tx as any,
        CLINIC,
        [productLine({ stockMovementId: 'movement-already-dispensed' })],
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'STOCK_PLAN_CONTRACT_VIOLATION' });

    // Nothing was locked and nothing was written: the guard fires before any I/O.
    expect(batchUpdates).toEqual([]);
    expect(movementService.recordMovement).not.toHaveBeenCalled();
  });

  it('ignores a service line that carries no inventoryItemId', async () => {
    const { tx, queries } = createFakeTx({});

    const result = await service.reserveAndDeduct(
      tx as any,
      CLINIC,
      [productLine({ inventoryItemId: null as unknown as string, lineId: 'service-line' })],
      ACTOR,
    );

    expect(result).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it('locks the candidate batches FOR UPDATE, excludes expired stock and orders FIFO by expiry', async () => {
    const { tx, queries } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-1', itemId: ITEM_A, currentQty: 10, expiryDate: null, receivedAt: new Date() }],
    });

    await service.reserveAndDeduct(tx as any, CLINIC, [productLine()], ACTOR);

    expect(queries).toHaveLength(1);
    const sql = queries[0].sql;
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('is_expired = false');
    expect(sql).toContain('expiry_date');
    expect(sql).toMatch(/ORDER BY[\s\S]*expiry_date ASC/);
  });

  it('deducts across batches oldest-first and returns the per-batch plan', async () => {
    const { tx, batchUpdates, itemUpdates } = createFakeTx({
      [ITEM_A]: [
        { id: 'batch-old', itemId: ITEM_A, currentQty: 3, expiryDate: new Date('2027-01-01'), receivedAt: new Date('2026-01-01') },
        { id: 'batch-new', itemId: ITEM_A, currentQty: 10, expiryDate: new Date('2028-01-01'), receivedAt: new Date('2026-06-01') },
      ],
    });

    const plan = await service.reserveAndDeduct(
      tx as any,
      CLINIC,
      [productLine({ quantity: 5 })],
      ACTOR,
    );

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ batchId: 'batch-old', quantity: 3 });
    expect(plan[1]).toMatchObject({ batchId: 'batch-new', quantity: 2 });
    expect(batchUpdates).toEqual([
      { id: 'batch-old', decrement: 3 },
      { id: 'batch-new', decrement: 2 },
    ]);
    expect(itemUpdates).toEqual([{ id: ITEM_A, decrement: 5 }]);
    expect(movementService.recordMovement).toHaveBeenCalledTimes(2);
  });

  it('writes one negative dispensed movement per batch, stamped with the invoice and the price snapshot', async () => {
    const { tx } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-1', itemId: ITEM_A, currentQty: 10, expiryDate: null, receivedAt: new Date() }],
    });

    await service.reserveAndDeduct(tx as any, CLINIC, [productLine({ quantity: 4 })], ACTOR);

    expect(movementService.recordMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        clinicId: CLINIC,
        itemId: ITEM_A,
        batchId: 'batch-1',
        type: 'dispensed',
        quantity: -4,
        invoiceId: INVOICE,
        unitPrice: 50,
      }),
    );
  });

  it('succeeds when the request exactly exhausts the available quantity', async () => {
    const { tx, batchUpdates } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-1', itemId: ITEM_A, currentQty: 2, expiryDate: null, receivedAt: new Date() }],
    });

    const plan = await service.reserveAndDeduct(tx as any, CLINIC, [productLine({ quantity: 2 })], ACTOR);

    expect(plan).toHaveLength(1);
    expect(batchUpdates).toEqual([{ id: 'batch-1', decrement: 2 }]);
  });

  it('throws a 409 INSUFFICIENT_STOCK naming the item, and deducts nothing, when one more than available is requested', async () => {
    const { tx, batchUpdates, itemUpdates } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-1', itemId: ITEM_A, currentQty: 2, expiryDate: null, receivedAt: new Date() }],
    });

    await expect(
      service.reserveAndDeduct(tx as any, CLINIC, [productLine({ quantity: 3 })], ACTOR),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      details: {
        shortfalls: [
          { inventoryItemId: ITEM_A, description: 'Meloxicam 5mg', requested: 3, available: 2 },
        ],
      },
    });

    expect(batchUpdates).toEqual([]);
    expect(itemUpdates).toEqual([]);
    expect(movementService.recordMovement).not.toHaveBeenCalled();
  });

  it('reports every short item in one 409 rather than one per round trip', async () => {
    const { tx } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-a', itemId: ITEM_A, currentQty: 1, expiryDate: null, receivedAt: new Date() }],
      [ITEM_B]: [],
    });

    await expect(
      service.reserveAndDeduct(
        tx as any,
        CLINIC,
        [
          productLine({ lineId: 'l1', inventoryItemId: ITEM_A, quantity: 5 }),
          productLine({ lineId: 'l2', inventoryItemId: ITEM_B, description: 'Amoxicillin', quantity: 2 }),
        ],
        ACTOR,
      ),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: {
        shortfalls: [
          { inventoryItemId: ITEM_A, requested: 5, available: 1 },
          { inventoryItemId: ITEM_B, requested: 2, available: 0 },
        ],
      },
    });
  });

  it('aggregates two lines of the same item into one requested quantity', async () => {
    const { tx } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-1', itemId: ITEM_A, currentQty: 3, expiryDate: null, receivedAt: new Date() }],
    });

    await expect(
      service.reserveAndDeduct(
        tx as any,
        CLINIC,
        [
          productLine({ lineId: 'l1', quantity: 2 }),
          productLine({ lineId: 'l2', quantity: 2 }),
        ],
        ACTOR,
      ),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { shortfalls: [{ inventoryItemId: ITEM_A, requested: 4, available: 3 }] },
    });
  });

  it('acquires locks in a deterministic item order so two concurrent finalizes cannot deadlock', async () => {
    const { tx, queries } = createFakeTx({
      [ITEM_A]: [{ id: 'batch-a', itemId: ITEM_A, currentQty: 10, expiryDate: null, receivedAt: new Date() }],
      [ITEM_B]: [{ id: 'batch-b', itemId: ITEM_B, currentQty: 10, expiryDate: null, receivedAt: new Date() }],
    });

    // Presented in descending item order; the service must still lock ascending.
    await service.reserveAndDeduct(
      tx as any,
      CLINIC,
      [
        productLine({ lineId: 'l1', inventoryItemId: ITEM_B, quantity: 1 }),
        productLine({ lineId: 'l2', inventoryItemId: ITEM_A, quantity: 1 }),
      ],
      ACTOR,
    );

    const lockedOrder = queries.map(
      (sql) => sql.values.find((value) => typeof value === 'string' && value !== CLINIC),
    );
    expect(lockedOrder).toEqual([ITEM_A, ITEM_B]);
  });
});

describe('StockValidatorService.checkAvailability', () => {
  it('returns an empty array when every line is available', async () => {
    const db = {
      stockBatch: {
        findMany: vi.fn(async () => [
          { itemId: ITEM_A, currentQty: 5 },
          { itemId: ITEM_A, currentQty: 5 },
        ]),
      },
    };
    const service = new StockValidatorService({} as any, {} as any);

    const shortfalls = await service.checkAvailability(db as any, CLINIC, [productLine({ quantity: 10 })]);

    expect(shortfalls).toEqual([]);
  });

  it('reports a shortfall without taking a lock or writing anything', async () => {
    const findMany = vi.fn(async () => [{ itemId: ITEM_A, currentQty: 1 }]);
    const db = { stockBatch: { findMany } };
    const service = new StockValidatorService({} as any, {} as any);

    const shortfalls = await service.checkAvailability(db as any, CLINIC, [productLine({ quantity: 4 })]);

    expect(shortfalls).toEqual([
      { inventoryItemId: ITEM_A, description: 'Meloxicam 5mg', requested: 4, available: 1 },
    ]);
    // Non-expired batches only, and a read with no `FOR UPDATE` anywhere in sight.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clinicId: CLINIC, isExpired: false }) }),
    );
  });
});
