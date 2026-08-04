import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { DrugService } from './drug.service.js';

const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const drugParamsSchema = z.object({
  drugId: z.string().min(1),
});

const dosageParamsSchema = z.object({
  drugId: z.string().min(1),
  species: z.string().min(1),
});

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export function createDrugController(drugService: DrugService) {
  return {
    async getAllDrugsHandler(request: FastifyRequest, reply: FastifyReply) {
      const drugs = await drugService.getAllDrugs();
      return reply.status(200).send({ data: drugs });
    },

    async searchDrugsHandler(request: FastifyRequest, reply: FastifyReply) {
      const query = searchQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const drugs = await drugService.searchDrugs(query.data.q, query.data.limit);
      return reply.status(200).send({ data: drugs });
    },

    async getDosageRangeHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = dosageParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const drug = await drugService.getDosageRange(params.data.drugId, params.data.species);
      if (!drug) {
        return reply.status(404).send({
          error: { code: 'DRUG_NOT_FOUND', message: 'Drug not found' },
        });
      }

      return reply.status(200).send({ data: drug });
    },
  };
}
