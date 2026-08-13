import { PrismaClient, type Prisma } from '@prisma/client';

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
 * The per-operation scoping extension.
 *
 * A call made directly on the handle — `request.db.pet.findMany()`, with no
 * enclosing transaction — runs inside a single sequential-array `$transaction`
 * whose first statement binds `app.clinic_id`. The GUC is therefore provably
 * live on the same connection, and inside the same transaction, as the query
 * the RLS policies must filter (T-06-01). `set_config(..., TRUE)` makes the
 * setting transaction-local, so it cannot leak onto a pooled connection handed
 * to the next request.
 *
 * The clinicId is bound as a parameter via tagged-template `$executeRaw` —
 * never interpolated into SQL (T-06-05).
 *
 * This is the shape documented in Prisma's own row-level-security client
 * extension example, applied at the root of `query` (not under `$allModels`)
 * so that raw queries issued through the handle are scoped as well.
 *
 * It is deliberately NOT what runs inside `$transaction(async (tx) => ...)`;
 * see `createTenantClient` below for why.
 */
function buildScopedClient(base: PrismaClient, clinicId: string) {
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

type ScopedClient = ReturnType<typeof buildScopedClient>;

/** Everything a tenant handle exposes except `$transaction`, which is replaced below. */
type ScopedClientWithoutTransaction = Omit<ScopedClient, '$transaction'>;

/** The options Prisma accepts for an interactive transaction. */
export interface TenantTransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * The `tx` handle yielded by `TenantPrismaClient.$transaction(async (tx) => ...)`.
 *
 * `Prisma.TransactionClient` describes the *unextended* client's transaction
 * handle and is not assignable from the extended one, so a helper that accepts
 * a `tx` from a tenant-scoped interactive transaction must be typed against
 * this instead. Casting to `Prisma.TransactionClient` would compile but would
 * silently discard the isolation typing — exactly the escape hatch D-30 is
 * closing — so the alias is derived from the tenant handle rather than
 * declared independently. The key set is unchanged from 06-00: the same five
 * client-only members are removed.
 */
export type TenantTransactionClient = Omit<
  ScopedClientWithoutTransaction,
  '$connect' | '$disconnect' | '$on' | '$extends'
>;

/**
 * The shape of a tenant-scoped handle. Use this instead of `PrismaClient` when
 * typing `request.db`: the extended client is not assignable to the raw one,
 * and casting it away hides exactly the extension that enforces isolation.
 *
 * `$transaction` is narrowed to the interactive overload only — see
 * `createTenantClient`.
 */
export type TenantPrismaClient = ScopedClientWithoutTransaction & {
  $transaction<R>(
    fn: (tx: TenantTransactionClient) => Promise<R>,
    options?: TenantTransactionOptions,
  ): Promise<R>;
};

/**
 * Creates a tenant-scoped handle over the pooled app-role client.
 *
 * Two paths, and the difference between them is the whole point of this
 * function (hotfix 06-00b):
 *
 * 1. **A direct call on the handle** goes through the extension in
 *    `buildScopedClient`: one implicit transaction per call, GUC bound as its
 *    first statement.
 *
 * 2. **`$transaction(async (tx) => ...)`** opens ONE real transaction on the
 *    unextended client, binds the GUC as its first statement, and hands the
 *    callback that transaction's own handle.
 *
 * Path 2 exists because 06-00 shipped only path 1, and path 1 applied to a
 * transaction's statements is actively wrong. The extension fires per
 * operation, so every statement inside an interactive callback was re-wrapped
 * in a *separate* `base.$transaction([...])` on a *separate* pooled
 * connection. The enclosing transaction then held nothing: a throw rolled back
 * an empty transaction while the writes had already committed independently,
 * and a `SELECT ... FOR UPDATE` released its row lock the moment its own
 * one-statement transaction committed rather than at the end of the logical
 * unit of work. Plan 06-08 hit both — a rollback that did not roll back, and
 * two concurrent invoice finalizes that each sold the same last unit of stock,
 * driving `current_qty` to -1.
 *
 * The handle passed to the callback is the *unextended* transaction client on
 * purpose. It needs no per-operation scoping wrapper, because the GUC is
 * already bound, transaction-locally, on the exact connection it is pinned to
 * — and re-applying the wrapper is precisely the bug above. The cast at the
 * boundary is the one place in the codebase where this is sound: the value
 * being cast was constructed three lines earlier by this function, from the
 * app-role client, with `app.clinic_id` set. Callers still see
 * `TenantTransactionClient`, so nothing downstream changes shape.
 *
 * Note that a statement issued on the *outer* handle from inside a callback
 * (`db.pet.findMany()` rather than `tx.pet.findMany()`) still takes path 1 and
 * so runs in its own transaction on its own connection — unchanged from 06-00,
 * still correctly scoped, but not part of the enclosing unit of work, and able
 * to block on a row the enclosing transaction has locked. Use `tx` inside a
 * callback; every repository in the codebase already does.
 */
export function createTenantClient(clinicId: string): TenantPrismaClient {
  // Resolved once and shared by both paths: the direct-call extension and the
  // interactive transaction must sit on the same pooled client, or "one
  // transaction per logical unit of work" would not be true across them.
  const base = getAppPrisma();
  const scoped = buildScopedClient(base, clinicId);

  const tenantTransaction = <R>(
    fn: (tx: TenantTransactionClient) => Promise<R>,
    options?: TenantTransactionOptions,
  ): Promise<R> => {
    if (typeof fn !== 'function') {
      // The sequential-array overload cannot be made atomic through this
      // handle: its promises are already bound to the extended client, so each
      // one would re-enter the wrapper on a connection of its own. Failing
      // loudly beats silently promising atomicity we cannot deliver — which is
      // the exact defect 06-00b exists to remove. No caller uses it.
      throw new TypeError(
        'TenantPrismaClient.$transaction requires a callback. The sequential-array ' +
          'overload is not supported on a tenant-scoped handle; use ' +
          '$transaction(async (tx) => { ... }) instead.',
      );
    }

    return base.$transaction(async (rawTx) => {
      // First statement of the real transaction, on the connection every
      // subsequent statement in `fn` is pinned to. TRUE => transaction-local,
      // so it is discarded when this transaction ends and cannot follow the
      // connection back into the pool. Parameter-bound, never interpolated.
      await rawTx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`;
      return fn(rawTx as unknown as TenantTransactionClient);
    }, options);
  };

  return new Proxy(scoped, {
    get(target, prop, receiver) {
      if (prop === '$transaction') return tenantTransaction;
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as TenantPrismaClient;
}

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
