import type { FastifyRequest, FastifyReply } from 'fastify';
import type { QueueService } from './queue.service.js';
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

export function createQueueController(queueService: QueueService) {
  return {
    async checkInHandler(request: FastifyRequest, reply: FastifyReply) {
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
      const entry = await queueService.callNext({
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
      });

      return reply.status(200).send({ data: entry });
    },

    async getQueueBoardHandler(request: FastifyRequest, reply: FastifyReply) {
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

    async archiveEntriesHandler(_request: FastifyRequest, reply: FastifyReply) {
      const result = await queueService.archiveOldEntries();

      return reply.status(200).send({ data: { archivedCount: result.count } });
    },
  };
}
