import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { PortalReceiptService } from './portal-receipt.service.js';

const receiptParamsSchema = z.object({ token: z.string(), invoiceId: z.string().uuid() });

/**
 * `GET /api/v1/owner-portal/:token/invoices/:invoiceId/receipt` (D-71,
 * finding 9.3). Behind `requirePortalScope` — only reached for a `READY`
 * link, exactly like every other read route in this module.
 *
 * `invoiceId` is re-checked against `request.portalScope.allowedInvoiceIds`
 * inside `PortalReceiptService` — never trusted directly off the URL
 * (T-09-14) — and an out-of-scope id collapses to the same `INVALID`
 * no-data envelope every other scope mismatch does, not a 404 that would
 * confirm the invoice exists under a different owner's link.
 */
export function createReceiptController(
  buildPortalReceiptService: (db: TenantPrismaClient) => PortalReceiptService,
) {
  return {
    async getReceiptHandler(request: FastifyRequest, reply: FastifyReply) {
      const scope = request.portalScope;
      const db = request.portalDb;
      if (!scope || !db) {
        return reply.status(403).send({ state: 'INVALID' });
      }

      const params = receiptParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: params.error.errors.map((e) => e.message).join(', ') },
        });
      }

      const service = buildPortalReceiptService(db);
      const result = await service.getReceipt(scope, params.data.invoiceId);

      if (result.status === 'OUT_OF_SCOPE') {
        return reply.status(403).send({ state: 'INVALID' });
      }
      if (result.status === 'NOT_FOUND') {
        return reply.status(404).send({
          error: { code: 'RECEIPT_NOT_FOUND', message: 'No receipt found for this invoice yet' },
        });
      }

      return reply.status(200).send({ data: result.receipt });
    },
  };
}
