import type { FastifyInstance } from 'fastify';
import { EmrRepository } from './emr.repository.js';
import { EmrService } from './emr.service.js';
import { ConsultationLockService } from './consultation-lock.service.js';
import { DosageService } from './dosage.service.js';
import { createEmrController } from './emr.controller.js';
import {
  createConsultationSyncController,
  buildConsultationOfflineReplayService,
  buildConsultationConflictResolutionService,
} from './controllers/consultationSync.controller.js';
import { createNotificationBus } from '../notifications/notification-bus.js';
import { ReplayBroadcastService } from '../sync/services/replayBroadcast.service.js';
import { ClinicVetRosterProvider } from '../sync/services/onDutyRoster.service.js';
import { AvailabilityRepository } from '../scheduling/availability.repository.js';
// D-03: the EMR module depends on billing so that ending a consultation can
// seed a draft invoice. This is a deliberate ONE-DIRECTIONAL dependency — EMR
// imports billing, never the reverse. Billing reads consultations through its
// own Prisma handle and imports nothing from this module, which is what keeps
// the two from becoming a cycle.
import { InvoiceRepository } from '../billing/invoice.repository.js';
import { InvoiceService } from '../billing/invoice.service.js';
import { StockValidatorService } from '../billing/stock-validator.service.js';
import { StockMovementService } from '../inventory/stock-movement.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { PermissionService } from '../auth/permission.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function emrRoutes(fastify: FastifyInstance) {
  // Stateless and I/O-free -- pure dosage arithmetic, no tenant dimension.
  // Stays a plugin-scope singleton.
  const dosageService = new DosageService();

  // D-72: bus for lock takeover push notifications (same BullMQ queue/worker
  // pattern already used by the notifications module). A BullMQ producer, not
  // tenant data, so it stays plugin-scope with its teardown hook intact.
  const notificationBus = createNotificationBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await notificationBus.close();
  });

  // D-30: everything that touches clinic rows is built per request from the
  // tenant-scoped handle. `lockService` is constructed once per request and
  // shared with `EmrService` so both observe the same lock state.
  const buildServices = (db: TenantPrismaClient) => {
    const lockService = new ConsultationLockService(db);

    // D-03: built from the SAME tenant handle as the EMR services, so the draft
    // the hook seeds is written under the same RLS scope as the consultation it
    // describes. Constructed exactly as `billing.routes.ts` does — the stock
    // validator is shared between the repository and the service — so the two
    // entry points onto `createDraftFromConsultation` behave identically.
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    const invoiceService = new InvoiceService(
      new InvoiceRepository(db, stockValidator),
      stockValidator,
      db,
    );

    const emrService = new EmrService(
      new EmrRepository(db),
      lockService,
      dosageService,
      db,
      invoiceService,
    );
    return { emrService, lockService };
  };

  const controller = createEmrController(buildServices, notificationBus);

  // AC-3 (access-control audit): `auth.routes.ts`'s
  // `fastify.decorate('permissionService', ...)` never reaches this sibling
  // `app.register(...)` call -- Fastify's plugin encapsulation scopes it to
  // auth's own child context. Same wall patient/queue/billing/inventory/
  // whatsapp/scheduling/clinic routes each hit and resolved the same way:
  // re-decorate locally, guarded so a shared decoration (if one ever is
  // reachable) is not clobbered.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  // Plan 10-03 (PLT-03, D-05 to D-09, D-24): mobile offline consultation
  // draft replay on reconnect. Deliberately its own controller/service,
  // mirroring `queue.routes.ts`'s `queueSyncController` -- clinical replay
  // has its own review posture (whole-draft hold on any conflict) and must
  // not share a code path with queue/inventory replay's lighter rules.
  // Verify-fix 10.3: plugin-scope singleton, same `fastify.io` convention
  // `queue.routes.ts` uses -- a late EMR replay now actually pushes a
  // scoped `replay:applied`/`replay:conflict-opened` event instead of
  // `ReplayBroadcastService` sitting unreached.
  const replayBroadcast = new ReplayBroadcastService(fastify.io ?? null);

  // Verify-fix 10.6 (D-24, D-36): same `ClinicVetRosterProvider` shape
  // `sync/routes.ts`'s live retry/escalate routes use, built from
  // `fastify.prisma` per `AvailabilityRepository`'s own no-DB-RLS
  // tenancy-boundary convention (see `scheduling.routes.ts`). Stateless, so
  // it stays a plugin-scope singleton alongside `replayBroadcast`.
  // D-30 exemption: those scheduling tables have no DB-level RLS, so
  // `clinicId` is the only tenancy boundary, always supplied explicitly by
  // `resolveNextOnDutyClinicianId` from the authenticated session, never
  // from client input.
  const onDutyRosterProvider = new ClinicVetRosterProvider(new AvailabilityRepository(fastify.prisma));

  const consultationSyncController = createConsultationSyncController(
    (db) => buildConsultationOfflineReplayService(db, permissionService, replayBroadcast),
    (db) => buildConsultationConflictResolutionService(db, replayBroadcast, onDutyRosterProvider),
  );

  // AC-3 (access-control audit): this module had zero permission checks --
  // every route below ran on bare `[authenticate, tenantContext]`, so any
  // authenticated clinic member (Front Desk, Inventory Manager -- neither
  // holds VIEW_EMR/EDIT_EMR per seed.ts) could read or write clinical
  // records. Mirrors the `viewHandler`/`editHandler` split
  // `patient.routes.ts`/`queue.routes.ts` already use: reads require
  // VIEW_EMR, every mutation requires EDIT_EMR.
  const viewHandler = [authenticate, tenantContext, requirePermission('VIEW_EMR')];
  const editHandler = [authenticate, tenantContext, requirePermission('EDIT_EMR')];

  // Consultation lifecycle
  fastify.post('/consultations', { preHandler: editHandler, handler: controller.createHandler });
  fastify.get('/consultations/:consultationId', { preHandler: viewHandler, handler: controller.getConsultationHandler });
  fastify.get('/consultations/:consultationId/draft', { preHandler: viewHandler, handler: controller.getDraftHandler });
  fastify.patch('/consultations/:consultationId/draft', { preHandler: editHandler, handler: controller.saveDraftHandler });
  fastify.post('/consultations/:consultationId/finalize', { preHandler: editHandler, handler: controller.finalizeHandler });
  fastify.post('/consultations/:consultationId/addendum', { preHandler: editHandler, handler: controller.addAddendumHandler });

  // Plan 10-03: mobile offline consultation draft replay on reconnect.
  // Registered as a fixed segment (`/consultations/sync/replay`), same as
  // queue's `/queue/sync/replay` -- Fastify's radix router does not confuse
  // it with the parametric `/consultations/:consultationId` routes above.
  fastify.post('/consultations/sync/replay', { preHandler: editHandler, handler: consultationSyncController.replayHandler });

  // Verify-fix 10.5: moves a `SyncConflictRecord` off `OPEN`/`GUIDED_RETRY`/
  // `ESCALATED` via one of `ClinicalConflictResolutionSheet.tsx`'s four
  // resolve actions (KEEP_LOCAL/KEEP_SERVER/MERGE_SAFE_FIELDS/ESCALATE).
  // Registered as its own parametric segment under `/consultations/:consultationId`
  // -- Fastify's radix router distinguishes it from the fixed
  // `/consultations/sync/replay` segment above and from the other
  // `/consultations/:consultationId/*` routes below by its trailing path.
  fastify.post(
    '/consultations/:consultationId/conflicts/:conflictId/resolve',
    { preHandler: editHandler, handler: consultationSyncController.resolveHandler },
  );

  // Lock management
  fastify.post('/consultations/:consultationId/heartbeat', { preHandler: editHandler, handler: controller.heartbeatHandler });
  fastify.get('/consultations/:consultationId/lock', { preHandler: viewHandler, handler: controller.checkLockHandler });
  fastify.post('/consultations/:consultationId/lock', { preHandler: editHandler, handler: controller.acquireLockHandler });
  fastify.delete('/consultations/:consultationId/lock', { preHandler: editHandler, handler: controller.releaseLockHandler });

  // Dosage validation
  fastify.post('/consultations/validate-dosage', { preHandler: editHandler, handler: controller.validateDosageHandler });

  // Medical history timeline (EMR-04)
  fastify.get('/pets/:petId/history', { preHandler: viewHandler, handler: controller.getHistoryHandler });
}
