import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

const CACHE_TTL_SECONDS = 300; // 5 minutes

function cacheKey(userId: string, clinicId: string): string {
  return `perms:${userId}:${clinicId}`;
}

export interface UserPermissionsResult {
  /**
   * Whether an active `ClinicMember` row exists for (userId, clinicId).
   * `false` means the session is stale — the account was deactivated or the
   * clinic membership was removed after the token was issued — and callers
   * (see `tenantContext`) must treat that as an invalid session (401), not as
   * "authenticated but permission-less" (E2E-BUG-FIX-PLAN.md §1.1).
   */
  exists: boolean;
  permissions: string[];
}

export class PermissionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async getUserPermissionsResult(
    userId: string,
    clinicId: string,
  ): Promise<UserPermissionsResult> {
    // 1. Check Redis cache
    const cached = await this.redis.get(cacheKey(userId, clinicId));
    if (cached) {
      const parsed = JSON.parse(cached);
      // Defensive: a cache entry written before this change is a bare
      // `string[]` (permissions only). The old code could only have cached
      // one if `member` was truthy, so treat it as exists=true rather than
      // requiring every existing Redis key to be flushed on deploy.
      if (Array.isArray(parsed)) {
        return { exists: true, permissions: parsed };
      }
      return parsed as UserPermissionsResult;
    }

    // 2. Query ClinicMember with roles and their permissions
    const member = await this.prisma.clinicMember.findFirst({
      where: { userId, clinicId, isActive: true },
      include: {
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!member) {
      const result: UserPermissionsResult = { exists: false, permissions: [] };
      await this.redis.setex(cacheKey(userId, clinicId), CACHE_TTL_SECONDS, JSON.stringify(result));
      return result;
    }

    // 3. Collect default permissions from all roles
    const permissionSet = new Set<string>();
    for (const memberRole of member.roles) {
      for (const rp of memberRole.role.rolePermissions) {
        permissionSet.add(rp.permission.code);
      }
    }

    // 4. Query permission overrides
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { clinicMemberId: member.id },
      include: { permission: true },
    });

    // 5. Apply overrides
    for (const override of overrides) {
      if (override.granted) {
        permissionSet.add(override.permission.code);
      } else {
        permissionSet.delete(override.permission.code);
      }
    }

    // 6. Cache result
    const result: UserPermissionsResult = { exists: true, permissions: [...permissionSet] };
    await this.redis.setex(cacheKey(userId, clinicId), CACHE_TTL_SECONDS, JSON.stringify(result));

    // 7. Return
    return result;
  }

  async getUserPermissions(userId: string, clinicId: string): Promise<string[]> {
    const { permissions } = await this.getUserPermissionsResult(userId, clinicId);
    return permissions;
  }

  async invalidateCache(userId: string, clinicId: string): Promise<void> {
    await this.redis.del(cacheKey(userId, clinicId));
  }

  async hasPermission(
    userId: string,
    clinicId: string,
    ...permissions: string[]
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, clinicId);
    return permissions.every((p) => userPerms.includes(p));
  }
}
