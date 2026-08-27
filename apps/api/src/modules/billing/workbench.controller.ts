import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { BillingActor } from './invoice.repository.js';
import type { BillingWorkbenchService } from './billing-workbench.service.js';
import { invoiceParamsSchema } from './billing.schema.js';
import { collectPaymentBodySchema, webBillingWorkbenchQuerySchema, webRefundBodySchema, webVoidBodySchema } from './billing.schema.js';

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

/**
 * HTTP surface for the browser billing workbench (Plan 09-04, D-22, D-40,
 * D-42, D-43).
 *
 * `billing.routes.ts` still gates every one of these behind
 * `MANAGE_PAYMENTS` (D-05), same as the existing invoice/payment/refund
 * routes -- collect-payment is meant to be reachable by Front Desk. The
 * Admin-only half of D-22 is enforced one layer down, inside
 * `BillingWorkbenchService.refundInvoice`/`voidInvoice`, which is what turns
 * a Front Desk request into a 403 rather than this controller trying to
 * duplicate that role check.
 */
export function createWorkbenchController(
  buildService: (db: TenantPrismaClient) => BillingWorkbenchService,
) {
  return {
    /** GET /billing/web/workbench?knownVersion=... */
    async getWorkbenchHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const query = webBillingWorkbenchQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const data = await service.getWorkbench(
        request.user.activeClinicId,
        request.user.id,
        query.data.knownVersion,
      );

      return reply.status(200).send({ data });
    },

    /** POST /billing/web/invoices/:invoiceId/collect-payment -- D-05: Front Desk and Admin. */
    async collectPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = collectPaymentBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await service.collectPayment(
        request.user.activeClinicId,
        actorFor(request),
        params.data.invoiceId,
        body.data.amountPaise,
        body.data.expectedVersion,
      );

      return reply.status(200).send({ data: result });
    },

    /** POST /billing/web/invoices/:invoiceId/refund -- D-22: Admin-only, enforced in the service. */
    async refundHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = webRefundBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const { expectedVersion, ...refundInput } = body.data;
      const result = await service.refundInvoice(
        request.user.activeClinicId,
        request.user.id,
        actorFor(request),
        params.data.invoiceId,
        refundInput,
        expectedVersion,
      );

      return reply.status(201).send({ data: result });
    },

    /** POST /billing/web/invoices/:invoiceId/void -- D-22: Admin-only, enforced in the service. */
    async voidHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = webVoidBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const { expectedVersion, ...voidInput } = body.data;
      const result = await service.voidInvoice(
        request.user.activeClinicId,
        request.user.id,
        actorFor(request),
        params.data.invoiceId,
        voidInput,
        expectedVersion,
      );

      return reply.status(200).send({ data: result });
    },
  };
}
