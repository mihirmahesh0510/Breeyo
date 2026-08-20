import type { FastifyReply, FastifyRequest } from 'fastify';
import { createTenantClient, type TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { MagicLinkService } from './magic-link.service.js';
import type { PortalReissueService } from './portal-reissue.service.js';

/**
 * `POST /api/v1/owner-portal/:token/reissue` (OWN-04, D-67, D-82).
 *
 * Deliberately NOT behind `requirePortalScope` — that preHandler only lets
 * a `READY` link through, and reissue exists specifically FOR an `EXPIRED`
 * one. This handler resolves the token itself and only ever builds a
 * tenant-scoped handle (and calls `PortalReissueService`) for the `EXPIRED`
 * case; `INVALID`/`READY` are answered directly, with no clinicId to scope
 * a handle to for `INVALID` in the first place.
 *
 * Takes no request body: the raw `:token` is already the sole bearer
 * credential (hash-validated by `magicLinkService.validate` below, exactly
 * like every other portal route), so it alone is sufficient to identify
 * which link to reissue. An earlier version of this handler also required
 * a client-supplied `expiredMagicLinkId` in the body as a "cross-check" —
 * that added no security (the token already fully authenticates) while
 * making the endpoint impossible to call correctly from a browser that has
 * no legitimate way to learn its own magicLinkId (by design, OWN-04/OWN-06
 * forbid the EXPIRED session response from carrying it). Removed.
 */
export function createReissueController(
  magicLinkService: MagicLinkService,
  buildPortalReissueService: (db: TenantPrismaClient) => PortalReissueService,
) {
  return {
    async reissueHandler(request: FastifyRequest, reply: FastifyReply) {
      const { token } = request.params as { token: string };

      const resolution = await magicLinkService.validate(token);

      if (resolution.state === 'INVALID') {
        return reply.status(403).send({ status: 'INVALID' });
      }
      if (resolution.state === 'READY') {
        return reply.status(400).send({ status: 'NOT_EXPIRED' });
      }

      const db = createTenantClient(resolution.clinicId);
      const service = buildPortalReissueService(db);
      const result = await service.reissue(resolution);

      if (result.status === 'LIMIT_REACHED') {
        return reply.status(429).send(result);
      }
      if (result.status === 'INVALID' || result.status === 'NOT_EXPIRED') {
        return reply.status(403).send(result);
      }

      return reply.status(200).send(result);
    },
  };
}
