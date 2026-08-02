import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

const CACHE_TTL_SECONDS = 300; // 5 minutes

function cacheKey(userId: string, clinicId: string): string {
  return `perms:${userId}:${clinicId}`;
}

export class PermissionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async getUserPermissions(userId: string, clinicId: string): Promise<string[]> {
    // 1. Check Redis cache
    const cached = await this.redis.get(cacheKey(userId, clinicId));
    if (cached) {
      return JSON.parse(cached) as string[];
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
      return [];
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
    const finalPerms = [...permissionSet];
    await this.redis.setex(
      cacheKey(userId, clinicId),
      CACHE_TTL_SECONDS,
      JSON.stringify(finalPerms),
    );

    // 7. Return
    return finalPerms;
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
