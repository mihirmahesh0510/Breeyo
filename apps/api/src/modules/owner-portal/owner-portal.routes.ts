import { Queue } from 'bullmq';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createTenantClient, getBasePrisma, type TenantPrismaClient } from '../../lib/prisma-rls.js';
import { InvoiceRepository } from '../billing/invoice.repository.js';
import { PaymentService } from '../billing/payment.service.js';
import { StockMovementService } from '../inventory/stock-movement.service.js';
import { StockValidatorService } from '../billing/stock-validator.service.js';
import { WhatsAppRepository } from '../whatsapp/whatsapp.repository.js';
import { SendAuthorizationService } from '../whatsapp/send-authorization.service.js';
import { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import { AccessScopeService, type OwnerPortalTokenScope } from './access-scope.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { PortalSessionService } from './portal-session.service.js';
import { PortalRecordsService } from './portal-records.service.js';
import { PortalInvoicesService } from './portal-invoices.service.js';
import { PortalCheckoutService } from './portal-checkout.service.js';
import { PortalReissueService } from './portal-reissue.service.js';
import { PortalCareDatesService } from './portal-care-dates.service.js';
import { VaccinationRepository } from '../vaccination/vaccination.repository.js';
import { createSessionController } from './session.controller.js';
import { createRecordsController } from './records.controller.js';
import { createInvoicesController } from './invoices.controller.js';
import { createCheckoutController } from './checkout.controller.js';
import { createReissueController } from './reissue.controller.js';
import { createCareDatesController } from './care-dates.controller.js';

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
  const buildPortalCareDatesService = (db: TenantPrismaClient) =>
    new PortalCareDatesService(db, new AccessScopeService(), new VaccinationRepository(db));

  /**
   * The billing side, built exactly like `billing.routes.ts`'s own
   * `buildPaymentService` — this is the payment source of truth
   * `PortalCheckoutService` delegates to rather than a second one
   * (OWN-03, D-66).
   */
  const buildPortalCheckoutService = (db: TenantPrismaClient) => {
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    const paymentService = new PaymentService(new InvoiceRepository(db, stockValidator), db);
    return new PortalCheckoutService(db, new AccessScopeService(), paymentService);
  };

  // ─── WhatsApp send pipeline, admin-scoped (D-30 exemption) — feeds ONLY
  // `PortalReissueService.reissue`'s delegated send, mirroring
  // `whatsapp.routes.ts`'s own admin-scoped `WhatsAppService` construction.
  // A second `Queue('whatsapp-outbound', ...)` handle is intentional and
  // safe: BullMQ queues are lightweight named handles over the same
  // Redis-backed queue, not a singleton-per-process resource — the existing
  // `outbound.worker.ts` consumer processes jobs regardless of which
  // plugin's `Queue` instance produced them.
  const whatsAppRepository = new WhatsAppRepository(fastify.prisma);
  const outboundQueue = new Queue('whatsapp-outbound', { connection: fastify.redis });
  fastify.addHook('onClose', async () => {
    await outboundQueue.close();
  });
  const whatsAppService = new WhatsAppService(
    whatsAppRepository,
    new SendAuthorizationService(whatsAppRepository),
    fastify.prisma,
    outboundQueue,
    fastify.io ?? null,
  );
  const portalBaseUrl = `${process.env.WEB_URL || 'http://localhost:3001'}/portal`;
  const buildPortalReissueService = (db: TenantPrismaClient) =>
    new PortalReissueService(db, whatsAppService, portalBaseUrl);

  const sessionController = createSessionController(buildPortalSessionService);
  const recordsController = createRecordsController(buildPortalRecordsService);
  const invoicesController = createInvoicesController(buildPortalInvoicesService);
  const careDatesController = createCareDatesController(buildPortalCareDatesService);
  const checkoutController = createCheckoutController(buildPortalCheckoutService);
  const reissueController = createReissueController(magicLinkService, buildPortalReissueService);

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
      // Finding 9.9: carries `clinicPhone` so `ExpiredLinkState`'s own help
      // bar can show real tel:/wa.me links instead of the href="#" it fell
      // back to when this envelope had no data at all.
      return reply.status(200).send({ state: 'EXPIRED', clinicPhone: resolution.clinicPhone });
    }

    request.portalScope = resolution.data;
    request.portalDb = createTenantClient(resolution.data.clinicId);
  }

  // PHASE-09-VERIFY-FIX-PLAN.md finding 9.5 (09-RESEARCH.md pitfall P-7,
  // addressed): every route below used to inherit only the generic app-wide
  // 200/min limit (`app.ts`), which is far too loose for this public,
  // unauthenticated, raw-token-in-the-URL surface -- 200/min is a
  // meaningful token-guessing budget. Each route now carries its own
  // `config.rateLimit` override, the same per-route mechanism
  // `whatsapp.webhook.routes.ts` already uses (`isTest` bump so the test
  // suite never trips the limit). `reissue` gets the tightest budget plus
  // `ban`, layered ON TOP of finding 9.4/D-82's DB-backed 3-per-24h cap --
  // that cap is the correct-answer business rule; this is defense-in-depth
  // against sheer request volume against the same endpoint.
  const isTest = process.env.NODE_ENV === 'test';
  const portalReadRateLimit = { max: isTest ? 10000 : 30, timeWindow: '1 minute' };
  const reissueRateLimit = { max: isTest ? 10000 : 5, timeWindow: '1 minute', ban: 3 };

  fastify.get('/owner-portal/:token/session', {
    config: { rateLimit: portalReadRateLimit },
    preHandler: requirePortalScope,
    handler: sessionController.getSessionHandler,
  });

  fastify.get('/owner-portal/:token/records', {
    config: { rateLimit: portalReadRateLimit },
    preHandler: requirePortalScope,
    handler: recordsController.getRecordsHandler,
  });

  fastify.get('/owner-portal/:token/invoices', {
    config: { rateLimit: portalReadRateLimit },
    preHandler: requirePortalScope,
    handler: invoicesController.getInvoicesHandler,
  });

  // OWN-07: upcoming vaccination/deworming due dates + next scheduled
  // appointment, scoped by the same `requirePortalScope` middleware as
  // session/records/invoices (T-09-21).
  fastify.get('/owner-portal/:token/care-dates', {
    config: { rateLimit: portalReadRateLimit },
    preHandler: requirePortalScope,
    handler: careDatesController.getCareDatesHandler,
  });

  fastify.post('/owner-portal/:token/checkout', {
    config: { rateLimit: portalReadRateLimit },
    preHandler: requirePortalScope,
    handler: checkoutController.createCheckoutHandler,
  });

  // No `requirePortalScope` preHandler — reissue is the one route that must
  // accept an `EXPIRED` link (that is the whole point of it). See
  // `reissue.controller.ts` for its own token resolution. Tightest budget
  // of the module (5/min) plus `ban: 3` -- three 429s in a row escalates to
  // a flat 403, since this is also the one route with its own DB-backed
  // daily cap (finding 9.4/D-82) a sustained flood would otherwise beat on.
  fastify.post('/owner-portal/:token/reissue', {
    config: { rateLimit: reissueRateLimit },
    handler: reissueController.reissueHandler,
  });
}
