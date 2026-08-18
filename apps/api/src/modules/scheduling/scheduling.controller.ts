import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppointmentStatus } from '@breeyo/types';
import type { AppointmentService } from './appointment.service.js';
import type { AvailabilityService } from './availability.service.js';
import {
  createAppointmentBodySchema,
  rescheduleAppointmentBodySchema,
  cancelAppointmentBodySchema,
  appointmentStatusUpdateBodySchema,
  appointmentRangeQuerySchema,
  slotQuerySchema,
  upsertAvailabilityTemplateBodySchema,
  upsertAvailabilityOverrideBodySchema,
  createBlockedPeriodBodySchema,
  appointmentParamsSchema,
  blockedPeriodParamsSchema,
  availabilityVetParamsSchema,
  availabilityDateQuerySchema,
  blockedPeriodsQuerySchema,
} from './scheduling.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

function notFound(reply: FastifyReply, code: string, message: string) {
  return reply.status(404).send({ error: { code, message } });
}

/**
 * `createSchedulingController` -- mirrors `createQueueController`'s factory
 * shape, but takes prebuilt `AppointmentService`/`AvailabilityService`
 * instances rather than a per-request builder function: neither service's
 * repository uses the tenant-scoped `request.db` handle (plans 08-05/08-07
 * deliberately inject a raw `fastify.prisma` -- these five tables have no
 * DB-level RLS), so one plugin-scope instance, constructed once in
 * `scheduling.routes.ts`, is correct here (unlike `queue.routes.ts`'s D-30
 * per-request `buildService`).
 *
 * Every handler below reads `clinicId` from `request.user.activeClinicId`
 * ONLY -- never from `request.body`, `request.params` or `request.query`.
 */
export function createSchedulingController(
  appointmentService: AppointmentService,
  availabilityService: AvailabilityService,
) {
  return {
    async listAppointmentsHandler(request: FastifyRequest, reply: FastifyReply) {
      const query = appointmentRangeQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const appointments = await appointmentService.listAppointments({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        from: query.data.from,
        to: query.data.to,
        vetId: query.data.vetId,
      });

      return reply.status(200).send({ data: appointments });
    },

    async getAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = appointmentParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const appointment = await appointmentService.getAppointment(
        request.user.activeClinicId,
        params.data.appointmentId,
      );

      if (!appointment) {
        return notFound(reply, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
      }

      return reply.status(200).send({ data: appointment });
    },

    async getSlotsHandler(request: FastifyRequest, reply: FastifyReply) {
      const query = slotQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const slots = await appointmentService.getOfferableSlots({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        vetId: query.data.vetId,
        date: query.data.date,
        serviceCatalogId: query.data.serviceCatalogId,
        durationMinutes: query.data.durationMinutes,
      });

      return reply.status(200).send({ data: slots });
    },

    async createAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = createAppointmentBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await appointmentService.createAppointment({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        ownerId: body.data.ownerId,
        petIds: body.data.petIds,
        vetId: body.data.vetId,
        serviceCatalogId: body.data.serviceCatalogId,
        scheduledFor: body.data.scheduledFor,
        notes: body.data.notes,
        allowDoubleBook: body.data.allowDoubleBook,
        recurrence: body.data.recurrence,
      });

      return reply.status(201).send({ data: result });
    },

    async rescheduleAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = appointmentParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = rescheduleAppointmentBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await appointmentService.rescheduleAppointment({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        appointmentId: params.data.appointmentId,
        scheduledFor: body.data.scheduledFor,
        vetId: body.data.vetId,
        allowDoubleBook: body.data.allowDoubleBook,
        applyToSeries: body.data.applyToSeries,
      });

      return reply.status(200).send({ data: result });
    },

    async cancelAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = appointmentParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = cancelAppointmentBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await appointmentService.cancelAppointment({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        appointmentId: params.data.appointmentId,
        reason: body.data.reason,
        scope: body.data.scope,
      });

      return reply.status(200).send({ data: result });
    },

    async updateAppointmentStatusHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = appointmentParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = appointmentStatusUpdateBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const statusParams = {
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        appointmentId: params.data.appointmentId,
      };

      let appointment;
      switch (body.data.status) {
        case AppointmentStatus.CHECKED_IN:
          appointment = await appointmentService.checkInAppointment(statusParams);
          break;
        case AppointmentStatus.COMPLETED:
          appointment = await appointmentService.completeAppointment(statusParams);
          break;
        case AppointmentStatus.NO_SHOW:
          appointment = await appointmentService.markNoShow(statusParams);
          break;
        default:
          // SCHEDULED (not a real transition target) and CANCELLED (has its
          // own dedicated POST /cancel endpoint, which carries a reason and a
          // scope a bare status PATCH cannot express) are both rejected here
          // rather than silently ignored.
          return reply.status(400).send({
            error: {
              code: 'INVALID_TRANSITION',
              message: `Cannot transition to ${body.data.status} via this endpoint.`,
            },
          });
      }

      return reply.status(200).send({ data: appointment });
    },

    async getAvailabilityTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = availabilityVetParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const template = await availabilityService.getTemplateForVet(
        request.user.activeClinicId,
        params.data.vetId,
      );

      return reply.status(200).send({ data: template });
    },

    async putAvailabilityTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = availabilityVetParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = upsertAvailabilityTemplateBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      // D-30: the URL-nested vetId is authoritative over whatever `vetId` the
      // body also carries (the shared validator requires one so it can be
      // used standalone elsewhere) -- never trust the body for identity that
      // the route path already pins down.
      //
      // `result` is `{ template, affectedAppointmentCount }` -- returned
      // WHOLE, never destructured to just `template`, so the client gets the
      // same "n appointments already booked" count the override endpoint
      // already surfaces (D-30).
      const result = await availabilityService.replaceWeeklyTemplate({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        vetId: params.data.vetId,
        days: body.data.days,
      });

      return reply.status(200).send({ data: result });
    },

    async putAvailabilityOverrideHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = availabilityVetParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = upsertAvailabilityOverrideBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await availabilityService.upsertDateOverride({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        vetId: params.data.vetId,
        date: body.data.date,
        isClosed: body.data.isClosed,
        openMinutes: body.data.openMinutes,
        closeMinutes: body.data.closeMinutes,
        reason: body.data.reason,
      });

      return reply.status(200).send({ data: result });
    },

    async getBlockedPeriodsHandler(request: FastifyRequest, reply: FastifyReply) {
      const query = blockedPeriodsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const blockedPeriods = await availabilityService.getBlockedPeriods(
        request.user.activeClinicId,
        query.data.vetId,
        query.data.date,
      );

      return reply.status(200).send({ data: blockedPeriods });
    },

    async createBlockedPeriodHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = createBlockedPeriodBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      // `result` is `{ blockedPeriod, affectedAppointmentCount }` (D-30) --
      // returned WHOLE, matching the weekly-template and date-override
      // endpoints' identical shape.
      const result = await availabilityService.createBlockedPeriod({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        vetId: body.data.vetId,
        date: body.data.date,
        startMinutes: body.data.startMinutes,
        endMinutes: body.data.endMinutes,
        reason: body.data.reason,
        reasonText: body.data.reasonText,
      });

      return reply.status(201).send({ data: result });
    },

    async deleteBlockedPeriodHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = blockedPeriodParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      await availabilityService.removeBlockedPeriod({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        blockedPeriodId: params.data.blockedPeriodId,
      });

      return reply.status(200).send({ data: { deleted: true } });
    },

    async getResolvedAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
      const query = availabilityDateQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const clinicId = request.user.activeClinicId;
      const userId = request.user.id;

      // No vetId: resolve for every clinic vet in one call, which is what the
      // web week grid / calendar surfaces need to grey out non-working cells
      // across the whole clinic on one date.
      const vets = query.data.vetId
        ? [{ id: query.data.vetId, name: '' }]
        : await availabilityService.listVets(clinicId);

      const resolved = await Promise.all(
        vets.map(async (vet) => {
          const hours = await availabilityService.resolveAvailabilityForDate({
            clinicId,
            userId,
            vetId: vet.id,
            date: query.data.date,
          });
          const blockedRanges = await availabilityService.getBlockedRangesForDate(clinicId, vet.id, query.data.date);
          return { vetId: vet.id, hours, blockedRanges };
        }),
      );

      return reply.status(200).send({ data: resolved });
    },

    async listVetsHandler(request: FastifyRequest, reply: FastifyReply) {
      const vets = await availabilityService.listVets(request.user.activeClinicId);
      return reply.status(200).send({ data: vets });
    },
  };
}
