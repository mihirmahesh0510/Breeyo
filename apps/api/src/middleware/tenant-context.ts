import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createTenantClient } from '../lib/prisma-rls.js';
import { AUTH_ERRORS } from '@breeyo/types';

declare module 'fastify' {
  interface FastifyRequest {
    db: PrismaClient;
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
