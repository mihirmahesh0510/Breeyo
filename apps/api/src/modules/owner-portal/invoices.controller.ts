import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PortalInvoicesService } from './portal-invoices.service.js';

const invoicesQuerySchema = z.object({ petId: z.string().uuid() });

/**
 * `GET /api/v1/owner-portal/:token/invoices?petId=:petId` (OWN-02, D-59,
 * OWN-06). Same scope-recheck posture as `records.controller.ts` — a
 * client-supplied `petId` is validated against `request.portalScope` inside
 * `PortalInvoicesService`, never trusted directly.
 */
export function createInvoicesController(
  buildPortalInvoicesService: (db: TenantPrismaClient) => PortalInvoicesService,
) {
  return {
    async getInvoicesHandler(request: FastifyRequest, reply: FastifyReply) {
      const scope = request.portalScope;
      const db = request.portalDb;
      if (!scope || !db) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      const query = invoicesQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: query.error.errors.map((e) => e.message).join(', ') },
        });
      }

      const service = buildPortalInvoicesService(db);
      const result = await service.getInvoicesForPet(scope, query.data.petId);

      if (result === null) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      return reply.status(200).send({ data: result });
    },
  };
}
