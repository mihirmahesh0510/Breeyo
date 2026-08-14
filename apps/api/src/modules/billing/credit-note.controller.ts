import type { FastifyRequest, FastifyReply } from 'fastify';
import { creditNoteSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { CreditNoteService } from './credit-note.service.js';
import type { BillingActor } from './invoice.repository.js';
import { invoiceParamsSchema, creditNoteParamsSchema } from './billing.schema.js';

/**
 * HTTP surface for credit notes (BIL-07, D-19, D-22).
 *
 * Same conventions as `payment.controller.ts` and `refund.controller.ts`:
 * `safeParse`, the service built from `request.db` first thing (D-30), and
 * domain errors left to `error-handler.ts`.
 *
 * The body is parsed here AND again in the service. That is deliberate rather
 * than redundant: `CreditNoteService.issueCreditNote` is also reachable from
 * inside the API (the D-22 flow that follows a return-to-stock), and a bound
 * that only exists on the HTTP edge is a bound the second caller does not have.
 * Parsing here simply turns a malformed body into a 400 before a transaction is
 * opened for it.
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

export function createCreditNoteController(
  buildCreditNoteService: (db: TenantPrismaClient) => CreditNoteService,
) {
  return {
    /** POST /billing/invoices/:invoiceId/credit-notes — issue one (D-22). */
    async issueCreditNoteHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildCreditNoteService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = creditNoteSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const creditNote = await service.issueCreditNote(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
        body.data,
      );

      return reply.status(201).send({ data: creditNote });
    },

    /** GET /billing/invoices/:invoiceId/credit-notes — "Linked Credit Notes". */
    async listCreditNotesHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildCreditNoteService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const creditNotes = await service.listCreditNotesForInvoice(
        request.user.activeClinicId,
        params.data.invoiceId,
      );

      return reply.status(200).send({ data: creditNotes });
    },

    /**
     * GET /billing/credit-notes/:creditNoteId — the detail view and the PDF.
     *
     * Scoped to the caller's clinic in the service, so another clinic's id
     * reads as absent (404) rather than forbidden (403); a 403 would confirm
     * that the credit note exists.
     */
    async getCreditNoteHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildCreditNoteService(request.db);

      const params = creditNoteParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const creditNote = await service.getCreditNote(
        request.user.activeClinicId,
        params.data.creditNoteId,
      );

      return reply.status(200).send({ data: creditNote });
    },
  };
}
