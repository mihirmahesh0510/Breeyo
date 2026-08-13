import { describe, it, expect, afterAll } from 'vitest';
import {
  getAppPrisma,
  getAppPrismaInstantiationCount,
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

    // The statement was not altered: users is still there.
    const admin = getAppPrisma();
    const [{ exists }] = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
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
