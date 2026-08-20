import type { FastifyReply, FastifyRequest } from 'fastify';
import { ownerPortalCheckoutSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PortalCheckoutService } from './portal-checkout.service.js';

/**
 * `POST /api/v1/owner-portal/:token/checkout` (OWN-03, D-59, D-66, D-69,
 * D-70). Behind `requirePortalScope` — only reached for a `READY` link.
 *
 * `body.magicLinkId` is cross-checked against `request.portalScope`'s own
 * `magicLinkId` (the one the URL token itself resolved to) rather than
 * trusted on its own — a client cannot submit a checkout naming a DIFFERENT
 * link than the one it authenticated with (T-09-15).
 */
export function createCheckoutController(
  buildPortalCheckoutService: (db: TenantPrismaClient) => PortalCheckoutService,
) {
  return {
    async createCheckoutHandler(request: FastifyRequest, reply: FastifyReply) {
      const scope = request.portalScope;
      const db = request.portalDb;
      if (!scope || !db) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      const body = ownerPortalCheckoutSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: body.error.errors.map((e) => e.message).join(', ') },
        });
      }

      if (body.data.magicLinkId !== scope.magicLinkId) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      const service = buildPortalCheckoutService(db);
      const result = await service.createCheckout(scope, body.data.selectedInvoiceIds);

      if (result === null) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      return reply.status(200).send({ data: result });
    },
  };
}
