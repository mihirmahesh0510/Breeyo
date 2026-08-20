import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PortalCareDatesService } from './portal-care-dates.service.js';

const careDatesQuerySchema = z.object({ petId: z.string().uuid() });

/**
 * `GET /api/v1/owner-portal/:token/care-dates?petId=:petId` (OWN-07,
 * OWN-06). Same scope-recheck posture as `records.controller.ts` and
 * `invoices.controller.ts` — `requirePortalScope` has already resolved
 * `request.portalScope` for a `READY` link, and a client-supplied `petId`
 * is re-checked against that scope inside `PortalCareDatesService`, never
 * trusted directly. A scope mismatch gets the same `INVALID` no-data
 * envelope as every other portal scope violation (T-09-20).
 */
export function createCareDatesController(
  buildPortalCareDatesService: (db: TenantPrismaClient) => PortalCareDatesService,
) {
  return {
    async getCareDatesHandler(request: FastifyRequest, reply: FastifyReply) {
      const scope = request.portalScope;
      const db = request.portalDb;
      if (!scope || !db) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      const query = careDatesQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: query.error.errors.map((e) => e.message).join(', ') },
        });
      }

      const service = buildPortalCareDatesService(db);
      const result = await service.getCareDates(scope, query.data.petId);

      if (result === null) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      return reply.status(200).send({ data: result });
    },
  };
}
