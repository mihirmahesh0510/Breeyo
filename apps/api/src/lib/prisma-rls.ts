import { PrismaClient } from '@prisma/client';

/**
 * Creates a tenant-scoped Prisma client that sets app.clinic_id
 * on every connection before executing queries.
 *
 * Uses Prisma's $extends to inject SET LOCAL on every transaction.
 * The connection uses DATABASE_URL_APP (breeyo_app role) so RLS applies.
 */
export function createTenantClient(clinicId: string): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL_APP,
  });

  return client.$extends({
    query: {
      $allOperations: async ({ args, query, operation }) => {
        // SET LOCAL scopes the setting to the current transaction
        await (client as any).$executeRawUnsafe(
          `SET LOCAL app.clinic_id = '${clinicId}'`,
        );
        return query(args);
      },
    },
  }) as unknown as PrismaClient;
}

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
