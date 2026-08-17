/**
 * Plan 08-11 — the scheduling module's composition root: repositories,
 * services (including a SECOND `QueueRepository`/`QueueService` pair for
 * D-28), the Phase-7-dependent reminder-cancellation/owner-action wiring
 * (guarded, per 08-10-SUMMARY.md), the 5-minute sweep (plan 08-09), and the
 * 15 permission-guarded HTTP endpoints both mobile and web consume.
 *
 * D-30: every repository here takes a raw `fastify.prisma`, never the
 * tenant-scoped per-request handle -- plans 08-05/08-07 deliberately left the
 * five scheduling tables without DB-level RLS (`08-05-SUMMARY.md`/
 * `08-07-SUMMARY.md`), so `AvailabilityService`/`AppointmentService` are
 * constructed ONCE at plugin scope (unlike `queue.routes.ts`'s per-request
 * `buildService` factory, which exists specifically for RLS-backed tables).
 */

import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { AvailabilityRepository } from './availability.repository.js';
import { AppointmentRepository } from './appointment.repository.js';
import { AvailabilityService } from './availability.service.js';
import { AppointmentService } from './appointment.service.js';
import { QueueHandoffService } from './queue-handoff.service.js';
import { PushTriggerService } from './push-trigger.service.js';
import { registerSchedulingSweep } from './scheduling.sweep.worker.js';
import { createSchedulingController } from './scheduling.controller.js';
import { QueueRepository } from '../queue/queue.repository.js';
import { QueueService } from '../queue/queue.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { createNotificationBus } from '../notifications/notification-bus.js';
import { WA_JOB_OPTIONS } from '../whatsapp/whatsapp-queue.js';
import type { AppointmentReminderService } from './reminder.service.js';
import type { OwnerActionService, OwnerReplySender } from './owner-action.service.js';

export default async function schedulingRoutes(fastify: FastifyInstance): Promise<void> {
  // Fastify's plugin encapsulation means clinic.routes.ts's/whatsapp.routes.ts's
  // own `fastify.decorate('permissionService', ...)` never reaches this
  // sibling plugin's scope (same fix those two files already carry, with the
  // same explanation) -- `requirePermission`'s `request.server.permissionService`
  // read would otherwise be undefined here.
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', new PermissionService(fastify.prisma, fastify.redis)); // D-30 exemption
  }

  // ─── Availability + appointment repositories/services ─────────────────────
  // D-30 exemption: see file header -- plans 08-05/08-07 deliberately left
  // these five scheduling tables without DB-level RLS, so fastify.prisma is
  // injected directly here, not request.db.
  const availabilityRepository = new AvailabilityRepository(fastify.prisma);
  const availabilityService = new AvailabilityService(availabilityRepository, fastify.prisma, fastify.io);

  // D-30 exemption: same reasoning as above.
  const appointmentRepository = new AppointmentRepository(fastify.prisma);

  // ─── D-27 push triggers ─────────────────────────────────────────────────
  // `fastify.notificationBus` (decorated by `notification.routes.ts`) is NOT
  // actually reachable here: Fastify's plugin encapsulation scopes a bare
  // `fastify.decorate(...)` call to that plugin's own child context and its
  // descendants, never to a SIBLING top-level `app.register(...)` call --
  // the exact same reason `clinic.routes.ts`/`whatsapp.routes.ts` above have
  // to re-decorate `permissionService` themselves rather than reading the
  // one `auth.routes.ts` already decorated. `emr.routes.ts` hit this same
  // wall for its own D-72 notification bus and resolved it the same way:
  // construct a fresh, cheap `NotificationBus` (a thin BullMQ producer
  // wrapper, no state to duplicate) rather than depending on a decoration
  // that plugin isolation makes unreachable. Constructed here, ahead of
  // `queueService` below, so that instance can be given `pushTriggers`
  // directly (5a5e683's fix for `queue.routes.ts` applied at this
  // composition root too, per T-08 finding queueservice-pushtriggers-partial-fix).
  const notificationBus = createNotificationBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await notificationBus.close();
  });

  // D-30 exemption: resolves clinic staff recipients by an explicit clinicId
  // filter, matching queue.routes.ts's own construction -- no per-request
  // tenant scoping needed.
  const pushTriggers = new PushTriggerService(notificationBus, fastify.prisma, fastify.redis);

  // D-30 exemption: a SECOND, independent `QueueRepository`/`QueueService` pair, built
  // the same way `queue.routes.ts` builds its own (raw `fastify.prisma` +
  // `fastify.io`) rather than importing that module's per-request instance --
  // there is no shared state to duplicate, both are stateless aside from the
  // `io` reference, and this instance needs to live at plugin scope so the
  // `onRescheduled`/`onCancelled` hooks below (and `QueueHandoffService`) can
  // close over ONE instance for the lifetime of the process.
  const queueRepository = new QueueRepository(fastify.prisma);
  const queueService = new QueueService(queueRepository, fastify.io, pushTriggers);

  // ─── Phase 7-dependent reminder-cancellation wiring (08-10), guarded ──────
  // `reminderService` stays `null` if this construction fails for ANY reason,
  // including "plan 08-10 was never merged into this branch" -- the dynamic
  // `import()` calls (rather than static imports) mean a missing WhatsApp
  // module fails HERE, inside the try, not at this file's own load time, so
  // every other scheduling endpoint still registers and works. Only the
  // reminder-cancellation half of the `onRescheduled`/`onCancelled` hook
  // below is then skipped. The D-28 queue-cleanup half of that SAME hook is
  // UNCONDITIONAL (plan 08-04 is an earlier, always-present wave, unlike
  // this Phase 7 dependency).
  let reminderService: AppointmentReminderService | null = null;
  try {
    const { ReminderTaskRepository } = await import('../whatsapp/reminders/reminder-task.repository.js');
    const { WhatsAppRepository } = await import('../whatsapp/whatsapp.repository.js');
    const { AppointmentReminderService: RealAppointmentReminderService } = await import('./reminder.service.js');

    // D-30 exemption: same reasoning as the file header/availabilityRepository
    // above -- no DB-level RLS on these tables, so fastify.prisma is injected
    // directly.
    const reminderTaskRepository = new ReminderTaskRepository(fastify.prisma);
    const whatsAppRepositoryForReminders = new WhatsAppRepository(fastify.prisma);
    reminderService = new RealAppointmentReminderService(
      reminderTaskRepository,
      whatsAppRepositoryForReminders,
      appointmentRepository,
    );
  } catch (err) {
    fastify.log.warn(
      { err },
      'scheduling: WhatsApp reminder wiring unavailable (Phase 7/plan 08-10 not landed) -- appointment-reminder cancellation on reschedule/cancel is disabled, everything else in this module is unaffected',
    );
  }

  // D-30 exemption: same reasoning as the file header -- no DB-level RLS on
  // these tables, so fastify.prisma is injected directly.
  const appointmentService = new AppointmentService(
    appointmentRepository,
    availabilityService,
    fastify.prisma,
    fastify.io,
    // onRescheduled -- D-28 (queue cleanup, unconditional) + D-10 reminder
    // cancellation (conditional on `reminderService`), each independently
    // caught so one failing never blocks the other.
    async (appointmentId: string, clinicId: string) => {
      try {
        await queueService.removeExpectedEntryForAppointment(clinicId, appointmentId);
      } catch (err) {
        fastify.log.error({ err, appointmentId, clinicId }, 'scheduling: queue EXPECTED cleanup failed on reschedule');
      }
      if (reminderService) {
        try {
          await reminderService.cancelPendingForAppointment(appointmentId, clinicId);
        } catch (err) {
          fastify.log.error({ err, appointmentId, clinicId }, 'scheduling: reminder cancellation failed on reschedule');
        }
      }
    },
    // onCancelled -- identical shape to onRescheduled above.
    async (appointmentId: string, clinicId: string) => {
      try {
        await queueService.removeExpectedEntryForAppointment(clinicId, appointmentId);
      } catch (err) {
        fastify.log.error({ err, appointmentId, clinicId }, 'scheduling: queue EXPECTED cleanup failed on cancel');
      }
      if (reminderService) {
        try {
          await reminderService.cancelPendingForAppointment(appointmentId, clinicId);
        } catch (err) {
          fastify.log.error({ err, appointmentId, clinicId }, 'scheduling: reminder cancellation failed on cancel');
        }
      }
    },
  );

  // D-30 exemption: same reasoning as the file header -- no DB-level RLS on
  // these tables, so fastify.prisma is injected directly.
  const queueHandoffService = new QueueHandoffService(
    appointmentRepository,
    queueRepository,
    appointmentService,
    fastify.prisma,
    fastify.io,
  );

  // ─── Owner-action bridge (08-10), guarded the same way as `reminderService`
  // above -- constructed here for plan compliance/future readiness, but NOT
  // wired into anything LIVE by this plan: `whatsapp.routes.ts` (the
  // WhatsApp module's own composition root) is out of this plan's declared
  // file scope, so `InboundRouterDeps.appointmentActionHandler` and
  // `BookingService`'s D-12 optional deps are not updated to consume this
  // instance yet. Recorded as a known, explicit gap in 08-11-SUMMARY.md for
  // a future plan to close -- constructing it here without wiring it in is
  // a deliberate, disclosed scope boundary, not an oversight. D-30 exemption:
  // this whole block only builds background-bridge collaborators, none of
  // which run inside an authenticated HTTP request. ─────────────
  let ownerActionService: OwnerActionService | null = null;
  if (reminderService) {
    try {
      const { OwnerActionService: RealOwnerActionService } = await import('./owner-action.service.js');
      const { WhatsAppRepository } = await import('../whatsapp/whatsapp.repository.js');
      const whatsAppRepositoryForReplies = new WhatsAppRepository(fastify.prisma);

      // Adapts `OwnerReplySender` onto Phase 7's EXISTING send path
      // (`WhatsAppRepository.createOutboundMessage` + `touchThread` + the
      // `whatsapp-outbound` queue) -- the exact mechanism
      // `booking-inbound.handler.ts`'s own `sendText` already uses, per
      // 08-10-SUMMARY.md's guidance. A second `Queue` instance pointed at
      // the SAME `whatsapp-outbound` name as `whatsapp.routes.ts`'s own
      // queue is fine -- BullMQ supports multiple producers on one queue,
      // and `outbound.worker.ts`'s worker consumes whichever job arrives.
      const replyQueue = new Queue('whatsapp-outbound', { connection: fastify.redis });
      fastify.addHook('onClose', async () => {
        await replyQueue.close();
      });

      const ownerReplySender: OwnerReplySender = {
        // D-30 exemption: runs from the owner-action bridge above, not
        // inside an HTTP request -- no request.db exists here either.
        async send(clinicId: string, ownerId: string, body: string): Promise<void> {
          const thread = await fastify.prisma.whatsAppThread.findFirst({ where: { clinicId, ownerId } });
          if (!thread) {
            fastify.log.warn({ clinicId, ownerId }, 'scheduling: no WhatsApp thread found for owner reply, skipping send');
            return;
          }
          const message = await whatsAppRepositoryForReplies.createOutboundMessage(clinicId, {
            threadId: thread.id,
            channel: 'SIMULATOR',
            body,
            contextType: 'BOOKING',
          });
          await whatsAppRepositoryForReplies.touchThread(clinicId, thread.id, {
            lastMessageAt: new Date(),
            lastMessagePreview: body.slice(0, 120),
            lastContextType: 'BOOKING',
          });
          await replyQueue.add(
            'send',
            { messageId: (message as { id: string }).id },
            { jobId: `send-${(message as { id: string }).id}`, ...WA_JOB_OPTIONS },
          );
        },
      };

      // D-30 exemption: same reasoning as ownerReplySender.send above.
      ownerActionService = new RealOwnerActionService(
        appointmentRepository,
        appointmentService,
        reminderService,
        pushTriggers,
        fastify.prisma,
        ownerReplySender,
      );
    } catch (err) {
      fastify.log.warn({ err }, 'scheduling: owner-action bridge construction failed');
    }
  }
  // Not consumed by any route in this plan (see comment block above) --
  // kept as a named local so a future plan wiring `whatsapp.routes.ts` has
  // an obvious single place to import the construction pattern from.
  void ownerActionService;

  // ─── Sweep registration (SCH-02/SCH-05) + cleanup ─────────────────────────
  // `registerSchedulingSweep` itself gates `Worker` construction on
  // `NODE_ENV !== 'test'` (plan 08-09) -- confirmed by reading
  // `scheduling.sweep.worker.ts` rather than assumed, per this plan's own
  // read_first instruction. No additional `isTest` gate is needed at this
  // call site.
  const { queue: sweepQueue, worker: sweepWorker } = registerSchedulingSweep(fastify.redis, {
    handoff: queueHandoffService,
    pushTriggers,
    appointments: appointmentRepository,
  });
  fastify.addHook('onClose', async () => {
    await sweepWorker?.close();
    await sweepQueue.close();
  });

  // ─── Controller + permission-guarded routes ───────────────────────────────
  const controller = createSchedulingController(appointmentService, availabilityService);

  const readPre = [authenticate, tenantContext, requirePermission('VIEW_SCHEDULE')];
  const writePre = [authenticate, tenantContext, requirePermission('MANAGE_SCHEDULE')];

  // Appointments (SCH-01, SCH-03)
  fastify.get('/scheduling/appointments', { preHandler: readPre, handler: controller.listAppointmentsHandler });
  fastify.get('/scheduling/appointments/:appointmentId', { preHandler: readPre, handler: controller.getAppointmentHandler });
  fastify.post('/scheduling/appointments', { preHandler: writePre, handler: controller.createAppointmentHandler });
  fastify.patch('/scheduling/appointments/:appointmentId', { preHandler: writePre, handler: controller.rescheduleAppointmentHandler });
  fastify.post('/scheduling/appointments/:appointmentId/cancel', { preHandler: writePre, handler: controller.cancelAppointmentHandler });
  fastify.patch('/scheduling/appointments/:appointmentId/status', { preHandler: writePre, handler: controller.updateAppointmentStatusHandler });

  // Slots (SCH-01)
  fastify.get('/scheduling/slots', { preHandler: readPre, handler: controller.getSlotsHandler });

  // Availability (SCH-01, D-30)
  fastify.get('/scheduling/availability/:vetId/template', { preHandler: readPre, handler: controller.getAvailabilityTemplateHandler });
  fastify.put('/scheduling/availability/:vetId/template', { preHandler: writePre, handler: controller.putAvailabilityTemplateHandler });
  fastify.put('/scheduling/availability/:vetId/override', { preHandler: writePre, handler: controller.putAvailabilityOverrideHandler });
  fastify.get('/scheduling/availability/resolved', { preHandler: readPre, handler: controller.getResolvedAvailabilityHandler });

  // Blocked periods (SCH-01, D-30)
  fastify.get('/scheduling/blocked-periods', { preHandler: readPre, handler: controller.getBlockedPeriodsHandler });
  fastify.post('/scheduling/blocked-periods', { preHandler: writePre, handler: controller.createBlockedPeriodHandler });
  fastify.delete('/scheduling/blocked-periods/:blockedPeriodId', { preHandler: writePre, handler: controller.deleteBlockedPeriodHandler });

  // Vets (D-23)
  fastify.get('/scheduling/vets', { preHandler: readPre, handler: controller.listVetsHandler });

  fastify.log.info('Scheduling routes registered');
}
