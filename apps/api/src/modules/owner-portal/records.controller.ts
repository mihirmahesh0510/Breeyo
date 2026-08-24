import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PortalRecordsService } from './portal-records.service.js';

const recordsQuerySchema = z.object({ petId: z.string().uuid() });

/**
 * `GET /api/v1/owner-portal/:token/records?petId=:petId` (OWN-01, OWN-06).
 *
 * `requirePortalScope` has already resolved `request.portalScope` for a
 * `READY` link. `petId` is still re-checked against that scope inside
 * `PortalRecordsService` — a client-supplied query param is never trusted on
 * its own (T-09-14), and a scope mismatch here is treated exactly like a
 * tampered token: the same `INVALID` no-data envelope, not a 404 that would
 * confirm the pet exists.
 */
export function createRecordsController(
  buildPortalRecordsService: (db: TenantPrismaClient) => PortalRecordsService,
) {
  return {
    async getRecordsHandler(request: FastifyRequest, reply: FastifyReply) {
      const scope = request.portalScope;
      const db = request.portalDb;
      if (!scope || !db) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      const query = recordsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: query.error.errors.map((e) => e.message).join(', ') },
        });
      }

      const service = buildPortalRecordsService(db);
      const result = await service.getRecords(scope, query.data.petId);

      if (result === null) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      return reply.status(200).send({ data: result });
    },
  };
}
