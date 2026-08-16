/**
 * WHA-05 / D-20 — factory-style controller (matching `emr.controller.ts:19-52`,
 * not the class-style `VaccinationController`): `createWhatsAppController(deps)`
 * returns an object of handlers, each validating its own input with a local
 * `.safeParse()` and the shared `validationError()` helper.
 *
 * `clinicId` is read ONLY from `request.user.activeClinicId`, and the actor
 * user id ONLY from `request.user.id` — never from the request body
 * (T-07-12-01). This is the single most important invariant in this file:
 * a client that supplied its own `clinicId` in `POST /whatsapp/send`'s body
 * must have it silently ignored, not honored.
 *
 * Handlers added in 07-12: `listThreadsHandler`, `getThreadHandler`,
 * `sendTemplateHandler`, `retryMessageHandler`.
 *
 * Handlers added in 07-13 (this plan):
 *   - `getConfigHandler`/`updateConfigHandler` — Admin-only simulator config
 *     (D-14, D-16, D-20). `updateConfigHandler` still `safeParse`s the body
 *     itself (matching this file's own convention) even though
 *     `ClinicConfigService.updateConfig` independently re-validates through
 *     the same schema — belt and suspenders, and what makes the service
 *     unit-testable in isolation from this controller.
 *   - `updateOwnerPreferenceHandler` — opt-out + invalid-number marking
 *     (D-10, D-11), 404 on a cross-tenant owner.
 *   - `getOwnerPreferenceHandler` (added later, WHA-02) — the read-only
 *     counterpart: lets a caller with no thread context (e.g. the pet
 *     profile) discover an owner's opt-out/invalid-number state and whether
 *     a consent record exists, in one request, so `SendTemplateLauncher` can
 *     populate `TemplateSendSheet`'s `consentWarning`/`optedOut`/
 *     `numberInvalid` props itself instead of requiring every caller to
 *     supply them. Same permission gate and 404-on-cross-tenant-owner
 *     behavior as the PATCH above; no write, no audit log.
 *   - `cancelBookingHandler`/`moveBookingHandler` — staff-only booking
 *     transitions (D-09): `request.user.id` is passed as the REQUIRED
 *     `actorUserId` argument `BookingService.cancelBooking`/`moveBooking`
 *     take, which is the structural reason an inbound WhatsApp event (which
 *     has no authenticated actor) can never reach either.
 *   - `markResolvedHandler` — UI-SPEC's `Mark resolved` action (D-04):
 *     clears a thread's `needsAction` flag and acknowledges its capped
 *     reminder tasks via `ReminderTaskService.acknowledgeTask`, idempotently.
 *   - `listBookingsHandler`/`getBookingHandler`/`getSlotsHandler` — reads for
 *     the mobile booking detail and move flow.
 *
 * D-24 (locked AFTER 07-13-PLAN.md was written): WhatsApp consent capture is
 * out of scope for Phase 7's UI. No `upsertConsentHandler` exists here and
 * none is wired in `whatsapp.routes.ts` — `WhatsAppService.grantConsent`/
 * `withdrawConsent` (07-08) remain as SERVICE methods with no HTTP caller,
 * exactly as D-24 describes ("deferred to a future phase or an
 * external/manual process").
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';
import type { InboxService } from './inbox.service.js';
import type { WhatsAppService } from './whatsapp.service.js';
import type { WhatsAppRepository } from './whatsapp.repository.js';
import type { ClinicConfigService } from './clinic-config.service.js';
import type { BookingService } from './booking/booking.service.js';
import type { BookingRepository } from './booking/booking.repository.js';
import type { SlotService } from './booking/slot.service.js';
import type { ReminderTaskService } from './reminders/reminder-task.service.js';
import {
  threadParamsSchema,
  messageParamsSchema,
  bookingParamsSchema,
  ownerParamsSchema,
  slotsQuerySchema,
  sendTemplateSchema,
  ownerPreferenceSchema,
  clinicConfigSchema,
  bookingMoveSchema,
  bookingCancelSchema,
  inboxQuerySchema,
  threadQuerySchema,
} from './whatsapp.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

/** Never discloses whether a row exists in another clinic — 404, matching
 * `vaccination.service.ts:181-193`'s cross-tenant precedent. */
function ownerNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'OWNER_NOT_FOUND', message: 'Owner not found' },
  });
}

function threadNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'THREAD_NOT_FOUND', message: 'WhatsApp thread not found' },
  });
}

function bookingNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'WHATSAPP_BOOKING_NOT_FOUND', message: 'WhatsApp booking request not found' },
  });
}

/** Partial: a config PATCH may send just one field. Re-declared here (not
 * imported from `clinic-config.service.ts`) so this file's own request-shape
 * validation stays independent of that service's internal re-validation —
 * both trace back to the SAME `clinicConfigSchema`, so the bounds (D-14)
 * never drift between them. */
const clinicConfigUpdateSchema = clinicConfigSchema.partial();

/**
 * D-30: per-request factories rather than prebuilt instances, matching
 * `patient.routes.ts`/`patient.controller.ts`'s shape — every handler below
 * resolves its collaborators from `request.db` (the tenant-scoped,
 * RLS-bound client) as its first statement, instead of sharing a
 * plugin-scope admin client across every clinic.
 *
 * `whatsAppService`/`bookingService` are the exception: both are prebuilt,
 * shared, admin-scoped singletons (see `whatsapp.routes.ts`'s construction
 * comments) because each calls `prisma.$transaction(async (tx) => ...)`
 * internally — a `DbClient` union field can't resolve that overload — and
 * both are shared with background contexts (the reminder sweep, the inbound
 * booking handler) that never have a single request's clinicId to scope a
 * fresh instance to.
 */
export interface WhatsAppControllerDeps {
  buildRepository: (db: TenantPrismaClient) => WhatsAppRepository;
  buildInboxService: (db: TenantPrismaClient) => InboxService;
  buildClinicConfigService: (db: TenantPrismaClient) => ClinicConfigService;
  buildBookingRepository: (db: TenantPrismaClient) => BookingRepository;
  buildSlotService: (db: TenantPrismaClient) => SlotService;
  buildReminderTaskService: (db: TenantPrismaClient) => ReminderTaskService;
  whatsAppService: WhatsAppService;
  bookingService: BookingService;
}

export function createWhatsAppController(deps: WhatsAppControllerDeps) {
  return {
    /**
     * GET /whatsapp/threads — the inbox thread list (UI-SPEC's six filter
     * chips, five-field search, cursor pagination capped at 50).
     */
    async listThreadsHandler(request: FastifyRequest, reply: FastifyReply) {
      const inboxService = deps.buildInboxService(request.db);

      const query = inboxQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const inbox = await inboxService.listThreads(
        request.user.activeClinicId,
        query.data,
      );

      return reply.status(200).send({ data: inbox });
    },

    /**
     * GET /whatsapp/threads/:threadId — a single thread's detail, with its
     * messages in ascending order. Marks the thread read as a side effect.
     */
    async getThreadHandler(request: FastifyRequest, reply: FastifyReply) {
      const inboxService = deps.buildInboxService(request.db);

      const params = threadParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      // Accepted but unused beyond validation in this plan — message-history
      // pagination inside a single thread is not yet wired to the service;
      // parsing it here keeps `?limit=`/`?cursor=` from reaching the service
      // as unvalidated input if a later plan adds it.
      const query = threadQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const thread = await inboxService.getThread(
        request.user.activeClinicId,
        params.data.threadId,
      );

      return reply.status(200).send({ data: thread });
    },

    /**
     * POST /whatsapp/send — persist-then-dispatch a template send
     * (WhatsAppService.sendTemplate). `202` with `{ data: { messageId } }`
     * matches UI-SPEC's "Message queued" toast: the row is persisted, the
     * provider call is asynchronous.
     */
    async sendTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = sendTemplateSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await deps.whatsAppService.sendTemplate(body.data, {
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
      });

      return reply.status(202).send({ data: result });
    },

    /**
     * POST /whatsapp/messages/:messageId/retry — creates a NEW message row
     * from a FAILED one (`WhatsAppService.retryMessage`), leaving the
     * original untouched.
     */
    async retryMessageHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = messageParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const result = await deps.whatsAppService.retryMessage(
        request.user.activeClinicId,
        params.data.messageId,
        { clinicId: request.user.activeClinicId, userId: request.user.id },
      );

      return reply.status(202).send({ data: result });
    },

    // ─── Admin-only simulator config (D-14, D-16, D-20) ───────────────────

    /**
     * GET /whatsapp/config — read (creating on first access via
     * `ClinicConfigService.getConfig`). No id in the path: `clinicId` comes
     * only from the JWT, so one clinic can never read/write another's row.
     */
    async getConfigHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicConfigService = deps.buildClinicConfigService(request.db);
      const config = await clinicConfigService.getConfig(request.user.activeClinicId);
      return reply.status(200).send({ data: config });
    },

    /**
     * PATCH /whatsapp/config — a PATCH may send any subset of
     * `clinicConfigSchema`'s fields. `deliveryMode` is a single per-clinic
     * global control here (D-16) — this handler has no `ownerId`/`threadId`
     * anywhere.
     */
    async updateConfigHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicConfigService = deps.buildClinicConfigService(request.db);

      const body = clinicConfigUpdateSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await clinicConfigService.updateConfig(
        request.user.activeClinicId,
        body.data,
      );

      return reply.status(200).send({ data: result });
    },

    // ─── Owner preference: opt-out + invalid-number marking (D-10, D-11) ──

    /**
     * PATCH /whatsapp/owners/:ownerId/preference — a global per-owner
     * reminder opt-out toggle and/or invalid-number marking. 404s on an
     * owner outside the caller's clinic before any write (the
     * `vaccination.service.ts:181-193` throw shape, replicated here as a
     * direct reply since this is a controller-local lookup, not a thrown
     * service error).
     */
    async updateOwnerPreferenceHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = ownerParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }
      const body = ownerPreferenceSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const clinicId = request.user.activeClinicId;
      const actorUserId = request.user.id;
      const { ownerId } = params.data;

      const owner = await request.db.petOwner.findFirst({ where: { id: ownerId, clinicId } });
      if (!owner) {
        return ownerNotFound(reply);
      }

      // `ownerPreferenceSchema.numberStatus` also permits 'UNKNOWN' (a reset
      // affordance the schema allows generally); `WhatsAppService.
      // setOwnerPreference`'s narrower `SetOwnerPreferenceInput` only models
      // 'VALID'/'INVALID' (the two states this endpoint's action cards
      // actually drive), so 'UNKNOWN' is simply omitted rather than passed
      // through untyped.
      const preferenceInput: Parameters<typeof deps.whatsAppService.setOwnerPreference>[2] = {
        remindersOptedOut: body.data.remindersOptedOut,
        source: body.data.source,
      };
      if (body.data.numberStatus === 'VALID' || body.data.numberStatus === 'INVALID') {
        preferenceInput.numberStatus = body.data.numberStatus;
      }

      const result = await deps.whatsAppService.setOwnerPreference(
        clinicId,
        ownerId,
        preferenceInput,
        { clinicId, userId: actorUserId },
      );

      // Distinct audit entry from WHATSAPP_OPT_OUT (which
      // `setOwnerPreference` already writes above when remindersOptedOut is
      // true) — marking a number invalid is a separate staff action even
      // when it arrives in the same request body.
      if (body.data.numberStatus === 'INVALID') {
        await writeAuditLog(request.db, AuditEvent.WHATSAPP_NUMBER_MARKED_INVALID, {
          userId: actorUserId,
          clinicId,
          metadata: { ownerId },
        });
      }

      return reply.status(200).send({ data: result });
    },

    /**
     * GET /whatsapp/owners/:ownerId/preference — read-only counterpart to
     * the PATCH above (WHA-02). Returns the owner's global preference row
     * (defaulted for an owner with none yet: `remindersOptedOut: false`,
     * `numberStatus: 'UNKNOWN'`) plus a boolean-only consent signal — per
     * D-13, this surfaces only whether a consent record is MISSING, never
     * the `ConsentRecord`'s raw contents (purpose text, actor, IP). Same
     * 404-on-cross-tenant-owner behavior as the PATCH handler.
     */
    async getOwnerPreferenceHandler(request: FastifyRequest, reply: FastifyReply) {
      const repository = deps.buildRepository(request.db);

      const params = ownerParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const clinicId = request.user.activeClinicId;
      const { ownerId } = params.data;

      const owner = await request.db.petOwner.findFirst({ where: { id: ownerId, clinicId } });
      if (!owner) {
        return ownerNotFound(reply);
      }

      const [preference, consent] = await Promise.all([
        repository.getOwnerPreference(clinicId, ownerId),
        repository.getCurrentWhatsAppConsent(ownerId),
      ]);

      return reply.status(200).send({
        data: {
          remindersOptedOut: preference?.remindersOptedOut ?? false,
          numberStatus: preference?.numberStatus ?? 'UNKNOWN',
          hasConsent: !!consent,
        },
      });
    },

    // ─── Staff-only booking transitions (D-09) ────────────────────────────

    /**
     * POST /whatsapp/bookings/:bookingId/cancel — `request.user.id` is
     * passed as `BookingService.cancelBooking`'s REQUIRED `actorUserId`
     * argument. That required parameter is the structural reason an inbound
     * WhatsApp event (which has no authenticated actor) can never reach
     * this transition, even by accident (D-09).
     */
    async cancelBookingHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = bookingParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }
      const body = bookingCancelSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const cancelled = await deps.bookingService.cancelBooking(
        request.user.activeClinicId,
        params.data.bookingId,
        request.user.id,
        body.data.reason,
      );

      return reply.status(200).send({ data: cancelled });
    },

    /**
     * POST /whatsapp/bookings/:bookingId/move — same `actorUserId`
     * structural guarantee as cancel (D-09). A slot already taken by
     * another booking surfaces as `SLOT_TAKEN` (409), not a thrown error —
     * `BookingService.moveBooking` treats a P2002 unique-index collision as
     * this expected business outcome, and the original booking is left
     * untouched because the whole transaction rolled back.
     */
    async moveBookingHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = bookingParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }
      const body = bookingMoveSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await deps.bookingService.moveBooking(
        request.user.activeClinicId,
        params.data.bookingId,
        request.user.id,
        {
          date: new Date(body.data.slotDate),
          startMinutes: body.data.slotStartMinutes,
          durationMinutes: body.data.slotDurationMinutes,
        },
      );

      if (result.outcome === 'SLOT_TAKEN') {
        return reply.status(409).send({
          error: { code: 'SLOT_TAKEN', message: 'That slot has already been taken' },
        });
      }

      return reply.status(200).send({ data: result.booking });
    },

    /**
     * POST /whatsapp/threads/:threadId/resolve — UI-SPEC's `Mark resolved`
     * action (D-04). Clears the thread's `needsAction` flag and
     * acknowledges every CAPPED_NEEDS_ACTION reminder task for that
     * thread's owner via `ReminderTaskService.acknowledgeTask` (recording
     * `request.user.id` as the auditable actor). Idempotent: a thread whose
     * `needsAction` is already false returns 200 with no further writes.
     */
    async markResolvedHandler(request: FastifyRequest, reply: FastifyReply) {
      const repository = deps.buildRepository(request.db);
      const reminderTaskService = deps.buildReminderTaskService(request.db);

      const params = threadParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const clinicId = request.user.activeClinicId;
      const actorUserId = request.user.id;
      const { threadId } = params.data;

      const thread = await repository.findThreadById(clinicId, threadId);
      if (!thread) {
        return threadNotFound(reply);
      }

      if (!thread.needsAction) {
        return reply.status(200).send({ data: { resolved: true } });
      }

      const cappedTasks = await request.db.whatsAppReminderTask.findMany({
        where: { clinicId, ownerId: thread.ownerId as string, state: 'CAPPED_NEEDS_ACTION' },
      });

      for (const task of cappedTasks) {
        await reminderTaskService.acknowledgeTask(clinicId, task.id, actorUserId);
      }

      // Cleared explicitly (rather than relying solely on the last
      // `acknowledgeTask` call's own internal "any other capped task left?"
      // check) so this endpoint's own idempotent guarantee never depends on
      // iteration order across more than one capped task for the owner.
      await repository.clearNeedsAction(clinicId, threadId);

      return reply.status(200).send({ data: { resolved: true } });
    },

    // ─── Booking / slot reads (mobile booking detail + move flow) ─────────

    /** GET /whatsapp/bookings — every booking request for the caller's clinic. */
    async listBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
      const bookings = await request.db.whatsAppBookingRequest.findMany({
        where: { clinicId: request.user.activeClinicId },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send({ data: { bookings } });
    },

    /** GET /whatsapp/bookings/:bookingId — 404 on a cross-tenant id, never a 403 (T-07-13-04). */
    async getBookingHandler(request: FastifyRequest, reply: FastifyReply) {
      const bookingRepository = deps.buildBookingRepository(request.db);

      const params = bookingParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const booking = await bookingRepository.findBookingRequestById(
        request.user.activeClinicId,
        params.data.bookingId,
      );
      if (!booking) {
        return bookingNotFound(reply);
      }

      return reply.status(200).send({ data: booking });
    },

    /** GET /whatsapp/slots?date=YYYY-MM-DD — the offerable slots staff pick a new slot from when moving a booking. */
    async getSlotsHandler(request: FastifyRequest, reply: FastifyReply) {
      const slotService = deps.buildSlotService(request.db);

      const query = slotsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const result = await slotService.getOfferableSlots(request.user.activeClinicId, {
        fromDate: query.data.date,
      });

      return reply.status(200).send({ data: result });
    },
  };
}

export type WhatsAppController = ReturnType<typeof createWhatsAppController>;
