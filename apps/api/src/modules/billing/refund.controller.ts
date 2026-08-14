import type { FastifyRequest, FastifyReply } from 'fastify';
import { refundInputSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { RefundService } from './refund.service.js';
import type { BillingActor } from './invoice.repository.js';
import { invoiceParamsSchema } from './billing.schema.js';

/**
 * HTTP surface for refunds (BIL-03, D-12, D-42).
 *
 * Same three conventions as `payment.controller.ts`: `safeParse` never
 * `.parse`, the service is resolved from `request.db` as the first statement of
 * every handler (D-30), and domain errors propagate to `error-handler.ts`
 * untouched.
 *
 * ## What the client is not trusted with
 *
 * It proposes an amount and, optionally, which leg to take it from. It never
 * supplies a refundable figure, a balance or a status. `refundInputSchema` here
 * is the base shape only — the bound lives in the service, evaluated under the
 * invoice row lock, because a limit checked at parse time is a limit that was
 * already stale by the time the write happened (ASVS V11).
 *
 * `GET /refundable` exists so the mobile sheet can render the UI-SPEC's
 * "Maximum: Rs [paid_amount]" caption without the client deriving a money
 * figure of its own.
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

export function createRefundController(
  buildRefundService: (db: TenantPrismaClient) => RefundService,
) {
  return {
    /**
     * POST /billing/invoices/:invoiceId/refunds — issue a refund (D-12, D-42).
     *
     * 201: refund records are new documents, like a credit note, even though
     * the digital ones are not yet settled.
     */
    async createRefundHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildRefundService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = refundInputSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await service.createRefund(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
        body.data,
      );

      return reply.status(201).send({ data: result });
    },

    /** GET /billing/invoices/:invoiceId/refunds — the payment history section. */
    async listRefundsHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildRefundService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const refunds = await service.listRefunds(
        request.user.activeClinicId,
        params.data.invoiceId,
      );

      return reply.status(200).send({ data: refunds });
    },

    /**
     * GET /billing/invoices/:invoiceId/refundable — the sheet's maximum.
     *
     * Advisory, not a reservation: the service recomputes it under the row lock
     * when the refund is actually issued.
     */
    async getRefundableHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildRefundService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const summary = await service.getRefundableSummary(
        request.user.activeClinicId,
        params.data.invoiceId,
      );

      return reply.status(200).send({ data: summary });
    },
  };
}
