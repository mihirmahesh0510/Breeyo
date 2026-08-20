import type { FastifyRequest, FastifyReply } from 'fastify';
import type { QueueStatus } from '@breeyo/types';
import type { WebQueueService } from './web-queue.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  statusUpdateBodySchema,
  webQueueBoardQuerySchema,
  webQueueEntryParamsSchema,
} from './queue.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

/**
 * HTTP surface for the browser queue workbench (Plan 09-04, D-07, D-40,
 * D-41, D-43). D-30: every handler resolves `buildService(request.db)`
 * first, matching `QueueController`'s own convention in this module.
 */
export function createWebQueueController(
  buildService: (db: TenantPrismaClient) => WebQueueService,
) {
  return {
    /** GET /queue/web/board?knownVersion=... */
    async getBoardHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const query = webQueueBoardQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const board = await service.getBoard(
        request.user.activeClinicId,
        request.user.id,
        query.data.knownVersion,
      );

      return reply.status(200).send({ data: board });
    },

    /** POST /queue/web/entries/:queueEntryId/status */
    async updateEntryStatusHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const params = webQueueEntryParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = statusUpdateBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const entry = await service.updateEntryStatus(
        request.user.activeClinicId,
        request.user.id,
        params.data.queueEntryId,
        body.data.status as QueueStatus,
      );

      return reply.status(200).send({ data: entry });
    },
  };
}
