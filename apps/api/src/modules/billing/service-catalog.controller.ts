import type { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCatalogSchema, serviceCatalogUpdateSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { ServiceCatalogService } from './service-catalog.service.js';
import { serviceCatalogParamsSchema, serviceCatalogQuerySchema } from './billing.schema.js';

/**
 * HTTP surface for the D-02 service catalog.
 *
 * Same three conventions as `invoice.controller.ts`: `safeParse` rather than
 * `.parse` so a malformed body is a 400 and not a thrown exception; the service
 * is resolved from `request.db` as the first statement of every handler (D-30);
 * and domain errors — `SERVICE_NOT_FOUND`, `CANNOT_MODIFY_PRESET` — propagate to
 * `middleware/error-handler.ts` rather than being caught and re-rendered here.
 */

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export function createServiceCatalogController(
  buildService: (db: TenantPrismaClient) => ServiceCatalogService,
) {
  return {
    /** GET /billing/services */
    async listHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const data = await service.list(request.user.activeClinicId);

      return reply.status(200).send({ data });
    },

    /** GET /billing/services/search?q= */
    async searchHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const query = serviceCatalogQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const data = await service.search(
        request.user.activeClinicId,
        query.data.q,
        query.data.limit,
      );

      return reply.status(200).send({ data });
    },

    /** GET /billing/services/:serviceId */
    async getHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = serviceCatalogParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const data = await service.get(request.user.activeClinicId, params.data.serviceId);

      return reply.status(200).send({ data });
    },

    /** POST /billing/services */
    async createHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const body = serviceCatalogSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const data = await service.create(request.user.activeClinicId, body.data);

      return reply.status(201).send({ data });
    },

    /** PATCH /billing/services/:serviceId */
    async updateHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = serviceCatalogParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = serviceCatalogUpdateSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const data = await service.update(
        request.user.activeClinicId,
        params.data.serviceId,
        body.data,
      );

      return reply.status(200).send({ data });
    },

    /**
     * POST /billing/services/:serviceId/deactivate
     *
     * A POST to a named sub-resource rather than a DELETE, because the row is
     * not deleted: a finalized invoice line still points at it. The verb
     * matching the effect keeps the soft-delete contract visible at the route
     * table.
     */
    async deactivateHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = serviceCatalogParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const data = await service.deactivate(
        request.user.activeClinicId,
        params.data.serviceId,
      );

      return reply.status(200).send({ data });
    },
  };
}
