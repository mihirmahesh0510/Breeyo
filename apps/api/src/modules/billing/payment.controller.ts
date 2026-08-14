import type { FastifyRequest, FastifyReply } from 'fastify';
import { recordPaymentSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PaymentService } from './payment.service.js';
import type { BillingActor } from './invoice.repository.js';
import { invoiceParamsSchema, receiptParamsSchema } from './billing.schema.js';

/**
 * HTTP surface for payment collection (BIL-03, BIL-05).
 *
 * Same three conventions as `invoice.controller.ts`: `safeParse` never `.parse`,
 * the service is resolved from `request.db` as the first statement of every
 * handler (D-30), and domain errors propagate to `error-handler.ts` untouched.
 *
 * ## How a request picks its collection path
 *
 * `recordPaymentSchema` is shared with the mobile form and carries a `channel`
 * field defaulting to `'manual'`. This controller deliberately does **not**
 * route on it — it routes on `method`:
 *
 *   * `cash` — money in the drawer, recorded and settled immediately.
 *   * `upi` / `card` — a Razorpay Payment Link; nothing is settled until plan
 *     06-10's webhook confirms it.
 *
 * Routing on `channel` would make the default (`'manual'`) mean "record a
 * digital payment as already captured on the client's say-so", which is exactly
 * the T-06-50 tampering this phase is built to prevent. Manual attestation of a
 * digital payment has its own, narrower surface — `POST /billing/invoices/:id/mark-paid`
 * from plan 06-08 — which is separately gated and audited. Keeping the two
 * apart means a client cannot reach the attestation path by omitting a field.
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

export function createPaymentController(
  buildPaymentService: (db: TenantPrismaClient) => PaymentService,
) {
  return {
    /**
     * POST /billing/invoices/:invoiceId/payments — D-10 collection.
     *
     * Note what the client is NOT trusted with. It proposes an amount, and the
     * service bounds that amount by the invoice's own balance under a row lock;
     * it never supplies a balance, a total or a status.
     */
    async recordPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildPaymentService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = recordPaymentSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const clinicId = request.user.activeClinicId;
      const actor = actorFor(request);
      const { invoiceId } = params.data;

      if (body.data.mode === 'split') {
        const result = await service.recordSplitPayment(clinicId, invoiceId, actor, {
          totalPaise: body.data.totalPaise,
          cashAmountPaise: body.data.cashAmountPaise,
          digitalAmountPaise: body.data.digitalAmountPaise,
          digitalMethod: body.data.digitalMethod,
        });

        return reply.status(200).send({ data: result });
      }

      if (body.data.method === 'cash') {
        const result = await service.recordCashPayment(
          clinicId,
          invoiceId,
          actor,
          body.data.amountPaise,
        );

        return reply.status(200).send({ data: result });
      }

      const link = await service.createPaymentLink(clinicId, invoiceId, actor, {
        method: body.data.method,
        amountPaise: body.data.amountPaise,
      });

      // Only the four fields the payment sheet renders. The Razorpay response
      // itself never leaves the service (T-06-49).
      return reply.status(200).send({ data: link });
    },

    /**
     * POST /billing/invoices/:invoiceId/payments/retry — D-11 retry.
     */
    async retryPaymentLinkHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildPaymentService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const link = await service.retryPaymentLink(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
      );

      return reply.status(200).send({ data: link });
    },

    /**
     * POST /billing/invoices/:invoiceId/payments/mark-unpaid — D-11 fallback.
     *
     * Distinct from plan 06-08's `/mark-unpaid`, which reverses a manual
     * mark-paid. This one abandons an outstanding digital attempt: it cancels
     * the link at the gateway and cancels only the pending razorpay rows, so a
     * cash leg already collected survives and the invoice settles on
     * `PARTIALLY_PAID` rather than `UNPAID` (D-37).
     */
    async markUnpaidHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildPaymentService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const invoice = await service.markPaymentUnpaid(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
      );

      return reply.status(200).send({ data: invoice });
    },

    /**
     * GET /billing/invoices/:invoiceId/receipts/:receiptId — D-13 "View Receipt".
     *
     * Scoped to the caller's clinic in the service, so another clinic's receipt
     * id reads as absent (404) rather than forbidden (403); a 403 would confirm
     * that the receipt exists.
     */
    async getReceiptHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildPaymentService(request.db);

      const params = receiptParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const receipt = await service.getReceipt(
        request.user.activeClinicId,
        params.data.invoiceId,
        params.data.receiptId,
      );

      return reply.status(200).send({ data: receipt });
    },
  };
}
