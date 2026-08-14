/**
 * WHA-05 / D-20 — factory-style controller (matching `emr.controller.ts:19-52`,
 * not the class-style `VaccinationController`): `createWhatsAppController(deps)`
 * returns an object of handlers, each validating its own input with a local
 * `.safeParse()` and the shared `validationError()` helper.
 *
 * `clinicId` is read ONLY from `request.user.activeClinicId`, and the actor
 * user id ONLY from `request.user.id` — never from the request body
 * (T-07-12-01). This is the single most important invariant in this file:
 * a client that supplied its own `clinicId` in `POST /whatsapp/send`'s body
 * must have it silently ignored, not honored.
 *
 * Handlers added here: `listThreadsHandler`, `getThreadHandler`,
 * `sendTemplateHandler`, `retryMessageHandler`. The remaining action
 * handlers (owner preference, consent, clinic config, booking move/cancel,
 * mark resolved) are added in 07-13 to this same file.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { InboxService } from './inbox.service.js';
import type { WhatsAppService } from './whatsapp.service.js';
import {
  threadParamsSchema,
  messageParamsSchema,
  sendTemplateSchema,
  inboxQuerySchema,
  threadQuerySchema,
} from './whatsapp.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export interface WhatsAppControllerDeps {
  inboxService: InboxService;
  whatsAppService: WhatsAppService;
}

export function createWhatsAppController(deps: WhatsAppControllerDeps) {
  return {
    /**
     * GET /whatsapp/threads — the inbox thread list (UI-SPEC's six filter
     * chips, five-field search, cursor pagination capped at 50).
     */
    async listThreadsHandler(request: FastifyRequest, reply: FastifyReply) {
      const query = inboxQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const inbox = await deps.inboxService.listThreads(
        request.user.activeClinicId,
        query.data,
      );

      return reply.status(200).send({ data: inbox });
    },

    /**
     * GET /whatsapp/threads/:threadId — a single thread's detail, with its
     * messages in ascending order. Marks the thread read as a side effect.
     */
    async getThreadHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = threadParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      // Accepted but unused beyond validation in this plan — message-history
      // pagination inside a single thread is not yet wired to the service;
      // parsing it here keeps `?limit=`/`?cursor=` from reaching the service
      // as unvalidated input if a later plan adds it.
      const query = threadQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const thread = await deps.inboxService.getThread(
        request.user.activeClinicId,
        params.data.threadId,
      );

      return reply.status(200).send({ data: thread });
    },

    /**
     * POST /whatsapp/send — persist-then-dispatch a template send
     * (WhatsAppService.sendTemplate). `202` with `{ data: { messageId } }`
     * matches UI-SPEC's "Message queued" toast: the row is persisted, the
     * provider call is asynchronous.
     */
    async sendTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = sendTemplateSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const result = await deps.whatsAppService.sendTemplate(body.data, {
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
      });

      return reply.status(202).send({ data: result });
    },

    /**
     * POST /whatsapp/messages/:messageId/retry — creates a NEW message row
     * from a FAILED one (`WhatsAppService.retryMessage`), leaving the
     * original untouched.
     */
    async retryMessageHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = messageParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const result = await deps.whatsAppService.retryMessage(
        request.user.activeClinicId,
        params.data.messageId,
        { clinicId: request.user.activeClinicId, userId: request.user.id },
      );

      return reply.status(202).send({ data: result });
    },
  };
}

export type WhatsAppController = ReturnType<typeof createWhatsAppController>;
