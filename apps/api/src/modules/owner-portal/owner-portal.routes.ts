import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createTenantClient, getBasePrisma, type TenantPrismaClient } from '../../lib/prisma-rls.js';
import { AccessScopeService, type OwnerPortalTokenScope } from './access-scope.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { PortalSessionService } from './portal-session.service.js';
import { PortalRecordsService } from './portal-records.service.js';
import { PortalInvoicesService } from './portal-invoices.service.js';
import { createSessionController } from './session.controller.js';
import { createRecordsController } from './records.controller.js';
import { createInvoicesController } from './invoices.controller.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set by `requirePortalScope` below, ONLY once a `READY` token has been
     * validated against `OwnerPortalMagicLink` (D-64, OWN-04, OWN-06).
     * Every owner-portal handler downstream of that preHandler reads scope
     * from here — never from `request.params`/`request.query` directly.
     */
    portalScope?: OwnerPortalTokenScope;
    /** Tenant-scoped handle for `portalScope.clinicId`, built once per request. */
    portalDb?: TenantPrismaClient;
  }
}

/**
 * Phase 9's owner-portal composition root (OWN-01 to OWN-06, D-64 to D-82).
 *
 * Unauthenticated by design (T-09-13): the owner presents no JWT, only a
 * raw token in the URL. `authenticate` / `tenantContext` therefore cannot
 * run here (they 401/400 on a missing `request.user`) — every route below
 * builds its own tenant-scoped handle AFTER resolving the token through
 * `MagicLinkService`, exactly like `webhook.routes.ts`'s D-30 exemption for
 * Razorpay's signed-but-unauthenticated callback.
 *
 * Paths carry no version prefix — applied by `app.ts` at registration time,
 * matching every other module's routes file.
 */
export default async function ownerPortalRoutes(fastify: FastifyInstance) {
  const magicLinkService = new MagicLinkService(getBasePrisma(), new AccessScopeService());

  const buildPortalSessionService = (db: TenantPrismaClient) => new PortalSessionService(db);
  const buildPortalRecordsService = (db: TenantPrismaClient) =>
    new PortalRecordsService(db, new AccessScopeService());
  const buildPortalInvoicesService = (db: TenantPrismaClient) =>
    new PortalInvoicesService(db, new AccessScopeService());

  const sessionController = createSessionController(buildPortalSessionService);
  const recordsController = createRecordsController(buildPortalRecordsService);
  const invoicesController = createInvoicesController(buildPortalInvoicesService);

  /**
   * The shared "magic-link middleware" every `READY`-only route hangs off
   * (session, records, invoices, checkout — reissue is the one exception,
   * since it must accept an `EXPIRED` link; see `reissue.controller.ts`).
   *
   * `EXPIRED` and `INVALID` are answered here and the request never reaches
   * the route handler, so a scope-mismatched or expired token can never
   * cause a controller to touch pet/invoice data (OWN-06).
   */
  async function requirePortalScope(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    const resolution = await magicLinkService.validate(token);

    if (resolution.state === 'INVALID') {
      return reply.status(403).send({ state: 'INVALID' });
    }
    if (resolution.state === 'EXPIRED') {
      return reply.status(200).send({ state: 'EXPIRED' });
    }

    request.portalScope = resolution.data;
    request.portalDb = createTenantClient(resolution.data.clinicId);
  }

  // No `config: { rateLimit: false }` override here, unlike the Razorpay
  // webhook plugin — this surface is the opposite case. A public route that
  // takes a raw token in the URL is exactly the shape a brute-force token
  // guesser targets, so it keeps the app-wide 200/min limit rather than
  // opting out of it (T-09-13).
  fastify.get('/owner-portal/:token/session', {
    preHandler: requirePortalScope,
    handler: sessionController.getSessionHandler,
  });

  fastify.get('/owner-portal/:token/records', {
    preHandler: requirePortalScope,
    handler: recordsController.getRecordsHandler,
  });

  fastify.get('/owner-portal/:token/invoices', {
    preHandler: requirePortalScope,
    handler: invoicesController.getInvoicesHandler,
  });
}
