import type { FastifyRequest, FastifyReply } from 'fastify';
import type { EmrService } from './emr.service.js';
import type { ConsultationLockService } from './consultation-lock.service.js';
import {
  createConsultationSchema,
  saveDraftSchema,
  finalizeConsultationSchema,
  addendumSchema,
} from '@breeyo/validators';
import {
  consultationParamsSchema,
  petParamsSchema,
  historyQuerySchema,
  validateDosageBodySchema,
} from './emr.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export function createEmrController(
  emrService: EmrService,
  lockService: ConsultationLockService,
) {
  return {
    /**
     * POST /consultations — Create a new consultation.
     */
    async createHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = createConsultationSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const consultation = await emrService.createConsultation(
        request.user.activeClinicId,
        body.data.petId,
        request.user.id,
        (request as any).userName ?? 'Unknown',
        body.data,
      );

      return reply.status(201).send({ data: consultation });
    },

    /**
     * GET /consultations/:consultationId — Get full consultation.
     */
    async getConsultationHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const consultation = await emrService.getConsultation(
        params.data.consultationId,
        request.user.activeClinicId,
      );

      if (!consultation) {
        return reply.status(404).send({
          error: { code: 'CONSULTATION_NOT_FOUND', message: 'Consultation not found' },
        });
      }

      return reply.status(200).send({ data: consultation });
    },

    /**
     * GET /consultations/:consultationId/draft — Get draft data.
     */
    async getDraftHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      // Load draft through repository (service doesn't expose loadDraft directly,
      // but we can use getConsultation + check status)
      const consultation = await emrService.getConsultation(
        params.data.consultationId,
        request.user.activeClinicId,
      );

      if (!consultation) {
        return reply.status(404).send({
          error: { code: 'CONSULTATION_NOT_FOUND', message: 'Consultation not found' },
        });
      }

      return reply.status(200).send({ data: consultation });
    },

    /**
     * PATCH /consultations/:consultationId/draft — Save draft data.
     */
    async saveDraftHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = saveDraftSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      await emrService.saveDraft(
        params.data.consultationId,
        request.user.activeClinicId,
        request.user.id,
        body.data,
      );

      return reply.status(200).send({ data: { saved: true } });
    },

    /**
     * POST /consultations/:consultationId/finalize — Finalize consultation.
     */
    async finalizeHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = finalizeConsultationSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const consultation = await emrService.finalize(
        params.data.consultationId,
        request.user.activeClinicId,
        request.user.id,
        body.data,
      );

      return reply.status(200).send({ data: consultation });
    },

    /**
     * POST /consultations/:consultationId/addendum — Add addendum.
     */
    async addAddendumHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = addendumSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await emrService.addAddendum(
        params.data.consultationId,
        request.user.activeClinicId,
        request.user.id,
        (request as any).userName ?? 'Unknown',
        body.data.text,
      );

      return reply.status(200).send({ data: result });
    },

    /**
     * POST /consultations/:consultationId/heartbeat — Renew lock.
     */
    async heartbeatHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const ok = await emrService.heartbeat(
        params.data.consultationId,
        request.user.id,
      );

      return reply.status(200).send({ data: { renewed: ok } });
    },

    /**
     * GET /consultations/:consultationId/lock — Check lock status.
     */
    async checkLockHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const status = await lockService.isLocked(params.data.consultationId);

      return reply.status(200).send({ data: status });
    },

    /**
     * POST /consultations/validate-dosage — Validate prescription dosage.
     */
    async validateDosageHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = validateDosageBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      // Look up species dosage from the drug database
      const dosage = await request.server.prisma.speciesDosage.findFirst({
        where: { drugId: body.data.drugId, species: body.data.species },
      });

      if (!dosage) {
        return reply.status(200).send({ data: { warning: null, message: 'No dosage range available for this drug/species combination' } });
      }

      const warning = emrService.validatePrescriptionDosage(
        body.data.dosageMg,
        body.data.petWeightKg,
        {
          id: dosage.id,
          drugId: dosage.drugId,
          species: dosage.species,
          minDoseMgPerKg: Number(dosage.minDoseMgPerKg),
          maxDoseMgPerKg: Number(dosage.maxDoseMgPerKg),
          isFixedDose: dosage.isFixedDose,
          fixedDoseMin: dosage.fixedDoseMin ? Number(dosage.fixedDoseMin) : null,
          fixedDoseMax: dosage.fixedDoseMax ? Number(dosage.fixedDoseMax) : null,
          notes: dosage.notes,
        },
      );

      return reply.status(200).send({ data: { warning } });
    },

    /**
     * GET /pets/:petId/history — Get medical history timeline.
     */
    async getHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = petParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const query = historyQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const history = await emrService.getHistory(
        request.user.activeClinicId,
        params.data.petId,
        query.data.limit,
      );

      return reply.status(200).send({ data: history });
    },
  };
}
