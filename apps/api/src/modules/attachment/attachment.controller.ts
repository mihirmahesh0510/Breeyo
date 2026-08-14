import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AttachmentService } from './attachment.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

const consultationParamsSchema = z.object({ consultationId: z.string().min(1) });
const attachmentParamsSchema = z.object({ consultationId: z.string().min(1), id: z.string().min(1) });

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: { code: 'VALIDATION_ERROR', message: issues.map((i) => i.message).join(', ') },
  });
}

/**
 * D-30: takes a factory rather than a prebuilt service, so every handler
 * resolves its Prisma handle from `request.db` (the tenant-scoped, RLS-bound
 * client) instead of sharing a plugin-scope admin client across all clinics.
 */
export function createAttachmentController(
  buildService: (db: TenantPrismaClient) => AttachmentService,
) {
  return {
    async generateUploadUrlHandler(request: FastifyRequest, reply: FastifyReply) {
      const attachmentService = buildService(request.db);

      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      const result = await attachmentService.generateUploadUrl(
        params.data.consultationId,
        request.user.activeClinicId,
        request.user.id,
        request.body,
      );

      return reply.status(201).send({ data: result });
    },

    async confirmUploadHandler(request: FastifyRequest, reply: FastifyReply) {
      const attachmentService = buildService(request.db);

      const params = attachmentParamsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      const attachment = await attachmentService.confirmUpload(
        params.data.id,
        request.user.activeClinicId,
        request.user.id,
      );

      return reply.status(200).send({ data: attachment });
    },

    async getAttachmentsHandler(request: FastifyRequest, reply: FastifyReply) {
      const attachmentService = buildService(request.db);

      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      const attachments = await attachmentService.getAttachments(params.data.consultationId);
      return reply.status(200).send({ data: attachments });
    },

    async deleteAttachmentHandler(request: FastifyRequest, reply: FastifyReply) {
      const attachmentService = buildService(request.db);

      const params = attachmentParamsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      await attachmentService.deleteAttachment(params.data.id, request.user.activeClinicId, request.user.id);
      return reply.status(200).send({ data: { deleted: true } });
    },
  };
}
