import type { FastifyRequest, FastifyReply } from 'fastify';
import type { QueueService } from './queue.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  checkInBodySchema,
  statusUpdateBodySchema,
  entryParamsSchema,
  queueBoardQuerySchema,
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
 * D-30: takes a factory rather than a prebuilt service, so every handler
 * resolves its Prisma handle from `request.db` (the tenant-scoped, RLS-bound
 * client) instead of sharing a plugin-scope admin client across all clinics.
 */
export function createQueueController(
  buildService: (db: TenantPrismaClient) => QueueService,
) {
  return {
    async checkInHandler(request: FastifyRequest, reply: FastifyReply) {
      const queueService = buildService(request.db);

      const body = checkInBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const entry = await queueService.checkIn({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        petId: body.data.petId,
        visitReason: body.data.visitReason,
        isEmergency: body.data.isEmergency,
        reCheckIn: body.data.reCheckIn,
      });

      return reply.status(201).send({ data: entry });
    },

    async updateStatusHandler(request: FastifyRequest, reply: FastifyReply) {
      const queueService = buildService(request.db);

      const params = entryParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = statusUpdateBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const entry = await queueService.updateStatus({
        clinicId: request.user.activeClinicId,
        entryId: params.data.entryId,
        status: body.data.status as any,
        userId: request.user.id,
      });

      return reply.status(200).send({ data: entry });
    },

    async callNextHandler(request: FastifyRequest, reply: FastifyReply) {
      const queueService = buildService(request.db);

      const entry = await queueService.callNext({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
      });

      return reply.status(200).send({ data: entry });
    },

    async getQueueBoardHandler(request: FastifyRequest, reply: FastifyReply) {
      const queueService = buildService(request.db);

      const query = queueBoardQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const board = await queueService.getQueueBoard({
        clinicId: request.user.activeClinicId,
        date: query.data.date,
      });

      return reply.status(200).send({ data: board });
    },

    async archiveEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
      const queueService = buildService(request.db);

      const result = await queueService.archiveOldEntries(request.user.activeClinicId);

      return reply.status(200).send({ data: { archivedCount: result.count } });
    },
  };
}
