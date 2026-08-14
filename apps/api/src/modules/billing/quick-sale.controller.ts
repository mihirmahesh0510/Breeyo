import type { FastifyRequest, FastifyReply } from 'fastify';
import { quickSaleSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { QuickSaleService } from './quick-sale.service.js';
import type { BillingActor } from './invoice.repository.js';

/**
 * HTTP surface for D-04 Quick Sale.
 *
 * Same three conventions as `invoice.controller.ts`: resolve the service from
 * `request.db` first (D-30), `safeParse` rather than `.parse`, and let domain
 * errors propagate to `middleware/error-handler.ts` rather than rebuilding
 * responses here. `INSUFFICIENT_STOCK` reaches the client as a 409 carrying
 * `details.shortfalls` purely because of that status — anything at or above 500
 * has its message replaced wholesale, which would discard the per-item list the
 * mobile StockValidationBanner renders.
 */

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

function actorFor(request: FastifyRequest): BillingActor {
  return {
    userId: request.user.id,
    userName: (request as { userName?: string }).userName ?? 'Unknown',
  };
}

export function createQuickSaleController(
  buildQuickSaleService: (db: TenantPrismaClient) => QuickSaleService,
) {
  return {
    /**
     * POST /billing/quick-sale — create and finalize in one tap (D-04).
     *
     * 201 because the request creates an invoice. That it is also finalized is
     * the point of the endpoint, not a second resource.
     */
    async createHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildQuickSaleService(request.db);

      const body = quickSaleSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const invoice = await service.createAndFinalize(
        request.user.activeClinicId,
        actorFor(request),
        body.data,
      );

      return reply.status(201).send({ data: invoice });
    },
  };
}
