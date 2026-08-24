import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PortalSessionService } from './portal-session.service.js';

/**
 * `GET /api/v1/owner-portal/:token/session` (OWN-04, OWN-06).
 *
 * By the time this handler runs, `owner-portal.routes.ts`'s
 * `requirePortalScope` preHandler has already resolved the token and either
 * short-circuited with the `EXPIRED` / `INVALID` envelope, or attached
 * `request.portalScope` + `request.portalDb` for a `READY` link. This
 * handler therefore only ever needs to build the `READY` envelope —
 * mirroring `ownerPortalSessionSchema`'s discriminated union in
 * `@breeyo/validators`.
 */
export function createSessionController(
  buildPortalSessionService: (db: TenantPrismaClient) => PortalSessionService,
) {
  return {
    async getSessionHandler(request: FastifyRequest, reply: FastifyReply) {
      const scope = request.portalScope;
      const db = request.portalDb;
      if (!scope || !db) {
        // Defensive only — `requirePortalScope` always sets both before this
        // handler runs. Same no-data posture as any other unresolved token.
        return reply.status(403).send({ state: 'INVALID' });
      }

      const service = buildPortalSessionService(db);
      const session = await service.getSession(scope);

      return reply.status(200).send({ state: 'READY', data: session });
    },
  };
}
