import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PermissionService } from '../modules/auth/permission.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    permissionService: PermissionService;
  }
  interface FastifyRequest {
    permissions: string[];
  }
}

export function requirePermission(...permissions: string[]) {
  return async function authorizeHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: userId, activeClinicId } = request.user;
    const permissionService = request.server.permissionService;

    const userPerms = await permissionService.getUserPermissions(
      userId,
      activeClinicId,
    );

    const hasAll = permissions.every((p) => userPerms.includes(p));

    if (!hasAll) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }

    request.permissions = userPerms;
  };
}
