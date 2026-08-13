import type { FastifyRequest, FastifyReply } from 'fastify';
import { createTenantClient } from '../lib/prisma-rls.js';
import type { TenantPrismaClient } from '../lib/prisma-rls.js';
import { AUTH_ERRORS } from '@breeyo/types';

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

  request.db = createTenantClient(clinicId);
}
