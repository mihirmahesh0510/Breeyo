import type { FastifyRequest, FastifyReply } from 'fastify';
import { createTenantClient } from '../lib/prisma-rls.js';
import type { TenantPrismaClient } from '../lib/prisma-rls.js';
import { AUTH_ERRORS } from '@breeyo/types';
import { PermissionService } from '../modules/auth/permission.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Typed against the extended client, not the raw PrismaClient: casting the
    // extension away would hide the very wrapper that binds app.clinic_id.
    db: TenantPrismaClient;
  }
}

export async function tenantContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const clinicId = request.user?.activeClinicId;

  if (!clinicId) {
    return reply.status(400).send({ error: AUTH_ERRORS.CLINIC_NOT_SELECTED });
  }

  // E2E-BUG-FIX-PLAN.md §1.1: a session survives its account/clinic
  // membership being removed (JWTs are only signature-checked, not looked up
  // per request) unless something checks the membership still exists. Built
  // as its own `PermissionService` instance rather than
  // `request.server.permissionService` — that decoration is scoped to
  // whichever module registered it first (Fastify plugin encapsulation; see
  // patient.routes.ts/queue.routes.ts for the same wall) and `tenantContext`
  // runs across every module, including ones with no permission decoration
  // at all. `request.server.prisma`/`.redis` are undecorated globals, so this
  // reaches the same Redis-cached `perms:*` lookup `requirePermission` uses
  // downstream — no second DB round-trip on a warm cache.
  const permissionService = new PermissionService(request.server.prisma, request.server.redis);
  const { exists } = await permissionService.getUserPermissionsResult(request.user.id, clinicId);

  if (!exists) {
    return reply.status(401).send({ error: AUTH_ERRORS.SESSION_EXPIRED });
  }

  request.db = createTenantClient(clinicId);
}
