import type { FastifyRequest, FastifyReply } from 'fastify';
import { billingSettingsSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { BillingSettingsService } from './settings.service.js';

/**
 * HTTP surface for D-29 billing settings.
 *
 * Same conventions as `invoice.controller.ts` — `safeParse`, service resolved
 * from `request.db` first, domain errors left to propagate.
 *
 * Nothing here logs the request body. It carries a live Razorpay secret on the
 * write path, and a single `request.log.info({ body })` added later would put
 * that secret into a retained log stream (ASVS V7).
 */

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export function createBillingSettingsController(
  buildService: (db: TenantPrismaClient) => BillingSettingsService,
) {
  return {
    /** GET /billing/settings */
    async getHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const data = await service.getSettings(request.user.activeClinicId);

      return reply.status(200).send({ data });
    },

    /** PUT /billing/settings */
    async updateHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const body = billingSettingsSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      // The keys the client actually sent, read off the RAW body rather than
      // the parsed result. Zod materialises `.default()` values for absent
      // fields, so the parsed object cannot distinguish "gstEnabled: false,
      // because the Admin turned it off" from "gstEnabled absent, so Zod
      // supplied the default" — and writing the latter back would switch GST
      // off for a registered clinic that only meant to edit its footer text.
      const providedFields = new Set(
        Object.keys((request.body ?? {}) as Record<string, unknown>),
      );

      const data = await service.updateSettings(
        request.user.activeClinicId,
        request.user.id,
        body.data,
        providedFields,
      );

      return reply.status(200).send({ data });
    },

    /** POST /billing/settings/webhook-token/rotate */
    async rotateWebhookTokenHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const data = await service.rotateWebhookToken(
        request.user.activeClinicId,
        request.user.id,
      );

      return reply.status(200).send({ data });
    },
  };
}
