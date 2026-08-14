import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ClinicService } from './clinic.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  clinicProfileUpdateSchema,
  workingHoursBodySchema,
} from './clinic.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export function createClinicController(
  buildService: (db: TenantPrismaClient) => ClinicService,
) {
  return {
    async getClinicHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicService = buildService(request.db);
      const clinic = await clinicService.getClinic(request.user.activeClinicId);
      return reply.status(200).send({ data: clinic });
    },

    async updateProfileHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicService = buildService(request.db);
      const result = clinicProfileUpdateSchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const clinic = await clinicService.updateProfile(
        request.user.activeClinicId,
        result.data,
      );

      return reply.status(200).send({ data: clinic });
    },

    async updateHoursHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicService = buildService(request.db);
      const result = workingHoursBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const clinic = await clinicService.updateWorkingHours(
        request.user.activeClinicId,
        result.data.hours,
      );

      return reply.status(200).send({ data: clinic });
    },

    async completeWizardHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicService = buildService(request.db);
      const clinic = await clinicService.completeWizard(
        request.user.activeClinicId,
      );

      return reply.status(200).send({ data: clinic });
    },
  };
}
