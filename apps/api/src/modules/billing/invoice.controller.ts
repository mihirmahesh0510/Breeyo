import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  createInvoiceSchema,
  finalizeInvoiceSchema,
  updateDraftInvoiceSchema,
  voidInvoiceSchema,
} from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { InvoiceService } from './invoice.service.js';
import type { BillingActor, InvoiceListQuery } from './invoice.repository.js';
import {
  consultationParamsSchema,
  invoiceListQuerySchema,
  invoiceParamsSchema,
  markPaidBodySchema,
  petParamsSchema,
  previewTotalsBodySchema,
} from './billing.schema.js';

/**
 * HTTP surface for the invoice domain (BIL-01, BIL-02, BIL-03, BIL-07).
 *
 * Three conventions, all inherited from `emr.controller.ts`:
 *
 *  1. **`safeParse`, never `.parse`.** A malformed request must become a 400,
 *     not a thrown exception the error handler has to guess at.
 *  2. **Every handler resolves its service from `request.db` as its first
 *     statement** (D-30, plan 06-02). The Prisma handle is the request's tenant-scoped,
 *     RLS-bound client; a plugin-scope client shared across clinics would defeat
 *     the isolation the whole billing module depends on.
 *  3. **Domain errors propagate.** `invoice.service.ts` throws ordinary Errors
 *     carrying `statusCode` and `code`, and `middleware/error-handler.ts` maps
 *     them. Catching and rebuilding responses here would fork that mapping.
 *
 * The one error worth calling out is BIL-02's `INSUFFICIENT_STOCK`. It is raised
 * at 409 with a `details.shortfalls` payload, and `error-handler.ts` forwards
 * `details` for any status below 500 — statuses at or above 500 have their
 * message replaced wholesale, which would discard the per-item shortfall list
 * the mobile StockValidationBanner renders. Nothing here special-cases it; the
 * status is what makes it work.
 */

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

/** `request.user` carries no display name; the audit trail wants one. */
function actorFor(request: FastifyRequest): BillingActor {
  return {
    userId: request.user.id,
    userName: (request as { userName?: string }).userName ?? 'Unknown',
  };
}

export function createInvoiceController(
  buildService: (db: TenantPrismaClient) => InvoiceService,
) {
  return {
    /**
     * POST /billing/invoices — the interactive D-01/D-06 builder path.
     */
    async createHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const body = createInvoiceSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const invoice = await service.createDraft(
        request.user.activeClinicId,
        actorFor(request),
        body.data,
      );

      return reply.status(201).send({ data: invoice });
    },

    /**
     * POST /billing/invoices/from-consultation/:consultationId — the D-06
     * "Front Desk pulls from completed visits" picker.
     *
     * **This is one of two distinct authorization surfaces onto the same service
     * method, and conflating them is the D-03/D-05 trap.** This HTTP endpoint is
     * a Front Desk action and IS gated on `CREATE_INVOICES` in
     * `billing.routes.ts`. The other surface is the internal
     * `InvoiceService.createDraftFromConsultation` call made by
     * `EmrService.finalizeConsultation` when a Clinician ends a consultation
     * (wired in plan 06-12); that path has no HTTP route and no permission check
     * at all, because D-03 requires the draft to appear for the front desk even
     * though a Clinician — who under D-05 holds no billing authority — triggered
     * it. Gating the service method itself would break the phase's primary
     * invoice-creation flow.
     */
    async createDraftFromConsultationHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const invoice = await service.createDraftFromConsultation(
        request.user.activeClinicId,
        params.data.consultationId,
        actorFor(request),
      );

      return reply.status(201).send({ data: invoice });
    },

    /**
     * GET /billing/invoices/:invoiceId — the full D-14/D-18 detail payload.
     */
    async getHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      // Scoped to the caller's clinic inside the repository, so a leaked id from
      // another clinic reads as absent (404) rather than forbidden (403) — a 403
      // would confirm the invoice exists.
      const invoice = await service.getDetail(
        request.user.activeClinicId,
        params.data.invoiceId,
      );

      return reply.status(200).send({ data: invoice });
    },

    /**
     * GET /billing/invoices — the D-24 dashboard list.
     */
    async listHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const query = invoiceListQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      // The wire carries ISO strings; the repository filters on Dates.
      const listQuery: InvoiceListQuery = {
        status: query.data.status,
        sort: query.data.sort,
        limit: query.data.limit,
        ...(query.data.search ? { search: query.data.search } : {}),
        ...(query.data.petId ? { petId: query.data.petId } : {}),
        ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
        ...(query.data.from ? { from: new Date(query.data.from) } : {}),
        ...(query.data.to ? { to: new Date(query.data.to) } : {}),
      };

      const result = await service.list(request.user.activeClinicId, listQuery);

      return reply.status(200).send({ data: result });
    },

    /**
     * GET /billing/pets/:petId/invoices — D-25, the pet profile Invoices tab.
     */
    async listForPetHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = petParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const result = await service.listForPet(
        request.user.activeClinicId,
        params.data.petId,
      );

      return reply.status(200).send({ data: result });
    },

    /**
     * PATCH /billing/invoices/:invoiceId — edit a DRAFT.
     *
     * D-21: a finalized invoice is immutable. The service surfaces that as a 409
     * `INVOICE_NOT_DRAFT`, and the guard is in the repository's WHERE clause, so
     * an invoice that finalized between the read and this write is still
     * rejected.
     */
    async updateDraftHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = updateDraftInvoiceSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const invoice = await service.updateDraft(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
        body.data,
      );

      return reply.status(200).send({ data: invoice });
    },

    /**
     * DELETE /billing/invoices/:invoiceId — discard a DRAFT (D-21).
     */
    async deleteDraftHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const result = await service.deleteDraft(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
      );

      return reply.status(200).send({ data: result });
    },

    /**
     * POST /billing/invoices/preview-totals — the live GST breakdown.
     *
     * Display only. Nothing is persisted, and finalize recomputes from the
     * persisted line items rather than trusting anything returned here.
     */
    async previewTotalsHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const body = previewTotalsBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const breakdown = await service.previewTotals(
        request.user.activeClinicId,
        body.data.invoiceId,
      );

      return reply.status(200).send({ data: breakdown });
    },

    /**
     * POST /billing/invoices/:invoiceId/finalize — BIL-02 and BIL-07.
     *
     * On insufficient stock this returns 409 `INSUFFICIENT_STOCK` carrying
     * `details.shortfalls`, having written nothing.
     */
    async finalizeHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = finalizeInvoiceSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const invoice = await service.finalize(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
        body.data,
      );

      return reply.status(200).send({ data: invoice });
    },

    /**
     * POST /billing/invoices/:invoiceId/void — D-21, D-26, D-34, D-35.
     *
     * D-35: `cancelledPaymentLinkIds` is forwarded to the client rather than
     * dropped. The void marks the local payment rows cancelled, but the
     * corresponding Razorpay links are still live at the gateway — no Razorpay
     * client exists until plan 06-09, so this response is currently the only
     * record of which links still need cancelling. Discarding it here would lose
     * that information entirely and leave a payable link pointing at a voided
     * invoice.
     */
    async voidHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = voidInvoiceSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await service.voidInvoice(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
        body.data,
      );

      const data = {
        invoice: result.invoice,
        restoredMovementCount: result.restoredMovementCount,
        cancelledPaymentLinkIds: result.cancelledPaymentLinkIds,
      };

      return reply.status(200).send({ data });
    },

    /**
     * POST /billing/invoices/:invoiceId/mark-paid — the D-10 cash control.
     */
    async markPaidHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = markPaidBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const invoice = await service.markPaid(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
        body.data,
      );

      return reply.status(200).send({ data: invoice });
    },

    /**
     * POST /billing/invoices/:invoiceId/mark-unpaid — reverses a manual
     * mark-paid. D-37: a PARTIALLY_PAID invoice backed by a real cash leg has no
     * legal transition back to UNPAID, and the service consults the shared
     * transition table rather than forcing the status.
     */
    async markUnpaidHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = invoiceParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const invoice = await service.markUnpaid(
        request.user.activeClinicId,
        params.data.invoiceId,
        actorFor(request),
      );

      return reply.status(200).send({ data: invoice });
    },
  };
}
