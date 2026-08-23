import { Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { PermissionService } from '../auth/permission.service.js';
import { StockMovementService } from '../inventory/stock-movement.service.js';
import { InvoiceRepository } from './invoice.repository.js';
import { InvoiceService } from './invoice.service.js';
import { PaymentService } from './payment.service.js';
import { RefundService } from './refund.service.js';
import { CreditNoteService } from './credit-note.service.js';
import { StockValidatorService } from './stock-validator.service.js';
import { DashboardService } from './dashboard.service.js';
import { ServiceCatalogService } from './service-catalog.service.js';
import { BillingSettingsService } from './settings.service.js';
import { createDashboardController } from './dashboard.controller.js';
import { createServiceCatalogController } from './service-catalog.controller.js';
import { createBillingSettingsController } from './settings.controller.js';
import { createInvoiceController } from './invoice.controller.js';
import { createPaymentController } from './payment.controller.js';
import { createRefundController } from './refund.controller.js';
import { createCreditNoteController } from './credit-note.controller.js';
import { BillingWorkbenchService } from './billing-workbench.service.js';
import { createWorkbenchController } from './workbench.controller.js';
import { AccessPolicyService } from '../web-dashboard/access-policy.service.js';
import { requireBrowserModuleAccess } from '../web-dashboard/browser-access.middleware.js';
import { BrowserSyncService } from '../../realtime/browser-sync.service.js';
import { WhatsAppRepository } from '../whatsapp/whatsapp.repository.js';
import { SendAuthorizationService } from '../whatsapp/send-authorization.service.js';
import { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import { PortalLinkIssuanceService } from '../owner-portal/portal-link-issuance.service.js';

/**
 * Billing routes — the first consumer of `requirePermission` outside auth.
 *
 * Paths carry no version prefix: it is applied by `app.ts` at registration
 * time, exactly as in `emr.routes.ts`.
 *
 * ## Three gates, not one
 *
 * D-05 splits billing authority two ways, and the route table reflects it:
 *
 *  * `VIEW_INVOICES` — reads. Clinicians keep this: a vet must be able to see
 *    the invoice for a patient they treated.
 *  * `CREATE_INVOICES` — building and finalizing invoices. Front Desk and Admin
 *    only; `prisma/seed.ts` no longer grants it to Clinician.
 *  * `MANAGE_PAYMENTS` — void, mark-paid and mark-unpaid. These move MONEY
 *    state rather than document state, so they sit behind the stricter gate even
 *    though a user who can create an invoice can usually also collect for it.
 *
 * ## What is deliberately NOT here
 *
 * The D-03 End-Consultation path. A Clinician finishing a consultation must
 * still produce a draft for the front desk, and under D-05 a Clinician holds no
 * billing permission at all. That path is a direct
 * `InvoiceService.createDraftFromConsultation` call from
 * `EmrService.finalizeConsultation` (plan 06-12) with no HTTP surface and no
 * permission check. The `from-consultation` route below is the *other* surface
 * onto the same method — the D-06 front-desk picker — and is gated. Gating the
 * service method itself, rather than this route, would break D-03.
 */
export default async function billingRoutes(fastify: FastifyInstance) {
  // D-84 (PHASE-09-VERIFY-FIX-PLAN.md finding 9.1) — the owner-portal
  // first-link-issuance WhatsApp send `InvoiceService.finalize` triggers.
  // Admin-scoped (D-30 exemption), constructed exactly like
  // `owner-portal.routes.ts`'s own `whatsAppService`/`outboundQueue`
  // (this file's header comment on that pattern applies verbatim): a
  // second `Queue('whatsapp-outbound', ...)` handle here is intentional and
  // safe, since Fastify's plugin encapsulation means this sibling plugin
  // cannot reach `owner-portal.routes.ts`'s own instance, and
  // `WhatsAppService.sendTemplate` calls `prisma.$transaction(async (tx) =>
  // ...)` internally, which is why this is the raw admin `fastify.prisma`
  // rather than a per-request tenant handle.
  const whatsAppRepository = new WhatsAppRepository(fastify.prisma);
  const finalizeOutboundQueue = new Queue('whatsapp-outbound', { connection: fastify.redis });
  fastify.addHook('onClose', async () => {
    await finalizeOutboundQueue.close();
  });
  const finalizeWhatsAppService = new WhatsAppService(
    whatsAppRepository,
    new SendAuthorizationService(whatsAppRepository),
    fastify.prisma,
    finalizeOutboundQueue,
    fastify.io ?? null,
  );
  const portalBaseUrl = `${process.env.WEB_URL || 'http://localhost:3001'}/portal`;

  /**
   * D-30: built per request from the tenant handle, never as a plugin-scope
   * singleton. `StockValidatorService` is shared between the repository and the
   * service so that the finalize transaction and the read-only availability
   * check observe the same instance. `portalLinkIssuer` is the one exception —
   * it wraps the plugin-scope `finalizeWhatsAppService` above, exactly like
   * every other per-request builder in this file wraps a plugin-scope
   * collaborator it cannot rebuild per request (see `browserSyncService` below).
   */
  const buildService = (db: TenantPrismaClient) => {
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    const repository = new InvoiceRepository(db, stockValidator);
    const portalLinkIssuer = new PortalLinkIssuanceService(db, finalizeWhatsAppService, portalBaseUrl);
    return new InvoiceService(repository, stockValidator, db, portalLinkIssuer);
  };

  /**
   * The payment side, built the same way and from the same tenant handle.
   *
   * `PaymentService` takes its own `InvoiceRepository` rather than sharing the
   * one inside `buildService`: it needs `recomputePaymentState` and
   * `getInvoiceDetail`, both stateless reads/writes on the handle, and a shared
   * instance would couple two services that have no reason to see each other's
   * state.
   */
  const buildPaymentService = (db: TenantPrismaClient) => {
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    return new PaymentService(new InvoiceRepository(db, stockValidator), db);
  };

  /**
   * The two money-back services (D-12, D-22), built the same way.
   *
   * Neither needs the stock validator — a refund moves money, and a credit note
   * is an accounting document that never touches inventory (a return to stock
   * is the separate Phase 5 action). The repository still requires one, so they
   * get their own rather than sharing the invoice service's instance.
   *
   * `RefundService` alone takes a logger. Its CR-02 restructure has one branch —
   * the gateway accepted and the database then refused every write — where the
   * audit row it would normally leave cannot be written either, and an
   * unreconciled refund must not vanish silently.
   */
  const buildRefundService = (db: TenantPrismaClient) => {
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    return new RefundService(new InvoiceRepository(db, stockValidator), db, fastify.log);
  };

  const buildCreditNoteService = (db: TenantPrismaClient) => {
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    return new CreditNoteService(new InvoiceRepository(db, stockValidator), db);
  };

  /**
   * The D-24 / RPT-01 landing aggregate. Takes the tenant handle directly — it
   * owns no repository, because both of its statements are raw aggregates.
   */
  const buildDashboardService = (db: TenantPrismaClient) => new DashboardService(db);

  /** D-02 catalog CRUD. Reference data, so no repository and no stock validator. */
  const buildServiceCatalogService = (db: TenantPrismaClient) => new ServiceCatalogService(db);

  /** D-29 settings, including the per-clinic Razorpay credentials. */
  const buildSettingsService = (db: TenantPrismaClient) => new BillingSettingsService(db);

  /**
   * Plan 09-04 browser billing workbench (D-22, D-40, D-42, D-43). Built the
   * same way as every other service above -- per request, from the tenant
   * handle (D-30) -- and composed from fresh instances of the exact same
   * `InvoiceService`/`PaymentService`/`RefundService` construction used
   * elsewhere in this file, so the workbench never diverges from the
   * mobile-facing money-state invariants those classes already enforce.
   * `AccessPolicyService` is the D-19/D-83 fresh role-resolution this
   * workbench's D-22 Admin-only gate depends on; `BrowserSyncService`
   * shares `fastify.io` as its realtime transport with `QueueService`
   * (D-30 exemption: the Socket.IO server is transport, not tenant data).
   */
  const browserSyncService = new BrowserSyncService(fastify.io);
  const buildWorkbenchService = (db: TenantPrismaClient) => {
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    const invoiceRepository = new InvoiceRepository(db, stockValidator);
    return new BillingWorkbenchService(
      db,
      new AccessPolicyService(db),
      new InvoiceService(invoiceRepository, stockValidator, db),
      new PaymentService(new InvoiceRepository(db, stockValidator), db),
      new RefundService(new InvoiceRepository(db, stockValidator), db, fastify.log),
      browserSyncService,
    );
  };

  const controller = createInvoiceController(buildService);
  const dashboardController = createDashboardController(buildDashboardService);
  const serviceCatalogController = createServiceCatalogController(buildServiceCatalogService);
  const settingsController = createBillingSettingsController(buildSettingsService);
  const paymentController = createPaymentController(buildPaymentService);
  const refundController = createRefundController(buildRefundService);
  const creditNoteController = createCreditNoteController(buildCreditNoteService);
  const workbenchController = createWorkbenchController(buildWorkbenchService);

  // `requirePermission` reads `request.server.permissionService`, and Fastify's
  // plugin encapsulation means auth.routes.ts's decoration never reaches this
  // sibling plugin's scope. Without this, every billing request 500s with
  // "Cannot read properties of undefined (reading 'getUserPermissions')" —
  // the exact failure dispense.routes.ts documents having hit and fixed the
  // same way. Decorate locally, matching inventory.routes.ts and clinic.routes.ts.
  //
  // Admin client by design (D-30 exemption): permission resolution runs during
  // `authenticate`, before `tenantContext` creates `request.db`, and reads the
  // global reference tables (`users`, `roles`, `permissions`,
  // `clinic_member_roles`) that plan 06-00 deliberately left without RLS
  // policies because they are what *establishes* the tenant.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  const readHandler = [authenticate, tenantContext, requirePermission('VIEW_INVOICES')];
  const writeHandler = [authenticate, tenantContext, requirePermission('CREATE_INVOICES')];
  const payHandler = [authenticate, tenantContext, requirePermission('MANAGE_PAYMENTS')];
  // D-29's fourth gate. `MANAGE_CLINIC_SETTINGS` already exists in
  // `prisma/seed.ts` and is held by Admin alone — which is exactly the
  // requirement that only an Admin configures Razorpay keys. Do not grant it to
  // another role to make a settings screen work; the credential is authority to
  // move money out of the clinic's account (T-06-77).
  const settingsHandler = [authenticate, tenantContext, requirePermission('MANAGE_CLINIC_SETTINGS')];

  // Billing tab landing (D-24 summary cards + RPT-01 patients seen today).
  // A read, so VIEW_INVOICES: a Clinician who can see an invoice can see the
  // day's totals. Registered before the `/billing/invoices/:invoiceId` pattern
  // for readability only — the path is fixed and cannot be shadowed by it.
  fastify.get('/billing/dashboard', { preHandler: readHandler, handler: dashboardController.getSummaryHandler });

  // D-02 service catalog. Reads sit behind VIEW_INVOICES so a Clinician can see
  // what a service costs; writes behind CREATE_INVOICES, because repricing the
  // catalog changes what every future invoice charges.
  //
  // `/search` is declared before `/:serviceId` so the literal segment wins the
  // match. Fastify's radix router prefers a static segment over a parametric one
  // regardless of registration order, but the ordering makes that independent of
  // a router implementation detail.
  fastify.get('/billing/services', { preHandler: readHandler, handler: serviceCatalogController.listHandler });
  fastify.get('/billing/services/search', { preHandler: readHandler, handler: serviceCatalogController.searchHandler });
  fastify.get('/billing/services/:serviceId', { preHandler: readHandler, handler: serviceCatalogController.getHandler });
  fastify.post('/billing/services', { preHandler: writeHandler, handler: serviceCatalogController.createHandler });
  fastify.patch('/billing/services/:serviceId', { preHandler: writeHandler, handler: serviceCatalogController.updateHandler });
  // Not a DELETE: the row survives, because a finalized invoice line points at it.
  fastify.post('/billing/services/:serviceId/deactivate', { preHandler: writeHandler, handler: serviceCatalogController.deactivateHandler });

  // D-29 billing settings — the only four routes behind settingsHandler.
  // The read is gated as tightly as the write because the response carries the
  // webhook routing token, which is a capability rather than a display value.
  fastify.get('/billing/settings', { preHandler: settingsHandler, handler: settingsController.getHandler });
  fastify.put('/billing/settings', { preHandler: settingsHandler, handler: settingsController.updateHandler });
  // Its own endpoint rather than a flag on the save: rotating stops payment
  // confirmations arriving until the Admin re-pastes the URL into Razorpay.
  fastify.post('/billing/settings/webhook-token/rotate', { preHandler: settingsHandler, handler: settingsController.rotateWebhookTokenHandler });
  // Follow-up A1. The ONLY path in the codebase that rewrites
  // `service_catalog.sac_code` in bulk, and it fires on an explicit Admin tap
  // and nothing else — no startup hook, no login hook, no side effect of the
  // read above. A clinic's accountant may already have corrected these codes by
  // hand, and a silent migration would overwrite that judgement invisibly on a
  // field printed on a legal document. Admin-only for the same reason the rest
  // of this group is: it changes what the clinic's invoices say.
  fastify.post('/billing/settings/sac-codes/update', { preHandler: settingsHandler, handler: settingsController.updateSacCodesHandler });

  // Reads
  fastify.get('/billing/invoices', { preHandler: readHandler, handler: controller.listHandler });
  fastify.get('/billing/invoices/:invoiceId', { preHandler: readHandler, handler: controller.getHandler });
  fastify.get('/billing/pets/:petId/invoices', { preHandler: readHandler, handler: controller.listForPetHandler });

  // Draft lifecycle (D-01, D-06, D-21)
  fastify.post('/billing/invoices', { preHandler: writeHandler, handler: controller.createHandler });
  fastify.post('/billing/invoices/from-consultation/:consultationId', { preHandler: writeHandler, handler: controller.createDraftFromConsultationHandler });
  fastify.post('/billing/invoices/preview-totals', { preHandler: writeHandler, handler: controller.previewTotalsHandler });
  fastify.patch('/billing/invoices/:invoiceId', { preHandler: writeHandler, handler: controller.updateDraftHandler });
  fastify.delete('/billing/invoices/:invoiceId', { preHandler: writeHandler, handler: controller.deleteDraftHandler });
  fastify.post('/billing/invoices/:invoiceId/finalize', { preHandler: writeHandler, handler: controller.finalizeHandler });

  // Money-state changes (D-05: Front Desk and Admin only)
  fastify.post('/billing/invoices/:invoiceId/void', { preHandler: payHandler, handler: controller.voidHandler });
  fastify.post('/billing/invoices/:invoiceId/mark-paid', { preHandler: payHandler, handler: controller.markPaidHandler });
  fastify.post('/billing/invoices/:invoiceId/mark-unpaid', { preHandler: payHandler, handler: controller.markUnpaidHandler });

  // Payment collection (BIL-05, D-09, D-10, D-11). All three writes sit behind
  // MANAGE_PAYMENTS: creating a payment link is a money action, not a document
  // action, even though nothing is captured until the webhook lands.
  //
  // No `config: { rateLimit }` override — these keep the global 200/min. A
  // tighter per-route limit would throttle a busy front desk on a Saturday
  // morning, and the abuse case (spamming link creation) is already bounded by
  // the MANAGE_PAYMENTS gate and by every link being audited.
  fastify.post('/billing/invoices/:invoiceId/payments', { preHandler: payHandler, handler: paymentController.recordPaymentHandler });
  fastify.post('/billing/invoices/:invoiceId/payments/retry', { preHandler: payHandler, handler: paymentController.retryPaymentLinkHandler });
  fastify.post('/billing/invoices/:invoiceId/payments/mark-unpaid', { preHandler: payHandler, handler: paymentController.markUnpaidHandler });

  // D-27 / D-39: one link settling several of an owner's invoices. Behind
  // MANAGE_PAYMENTS like every other link-creating route — it is the same
  // authority applied to a set rather than to one invoice, so a Clinician who
  // cannot open a link for one invoice must not be able to open one for five.
  //
  // A collection path, not a nested one: the request's subject is the set of
  // invoices, which the body names.
  fastify.post('/billing/payment-links', { preHandler: payHandler, handler: paymentController.createCombinedPaymentLinkHandler });

  // Viewing a receipt is a read, so it sits behind VIEW_INVOICES — a clinician
  // who treated the patient can see the receipt without being able to collect.
  fastify.get('/billing/invoices/:invoiceId/receipts/:receiptId', { preHandler: readHandler, handler: paymentController.getReceiptHandler });

  // Money back out (BIL-03, BIL-07, D-12, D-22, D-42).
  //
  // Both writes sit behind MANAGE_PAYMENTS rather than CREATE_INVOICES. A
  // refund sends real money out of the clinic and a credit note reduces what
  // the owner owes; both are money-state changes, which D-05 reserves to Front
  // Desk and Admin. A Clinician who can raise an invoice for the consultation
  // they performed must not also be able to write its value off (T-06-73).
  //
  // The reads sit behind VIEW_INVOICES, matching the receipt route: seeing that
  // a refund happened is part of reading the invoice.
  fastify.post('/billing/invoices/:invoiceId/refunds', { preHandler: payHandler, handler: refundController.createRefundHandler });
  fastify.get('/billing/invoices/:invoiceId/refunds', { preHandler: readHandler, handler: refundController.listRefundsHandler });
  // Fixed suffix, so it cannot be shadowed by the `:receiptId` pattern above.
  // Returns the server-computed maximum so the mobile RefundAmountInput never
  // derives a money figure of its own.
  fastify.get('/billing/invoices/:invoiceId/refundable', { preHandler: readHandler, handler: refundController.getRefundableHandler });

  fastify.post('/billing/invoices/:invoiceId/credit-notes', { preHandler: payHandler, handler: creditNoteController.issueCreditNoteHandler });
  fastify.get('/billing/invoices/:invoiceId/credit-notes', { preHandler: readHandler, handler: creditNoteController.listCreditNotesHandler });
  fastify.get('/billing/credit-notes/:creditNoteId', { preHandler: readHandler, handler: creditNoteController.getCreditNoteHandler });

  // Plan 09-04: browser billing workbench (D-22, D-40, D-42, D-43). All four
  // sit behind `payHandler` (`MANAGE_PAYMENTS`) like the mobile
  // collect/refund/void routes above -- Front Desk and Admin both pass this
  // gate (D-05). D-22's Admin-only narrowing of refund/void happens one
  // layer down, inside `BillingWorkbenchService`, which is what turns a
  // Front Desk request into a 403 rather than a second permission string
  // this module would have to introduce and keep in sync with
  // `AccessPolicyService`'s browser role resolution.
  const webBillingReadHandler = [...readHandler, requireBrowserModuleAccess('BILLING')];
  const webBillingPayHandler = [...payHandler, requireBrowserModuleAccess('BILLING')];

  fastify.get('/billing/web/workbench', { preHandler: webBillingReadHandler, handler: workbenchController.getWorkbenchHandler });
  fastify.post('/billing/web/invoices/:invoiceId/collect-payment', { preHandler: webBillingPayHandler, handler: workbenchController.collectPaymentHandler });
  fastify.post('/billing/web/invoices/:invoiceId/refund', { preHandler: webBillingPayHandler, handler: workbenchController.refundHandler });
  fastify.post('/billing/web/invoices/:invoiceId/void', { preHandler: webBillingPayHandler, handler: workbenchController.voidHandler });
}
