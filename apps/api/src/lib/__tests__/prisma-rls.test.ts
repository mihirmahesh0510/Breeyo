import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  getAppPrisma,
  getAppPrismaInstantiationCount,
  getBasePrisma,
  createTenantClient,
  disconnectAppPrisma,
} from '../prisma-rls.js';

/**
 * Phase 6 plan 06-00 (D-30) — tenant handle contract.
 *
 * These tests pin the three defects the remediation must fix:
 *   1. a new PrismaClient per request (pool exhaustion, never disconnected),
 *   2. the GUC set as a statement separate from the query it scopes,
 *   3. the clinicId string-interpolated into `$executeRawUnsafe`.
 */

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';

const HAS_APP_DB = Boolean(process.env.DATABASE_URL_APP);

async function readGuc(
  db: ReturnType<typeof createTenantClient>,
): Promise<string | null> {
  const rows = await db.$queryRaw<
    Array<{ clinic_id: string | null }>
  >`SELECT current_setting('app.clinic_id', true) AS clinic_id`;
  return rows[0]?.clinic_id ?? null;
}

afterAll(async () => {
  await disconnectAppPrisma();
});

describe('prisma-rls tenant handle (D-30)', () => {
  it('reuses one pooled app-role client across many createTenantClient calls', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    await disconnectAppPrisma();
    const before = getAppPrismaInstantiationCount();

    const handles = Array.from({ length: 50 }, () => createTenantClient(CLINIC_A));

    expect(handles).toHaveLength(50);
    // Exactly one PrismaClient was constructed for all 50 handles.
    expect(getAppPrismaInstantiationCount()).toBe(before + 1);
    // ...and the singleton accessor hands back that same instance.
    expect(getAppPrisma()).toBe(getAppPrisma());
    expect(getAppPrismaInstantiationCount()).toBe(before + 1);
  });

  it('makes app.clinic_id observable inside the operation it scopes', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const db = createTenantClient(CLINIC_A);
    expect(await readGuc(db)).toBe(CLINIC_A);
  });

  it('does not bleed app.clinic_id between two tenant handles', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const dbA = createTenantClient(CLINIC_A);
    const dbB = createTenantClient(CLINIC_B);

    expect(await readGuc(dbA)).toBe(CLINIC_A);
    expect(await readGuc(dbB)).toBe(CLINIC_B);
    // Reading back through A must still see A, not the value B left behind.
    expect(await readGuc(dbA)).toBe(CLINIC_A);
  });

  it('parameter-binds the clinicId so a quote cannot alter the statement', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const injected = "abc' , false); DROP TABLE users; --";
    const db = createTenantClient(injected);

    // No syntax error, and the value round-trips verbatim (bound, not interpolated).
    expect(await readGuc(db)).toBe(injected);

    // The statement was not altered: users is still there. Probe pg_catalog
    // rather than information_schema — the latter is privilege-filtered and
    // would report "absent" for a table breeyo_app merely lacks grants on.
    const app = getAppPrisma();
    const [{ exists }] = await app.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename = 'users'
      ) AS exists
    `;
    expect(exists).toBe(true);
  });

  it('recovers after disconnectAppPrisma()', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    await expect(disconnectAppPrisma()).resolves.toBeUndefined();

    const db = createTenantClient(CLINIC_B);
    expect(await readGuc(db)).toBe(CLINIC_B);
  });
});

/**
 * Phase 6 hotfix 06-00b — the tenant handle's interactive transaction must be
 * a REAL transaction.
 *
 * `createTenantClient` bound the GUC by wrapping every intercepted operation in
 * its own `base.$transaction([...])`. That is correct for one top-level call,
 * but inside `db.$transaction(async (tx) => ...)` every statement was still
 * re-wrapped in a separate transaction of its own — so the "outer" transaction
 * held nothing. Plan 06-08 hit both consequences on a real database:
 *
 *   1. a write inside a callback that throws was committed anyway, and
 *   2. `SELECT ... FOR UPDATE` released its row lock as soon as the individual
 *      statement's own transaction committed, so two concurrent finalizes each
 *      saw the last unit of stock and drove `current_qty` to -1.
 *
 * These tests pin both against a real PostgreSQL. They are deliberately written
 * against the *contract* (one transaction, atomic rollback, locks held for the
 * block) rather than the mechanism, so they keep their value if the internals
 * change again.
 */
describe('tenant handle interactive transactions (06-00b)', () => {
  const admin = getBasePrisma();

  let clinicId = '';
  let userId = '';
  let itemId = '';
  let batchId = '';

  /** Unique-per-run so a leftover row from an earlier run cannot mask a bug. */
  const suffix = () => randomUUID().slice(0, 8);
  const uniqueMobile = () => `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`;

  beforeAll(async () => {
    if (!HAS_APP_DB) return;

    const user = await admin.user.create({
      data: {
        email: `rls-tx-${suffix()}@test.com`,
        phone: uniqueMobile(),
        fullName: 'RLS Tx Fixture',
        passwordHash: 'not-a-real-hash',
      },
    });
    userId = user.id;

    const clinic = await admin.clinic.create({
      data: {
        name: `RLS Tx Clinic ${suffix()}`,
        address: '1 Transaction Road, Mumbai 400001',
        contactPhone: uniqueMobile(),
        ownerId: user.id,
      },
    });
    clinicId = clinic.id;

    const item = await admin.inventoryItem.create({
      data: {
        clinicId,
        name: `Last-unit probe ${suffix()}`,
        category: 'medicine',
        unit: 'tablets',
        sellingPrice: '10.00',
        currentStock: 1,
      },
    });
    itemId = item.id;

    const batch = await admin.stockBatch.create({
      data: { clinicId, itemId, initialQty: 1, currentQty: 1 },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    if (!HAS_APP_DB) return;

    // Narrowly scoped teardown: this file owns only the rows it created, and
    // must not run the shared cleanupTestData() sledgehammer that other suites
    // use — it would delete fixtures belonging to whichever file runs next.
    await admin.stockMovement.deleteMany({ where: { clinicId } });
    await admin.stockBatch.deleteMany({ where: { clinicId } });
    await admin.inventoryItem.deleteMany({ where: { clinicId } });
    await admin.petOwner.deleteMany({ where: { clinicId } });
    await admin.clinic.deleteMany({ where: { id: clinicId } });
    await admin.user.deleteMany({ where: { id: userId } });
    await admin.$disconnect();
  });

  beforeEach(async () => {
    if (!HAS_APP_DB) return;
    await admin.stockBatch.update({ where: { id: batchId }, data: { currentQty: 1 } });
  });

  it('runs every statement of one callback in a single database transaction', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const db = createTenantClient(clinicId);

    const probe = async (
      tx: Pick<typeof db, '$queryRaw'>,
    ): Promise<{ txid: string; pid: string }> => {
      const rows = await tx.$queryRaw<Array<{ txid: string; pid: string }>>`
        SELECT txid_current()::text AS txid, pg_backend_pid()::text AS pid
      `;
      return rows[0]!;
    };

    const [first, second] = await db.$transaction(async (tx) => {
      const a = await probe(tx);
      const b = await probe(tx);
      return [a, b] as const;
    });

    // Same backend AND same transaction id: the two statements really did share
    // one transaction on one pooled connection.
    expect(second.pid).toBe(first.pid);
    expect(second.txid).toBe(first.txid);

    // ...and a separate call is a genuinely separate transaction, so the
    // assertion above cannot be satisfied by some process-wide constant.
    const other = await db.$transaction(async (tx) => probe(tx));
    expect(other.txid).not.toBe(first.txid);
  });

  it('rolls the whole callback back when it throws (empirical failure #1)', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const db = createTenantClient(clinicId);
    const mobile = uniqueMobile();

    await expect(
      db.$transaction(async (tx) => {
        await tx.petOwner.create({
          data: { clinicId, mobile, name: 'Rollback probe' },
        });
        // The row exists inside the transaction...
        const insideTx = await tx.petOwner.findFirst({ where: { clinicId, mobile } });
        expect(insideTx).not.toBeNull();

        throw new Error('rollback probe');
      }),
    ).rejects.toThrow('rollback probe');

    // ...and must not survive it. Read back with the RLS-bypassing admin client
    // so a scoping bug cannot be mistaken for a successful rollback.
    const leaked = await admin.petOwner.findFirst({ where: { clinicId, mobile } });
    expect(leaked).toBeNull();
  });

  it('holds SELECT ... FOR UPDATE for the whole callback (empirical failure #2)', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const db = createTenantClient(clinicId);

    /**
     * The finalize-a-sale shape from plan 06-08, reduced to its essentials:
     * lock the batch row, decide against the locked quantity, then decrement.
     * The await between the lock and the write is what a real handler does
     * (GST maths, numbering, audit) and what makes the lock's lifetime
     * observable.
     */
    const sellLastUnit = async (): Promise<'sold' | 'insufficient'> =>
      db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ current_qty: number }>>`
          SELECT current_qty FROM stock_batches WHERE id = ${batchId}::uuid FOR UPDATE
        `;
        const available = rows[0]?.current_qty ?? 0;
        if (available < 1) return 'insufficient';

        await new Promise((resolve) => setTimeout(resolve, 150));

        await tx.stockBatch.update({
          where: { id: batchId },
          data: { currentQty: { decrement: 1 } },
        });
        return 'sold';
      });

    const results = await Promise.all([sellLastUnit(), sellLastUnit()]);

    // Exactly one caller may sell the last unit.
    expect(results.filter((r) => r === 'sold')).toHaveLength(1);
    expect(results.filter((r) => r === 'insufficient')).toHaveLength(1);

    // And stock must never go negative — the oversell 06-08 observed.
    const after = await admin.stockBatch.findUnique({ where: { id: batchId } });
    expect(after?.currentQty).toBe(0);
  });

  it('still binds app.clinic_id for every statement inside the callback', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const db = createTenantClient(clinicId);

    const seen = await db.$transaction(async (tx) => {
      const before = await tx.$queryRaw<Array<{ clinic_id: string | null }>>`
        SELECT current_setting('app.clinic_id', true) AS clinic_id
      `;
      // A write, then read the GUC again: it must still be bound afterwards,
      // not consumed by the first statement.
      await tx.petOwner.create({
        data: { clinicId, mobile: uniqueMobile(), name: 'GUC probe' },
      });
      const after = await tx.$queryRaw<Array<{ clinic_id: string | null }>>`
        SELECT current_setting('app.clinic_id', true) AS clinic_id
      `;
      return [before[0]?.clinic_id ?? null, after[0]?.clinic_id ?? null];
    });

    expect(seen).toEqual([clinicId, clinicId]);
  });

  it('does not let the callback write outside its own clinic', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    // A handle for a clinic that is not the fixture's: RLS must reject the
    // INSERT, proving the transaction path did not quietly drop the GUC.
    const foreign = createTenantClient(CLINIC_A);

    await expect(
      foreign.$transaction(async (tx) => {
        await tx.petOwner.create({
          data: { clinicId, mobile: uniqueMobile(), name: 'Cross-tenant probe' },
        });
      }),
    ).rejects.toThrow();
  });

  it('leaves a single top-level operation scoped exactly as before', async () => {
    if (!HAS_APP_DB) {
      console.warn('Skipping: DATABASE_URL_APP not set');
      return;
    }

    const db = createTenantClient(clinicId);

    // No enclosing $transaction: the handle must still bind the GUC itself.
    const owner = await db.petOwner.create({
      data: { clinicId, mobile: uniqueMobile(), name: 'Top-level probe' },
    });
    expect(owner.clinicId).toBe(clinicId);

    const found = await db.petOwner.findMany({ where: { id: owner.id } });
    expect(found).toHaveLength(1);

    // ...and another clinic's handle cannot see it.
    const foreign = createTenantClient(CLINIC_A);
    expect(await foreign.petOwner.findMany({ where: { id: owner.id } })).toHaveLength(0);
  });
});
