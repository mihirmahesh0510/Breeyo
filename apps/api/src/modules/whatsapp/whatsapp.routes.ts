/**
 * WHA-05 / D-20 — the WhatsApp module's single composition root: repositories,
 * services, the inbound router (with the REAL booking and reminder handlers
 * injected — no more no-op defaults), the two BullMQ queues, the two workers,
 * the reminder-sweep scheduler, the read/action routes, and the webhook
 * plugin, all in one place. Mirrors `vaccination.routes.ts`'s wiring shape.
 *
 * This file REPLACES the interim scaffolding plan 07-09 added directly to
 * `app.ts` (its own header comment called out this file as the eventual real
 * composition).
 *
 * D-30: two construction paths now coexist, matching `patient.routes.ts`'s
 * shape rather than a stale claim this file used to make (this header
 * previously said every collaborator here matched `VaccinationRepository`'s
 * admin-client convention — that repository has since moved to `request.db`
 * on `main`, so the comparison no longer held):
 *
 *   1. The BullMQ workers, the inbound webhook router, and the
 *      booking/reminder background handlers have no HTTP request and
 *      therefore no `request.db` — they are genuinely admin-scoped, each
 *      marked with a "D-30 exemption" comment below.
 *   2. The HTTP controller's simple, single-clinic read/write handlers get
 *      FRESH per-request instances built from `request.db` via the
 *      `build*` factories below (the `patient.routes.ts` shape). The two
 *      handlers that transitively call `WhatsAppService`/`BookingService`
 *      keep the shared admin-scoped singletons (also exempted below) — both
 *      classes call `prisma.$transaction(async (tx) => ...)` internally, and
 *      `DbClient`'s union of `TenantPrismaClient | PrismaClient` has two
 *      incompatible `$transaction` overloads a per-request field can't
 *      resolve (see `prisma-rls.ts`'s `DbClient` doc comment); both are also
 *      shared with the reminder-sweep worker and the inbound booking
 *      handler, so they cannot be rebuilt per single clinicId anyway.
 *
 * Fix (closing 08-11-SUMMARY.md's disclosed "Known Gaps"): this file now
 * ALSO constructs the Phase 8 scheduling collaborators
 * (`AppointmentService`/`AvailabilityService`/`PushTriggerService`/
 * `AppointmentReminderService`/`OwnerActionService`) that
 * `InboundRouterDeps.appointmentActionHandler`, `BookingServiceDeps`'s D-12
 * optional deps, and `ReminderSweepDeps.appointmentReminders` need — the
 * exact same admin-scoped construction pattern as every other collaborator
 * above (D-30 exemption: none of these run inside an authenticated HTTP
 * request either). `scheduling.routes.ts` already constructs equivalent
 * instances for its own module and could not wire them here because this
 * file was outside that plan's declared scope; the two sets of instances are
 * independent (no shared state beyond the same underlying Postgres rows).
 * Also fixed as part of the same effort: `whatsapp.webhook.routes.ts` used
 * to construct its OWN bare `InboundRouterService` with none of
 * `bookingHandler`/`reminderHandler`/`appointmentActionHandler` injected —
 * meaning a REAL Meta Cloud API delivery could never reach any of the three,
 * unlike the simulator path below (`simulatorWorker`), which already used
 * this file's fully-wired `inboundRouter`. That webhook plugin now receives
 * this file's `inboundRouter`/`deliveryStatusService` as plugin options
 * instead of building its own. See that file's own header comment.
 */

import type { FastifyInstance } from 'fastify';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { WhatsAppRepository } from './whatsapp.repository.js';
import { SendAuthorizationService } from './send-authorization.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { InboxService } from './inbox.service.js';
import { DeliveryStatusService } from './delivery-status.service.js';
import { InboundRouterService } from './inbound-router.service.js';
import { createWhatsAppQueues, WA_JOB_OPTIONS } from './whatsapp-queue.js';
import { createOutboundWorker } from './workers/outbound.worker.js';
import { createSimulatorWorker } from './workers/simulator.worker.js';
import { createWhatsAppController } from './whatsapp.controller.js';
import { ClinicConfigService } from './clinic-config.service.js';
import { BookingRepository } from './booking/booking.repository.js';
import { BookingService } from './booking/booking.service.js';
import { SlotService } from './booking/slot.service.js';
import { createBookingInboundHandler } from './booking/booking-inbound.handler.js';
import { ReminderSourceRepository } from './reminders/reminder-source.repository.js';
import { ReminderTaskRepository } from './reminders/reminder-task.repository.js';
import { ReminderTaskService, createReminderReplyHandler } from './reminders/reminder-task.service.js';
import { registerReminderSweep, createReminderSweepWorker } from './reminders/reminder-sweep.job.js';
import whatsappWebhookRoutes from './whatsapp.webhook.routes.js';
import { PermissionService } from '../auth/permission.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { createNotificationBus } from '../notifications/notification-bus.js';
import { AvailabilityRepository } from '../scheduling/availability.repository.js';
import { AppointmentRepository } from '../scheduling/appointment.repository.js';
import { AvailabilityService } from '../scheduling/availability.service.js';
import { AppointmentService } from '../scheduling/appointment.service.js';
import { PushTriggerService } from '../scheduling/push-trigger.service.js';
import { AppointmentReminderService } from '../scheduling/reminder.service.js';
import { OwnerActionService, createAppointmentActionHandler, type OwnerReplySender } from '../scheduling/owner-action.service.js';

export default async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  const isTest = process.env.NODE_ENV === 'test';

  // Fastify's plugin encapsulation means auth.routes.ts's/clinic.routes.ts's
  // own `fastify.decorate('permissionService', ...)` never reaches this
  // sibling plugin's scope, so `requirePermission`'s
  // `request.server.permissionService` read would otherwise be undefined
  // here. Decorate locally, matching clinic.routes.ts/inventory.routes.ts's
  // own copy of this exact pattern (inventory.routes.ts's own header comment
  // documents the same bug, found via live E2E testing).
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', new PermissionService(fastify.prisma, fastify.redis)); // D-30 exemption
  }

  // ─── Repositories, admin-scoped (see file header) — feed ONLY the BullMQ
  // workers, the inbound webhook router, and the booking/reminder background
  // handlers constructed below, none of which run inside an authenticated
  // HTTP request.
  // D-30 exemption: reminderSweepWorker's runReminderSweep processes every
  // clinic in one pass (no single clinicId to scope a tenant client to), and
  // the inbound router/booking/reminder handlers run from a webhook
  // delivery or a queue job, neither of which has a `request.db`.
  const repository = new WhatsAppRepository(fastify.prisma);
  const bookingRepository = new BookingRepository(fastify.prisma);
  const reminderSourceRepository = new ReminderSourceRepository(fastify.prisma);
  const reminderTaskRepository = new ReminderTaskRepository(fastify.prisma);
  // `reminderSourceRepository` is consumed by the reminder-sweep worker's
  // deps below (WHA-01), not by the route surface itself.

  // ─── Queues, closed on Fastify's onClose hook ─────────────────────────────
  const queues = createWhatsAppQueues(fastify.redis);
  fastify.addHook('onClose', async () => {
    await queues.close();
  });

  // ─── Services, admin-scoped (see file header) — feed the workers/inbound
  // router/webhook path below, plus (for whatsAppService/bookingService
  // only) the two controller handler pairs that need their shared,
  // multi-context instance.
  const authz = new SendAuthorizationService(repository);
  // D-30 exemption: WhatsAppService.sendTemplate/retryMessage call
  // `prisma.$transaction(async (tx) => ...)` — a per-request `DbClient`
  // union field can't resolve that overload (see file header) — and this
  // single instance is shared by the HTTP send/retry handlers,
  // BookingService (below), and reminder-sweep.job.ts's cross-clinic batch
  // send, so it cannot be rebuilt per single clinicId either.
  const whatsAppService = new WhatsAppService(
    repository,
    authz,
    fastify.prisma,
    queues.outbound,
    fastify.io ?? null,
  );
  // D-30 exemption: feeds inboundRouter/outboundWorker/simulatorWorker below
  // — none of which run inside an authenticated HTTP request.
  const deliveryStatusService = new DeliveryStatusService(repository, fastify.prisma, fastify.io ?? null);

  // ─── Phase 8 (08-10/08-11) scheduling collaborators, admin-scoped ─────────
  // D-30 exemption: identical reasoning to whatsAppService/bookingService
  // above — these feed OwnerActionService (webhook/simulator-triggered,
  // never inside an authenticated request) and BookingService's D-12
  // redirect (shared with bookingHandler, also webhook-triggered), so they
  // cannot be rebuilt per single clinicId either. See the file header's
  // "Fix" paragraph for why this construction lives here rather than only
  // in scheduling.routes.ts.
  const availabilityRepository = new AvailabilityRepository(fastify.prisma);
  const availabilityService = new AvailabilityService(availabilityRepository, fastify.prisma, fastify.io ?? null);
  const appointmentRepository = new AppointmentRepository(fastify.prisma);
  const appointmentService = new AppointmentService(
    appointmentRepository,
    availabilityService,
    fastify.prisma,
    fastify.io ?? null,
  );

  // A second, independent `NotificationBus` — `scheduling.routes.ts` builds
  // its own for the identical reason (`fastify.notificationBus` is not
  // reachable from a sibling plugin registration; see that file's own
  // `key-decisions` entry). Closed on this plugin's own `onClose` hook.
  const schedulingNotificationBus = createNotificationBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await schedulingNotificationBus.close();
  });
  const pushTriggers = new PushTriggerService(schedulingNotificationBus, fastify.prisma, fastify.redis);

  // D-17/D-18: the appointment ADVANCE/ON_DATE reminder-discovery source,
  // reusing this file's own `repository`/`reminderTaskRepository` instances
  // rather than constructing new ones — there is already exactly one of
  // each in this composition root. Passed to `createReminderSweepWorker`
  // below (closing 08-11-SUMMARY.md's Known Gap #3) and to
  // `OwnerActionService` (its own CANCEL branch needs
  // `cancelPendingForAppointment`).
  const appointmentReminderService = new AppointmentReminderService(
    reminderTaskRepository,
    repository,
    appointmentRepository,
  );

  // D-15, D-16, D-33: the owner KEEP/MOVE/CANCEL bridge. `ownerReplySender`
  // adapts `OwnerReplySender` onto THIS file's own existing send path
  // (`repository.createOutboundMessage` + `touchThread` + `queues.outbound`)
  // — the exact mechanism `booking-inbound.handler.ts`'s own `sendText`
  // already uses — rather than opening a second `Queue` instance the way
  // `scheduling.routes.ts` has to (that file has no `queues.outbound` of its
  // own to reuse).
  const ownerReplySender: OwnerReplySender = {
    async send(clinicId: string, ownerId: string, body: string): Promise<void> {
      const thread = await fastify.prisma.whatsAppThread.findFirst({ where: { clinicId, ownerId } });
      if (!thread) {
        fastify.log.warn({ clinicId, ownerId }, 'whatsapp: no WhatsApp thread found for owner reply, skipping send');
        return;
      }
      const message = await repository.createOutboundMessage(clinicId, {
        threadId: thread.id,
        channel: 'SIMULATOR',
        body,
        contextType: 'BOOKING',
      });
      await repository.touchThread(clinicId, thread.id, {
        lastMessageAt: new Date(),
        lastMessagePreview: body.slice(0, 120),
        lastContextType: 'BOOKING',
      });
      await queues.outbound.add(
        'send',
        { messageId: (message as { id: string }).id },
        { jobId: `send-${(message as { id: string }).id}`, ...WA_JOB_OPTIONS },
      );
    },
  };

  const ownerActionService = new OwnerActionService(
    appointmentRepository,
    appointmentService,
    appointmentReminderService,
    pushTriggers,
    fastify.prisma,
    ownerReplySender,
  );

  // The REAL AppointmentActionHandler (08-10 Task 3), replacing
  // InboundRouterService's no-op default — closes 08-11-SUMMARY.md's Known
  // Gap #1.
  const appointmentActionHandler = createAppointmentActionHandler({ ownerActionService });

  // D-30 exemption: feeds bookingHandler (webhook-triggered) below. The
  // controller's own `getSlotsHandler` uses `buildSlotService` instead (see
  // the per-request builders, below the workers).
  const slotService = new SlotService(fastify.prisma);
  // D-30 exemption: BookingService.confirmBooking/cancelBooking/moveBooking
  // call `prisma.$transaction(async (tx) => ...)`, the same overload
  // constraint as WhatsAppService above — and this instance is shared with
  // bookingHandler (webhook-triggered inbound booking), so it cannot be
  // rebuilt per single clinicId either.
  const bookingService = new BookingService({
    repository: bookingRepository,
    prisma: fastify.prisma,
    whatsAppService,
    // D-12: the real-appointment redirect on WhatsApp booking confirmation
    // — closes 08-11-SUMMARY.md's Known Gap #2. Both are the exact `Pick<>`
    // shapes `BookingServiceDeps` declares.
    appointmentService,
    availability: availabilityService,
  });

  // The REAL BookingInboundHandler (07-10), replacing InboundRouterService's
  // no-op default.
  // D-30 exemption: runs from a webhook delivery, which has no `request.db`.
  const bookingHandler = createBookingInboundHandler({
    prisma: fastify.prisma,
    repository,
    bookingService,
    slotService,
    outboundQueue: queues.outbound,
  });

  // D-30 exemption: shared with the reminder-sweep worker below (which
  // sweeps every clinic in one pass) and the webhook-triggered
  // reminderHandler just below it.
  const reminderTaskService = new ReminderTaskService(reminderTaskRepository, repository, fastify.prisma);
  // The REAL ReminderReplyHandler (07-11), replacing InboundRouterService's
  // no-op default.
  const reminderHandler = createReminderReplyHandler({ taskService: reminderTaskService });

  // D-30 exemption: runs from a webhook delivery, which has no `request.db`.
  const inboundRouter = new InboundRouterService({
    repository,
    prisma: fastify.prisma,
    deliveryStatusService,
    bookingHandler,
    reminderHandler,
    appointmentActionHandler,
  });

  // ─── Workers (self-guard on NODE_ENV === 'test', Pitfall 7) ───────────────
  // D-30 exemption: BullMQ workers have no HTTP request context at all, so
  // there is no `request.db` to build from — matching the existing
  // `jobs/midnight-archive.ts` precedent for admin-scoped background work.
  const outboundWorker = createOutboundWorker({
    prisma: fastify.prisma,
    redis: fastify.redis,
    repository,
    deliveryStatusService,
    simulatorQueue: queues.simulator,
    // WHA-01/Anti-Pattern A5 fix: lets a terminal (non-retryable) send
    // failure on an automated reminder message cap its `WhatsAppReminderTask`
    // immediately via `capForNonRetryableFailure`, instead of leaving it
    // `SENT` for a wasted escalation cycle.
    reminderTaskService,
  });
  // D-30 exemption: same as outboundWorker above — no `request.db` inside a
  // BullMQ worker.
  const simulatorWorker = createSimulatorWorker({
    prisma: fastify.prisma,
    redis: fastify.redis,
    deliveryStatusService,
    inboundRouter,
  });
  // WHA-01 fix: the reminder sweep's OWN dedicated worker, consuming
  // `queues.reminderSweep` — never `queues.outbound`. Assembled from exactly
  // what `runReminderSweep` needs (`ReminderSweepDeps`), all of which this
  // file already constructs above for the route surface itself.
  // D-30 exemption: sweeps every clinic in one pass — there is no single
  // clinicId to scope a tenant client to, and no `request.db` regardless
  // since this runs from a BullMQ worker, not an HTTP request.
  const reminderSweepWorker = createReminderSweepWorker({
    prisma: fastify.prisma,
    sourceRepo: reminderSourceRepository,
    taskRepo: reminderTaskRepository,
    taskService: reminderTaskService,
    whatsAppService,
    outboundQueue: queues.outbound,
    redis: fastify.redis,
    // D-17/D-18: closes 08-11-SUMMARY.md's Known Gap #3 — the appointment
    // ADVANCE/ON_DATE reminder-discovery pass now actually runs on the same
    // daily sweep cadence as Phase 7's own three reminder sources.
    appointmentReminders: appointmentReminderService,
  });
  fastify.addHook('onClose', async () => {
    await outboundWorker?.close();
    await simulatorWorker?.close();
    await reminderSweepWorker?.close();
  });

  // ─── Reminder sweep scheduler (Pitfall 2: Redis-coordinated, once across
  // N ECS tasks) — registered only outside test, exactly like the existing
  // midnight-archive/expiry-cron/overdue-invoices precedents at app.ts.
  // Scheduled onto `queues.reminderSweep`, its own dedicated queue — the
  // WHA-01 fix: this previously scheduled onto `queues.outbound`, whose
  // worker had no code path for a `{}`-payload job, so the sweep never
  // actually ran. ────────────────────────────────────────────────────────
  if (!isTest) {
    await registerReminderSweep(queues.reminderSweep);
  }

  // ─── Per-request builders (D-30) — fresh, RLS-scoped instances for the
  // controller handlers that run inside an authenticated request, following
  // `patient.routes.ts`'s `buildService = (db) => new XService(...)` shape.
  // Kept separate from the admin-scoped instances above, which continue to
  // feed only the workers/inbound router/webhook path.
  const buildRepository = (db: TenantPrismaClient) => new WhatsAppRepository(db);
  const buildInboxService = (db: TenantPrismaClient) => new InboxService(db);
  const buildClinicConfigService = (db: TenantPrismaClient) =>
    new ClinicConfigService(new WhatsAppRepository(db));
  const buildBookingRepository = (db: TenantPrismaClient) => new BookingRepository(db);
  const buildSlotService = (db: TenantPrismaClient) => new SlotService(db);
  const buildReminderTaskService = (db: TenantPrismaClient) =>
    new ReminderTaskService(new ReminderTaskRepository(db), new WhatsAppRepository(db), db);

  // ─── Controller + routes ───────────────────────────────────────────────
  const controller = createWhatsAppController({
    buildRepository,
    buildInboxService,
    buildClinicConfigService,
    buildBookingRepository,
    buildSlotService,
    buildReminderTaskService,
    // D-30 exemption: shared, admin-scoped singletons — see the header
    // comment above and the exemption at whatsAppService's/bookingService's
    // own construction — used only by sendTemplateHandler, retryMessageHandler,
    // updateOwnerPreferenceHandler, cancelBookingHandler, and moveBookingHandler.
    whatsAppService,
    bookingService,
  });

  const preHandler = [authenticate, tenantContext];
  const sendPreHandler = [authenticate, tenantContext, requirePermission('SEND_WHATSAPP')];

  fastify.get('/whatsapp/threads', { preHandler, handler: controller.listThreadsHandler });
  fastify.get('/whatsapp/threads/:threadId', { preHandler, handler: controller.getThreadHandler });
  fastify.post('/whatsapp/send', { preHandler: sendPreHandler, handler: controller.sendTemplateHandler });
  fastify.post(
    '/whatsapp/messages/:messageId/retry',
    { preHandler: sendPreHandler, handler: controller.retryMessageHandler },
  );

  // ─── Admin-only simulator config (D-14, D-16, D-20) — no clinic id in the
  // path anywhere: `clinicId` comes only from the JWT, so one clinic can
  // never read/write another's config row. ──────────────────────────────
  fastify.get(
    '/whatsapp/config',
    {
      preHandler: [authenticate, tenantContext, requirePermission('MANAGE_CLINIC_SETTINGS')],
      handler: controller.getConfigHandler,
    },
  );
  fastify.patch(
    '/whatsapp/config',
    {
      preHandler: [authenticate, tenantContext, requirePermission('MANAGE_CLINIC_SETTINGS')],
      handler: controller.updateConfigHandler,
    },
  );

  // ─── Owner preference: opt-out + invalid-number marking (D-10, D-11) ────
  // D-24: no `POST /whatsapp/owners/:ownerId/consent` route exists — consent
  // capture is out of scope for Phase 7's UI (locked after 07-13-PLAN.md was
  // written). `WhatsAppService.grantConsent`/`withdrawConsent` remain
  // service methods with no HTTP caller.
  fastify.patch(
    '/whatsapp/owners/:ownerId/preference',
    { preHandler: sendPreHandler, handler: controller.updateOwnerPreferenceHandler },
  );
  // WHA-02: read-only counterpart, same permission gate — reading this state
  // is not more sensitive than writing it. Lets `SendTemplateLauncher` fetch
  // an owner's preference/consent state outside of thread context (e.g. from
  // the pet profile), where no `WhatsAppThreadSummary` exists to read it from.
  fastify.get(
    '/whatsapp/owners/:ownerId/preference',
    { preHandler: sendPreHandler, handler: controller.getOwnerPreferenceHandler },
  );

  // ─── Staff-only booking transitions (D-09) ──────────────────────────────
  fastify.post(
    '/whatsapp/bookings/:bookingId/cancel',
    { preHandler: sendPreHandler, handler: controller.cancelBookingHandler },
  );
  fastify.post(
    '/whatsapp/bookings/:bookingId/move',
    { preHandler: sendPreHandler, handler: controller.moveBookingHandler },
  );
  fastify.post(
    '/whatsapp/threads/:threadId/resolve',
    { preHandler: sendPreHandler, handler: controller.markResolvedHandler },
  );

  // ─── Booking / slot reads (mobile booking detail + move flow) ──────────
  fastify.get('/whatsapp/bookings', { preHandler, handler: controller.listBookingsHandler });
  fastify.get('/whatsapp/bookings/:bookingId', { preHandler, handler: controller.getBookingHandler });
  fastify.get('/whatsapp/slots', { preHandler, handler: controller.getSlotsHandler });

  // ─── Webhook plugin (07-09) — encapsulated child registration so its
  // scoped raw-body content-type parser stays confined to the two webhook
  // routes and never leaks onto the routes registered above (see that
  // file's own header comment on why this must stay a separate plugin).
  // Passes THIS file's fully-wired `inboundRouter`/`deliveryStatusService`
  // as plugin options — fixed alongside the scheduling wiring above, since
  // this plugin used to construct its own bare-bones `InboundRouterService`
  // with none of bookingHandler/reminderHandler/appointmentActionHandler
  // injected (see that file's own header comment). ───────────────────────
  await fastify.register(whatsappWebhookRoutes, { inboundRouter, deliveryStatusService });

  fastify.log.info('WhatsApp routes registered');
}
