import { PrismaClient } from '@prisma/client';

/**
 * Application-role Prisma client (DATABASE_URL_APP → `breeyo_app`).
 *
 * ONE instance for the whole process. `createTenantClient` used to construct a
 * fresh `PrismaClient` per HTTP request and never `$disconnect` it, which
 * exhausts the PostgreSQL connection pool under sustained traffic (T-06-02).
 */
let appPrisma: PrismaClient | null = null;

/**
 * Number of times the app-role client has actually been constructed.
 * Test-only introspection: lets the suite assert that N calls to
 * `createTenantClient` construct exactly one underlying client.
 */
let appPrismaInstantiations = 0;

export function getAppPrisma(): PrismaClient {
  if (!appPrisma) {
    appPrisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_APP,
    });
    appPrismaInstantiations += 1;
  }
  return appPrisma;
}

export function getAppPrismaInstantiationCount(): number {
  return appPrismaInstantiations;
}

/**
 * Closes the pooled app-role client. Wired to the Fastify `onClose` hook in
 * `plugins/prisma.ts`. A subsequent `createTenantClient` lazily re-opens it.
 */
export async function disconnectAppPrisma(): Promise<void> {
  if (appPrisma) {
    const client = appPrisma;
    appPrisma = null;
    await client.$disconnect();
  }
}

/**
 * Creates a tenant-scoped handle over the pooled app-role client.
 *
 * Every operation performed through the returned handle runs inside a single
 * sequential-array `$transaction` whose first statement binds
 * `app.clinic_id` — so the GUC is provably live on the same connection, and
 * inside the same transaction, as the query the RLS policies must filter
 * (T-06-01). `set_config(..., TRUE)` makes the setting transaction-local, so it
 * cannot leak onto a pooled connection handed to the next request.
 *
 * The clinicId is bound as a parameter via tagged-template `$executeRaw` —
 * never interpolated into SQL (T-06-05).
 *
 * This is the shape documented in Prisma's own row-level-security client
 * extension example, applied at the root of `query` (not under `$allModels`)
 * so that raw queries issued through the handle are scoped as well.
 */
export function createTenantClient(clinicId: string) {
  const base = getAppPrisma();

  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`,
          query(args),
        ]);
        return result;
      },
    },
  });
}

/**
 * The shape of a tenant-scoped handle. Use this instead of `PrismaClient` when
 * typing `request.db`: the extended client is not assignable to the raw one,
 * and casting it away hides exactly the extension that enforces isolation.
 */
export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * The `tx` handle yielded by `TenantPrismaClient.$transaction(async (tx) => ...)`.
 *
 * `Prisma.TransactionClient` describes the *unextended* client's transaction
 * handle and is not assignable from the extended one, so a helper that accepts
 * a `tx` from a tenant-scoped interactive transaction must be typed against
 * this instead. Casting to `Prisma.TransactionClient` would compile but would
 * silently discard the extension's typing — exactly the escape hatch D-30 is
 * closing — so the alias is derived from `TenantPrismaClient` rather than
 * declared independently.
 */
export type TenantTransactionClient = Omit<
  TenantPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/**
 * The Prisma handle a repository or service may be constructed with.
 *
 * On the HTTP path this is always the tenant-scoped `TenantPrismaClient`
 * (`request.db`), so RLS applies. The raw `PrismaClient` arm exists only for
 * the documented callers that have no request context and are cross-clinic by
 * design — currently the midnight-archive cron job (`jobs/midnight-archive.ts`)
 * and unit-test mocks.
 *
 * This union is deliberately NOT the type of `request.db`: widening there
 * would let a handler silently fall back to the RLS-bypassing admin client,
 * which is exactly the D-30 defect this phase is closing. Prefer
 * `TenantPrismaClient` in new code.
 *
 * Note: the interactive `$transaction(async (tx) => ...)` overload does not
 * resolve through this union. Modules that need it (currently `emr`) type
 * their collaborator as `TenantPrismaClient` directly.
 */
export type DbClient = TenantPrismaClient | PrismaClient;

/**
 * Base Prisma client for operations that don't need RLS
 * (e.g., user lookup by email during login, token refresh).
 * Uses DATABASE_URL (breeyo_admin role) — no RLS enforcement.
 */
let basePrisma: PrismaClient | null = null;

export function getBasePrisma(): PrismaClient {
  if (!basePrisma) {
    basePrisma = new PrismaClient();
  }
  return basePrisma;
}
