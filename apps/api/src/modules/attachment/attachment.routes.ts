import type { FastifyInstance } from 'fastify';
import { AttachmentService } from './attachment.service.js';
import { createAttachmentController } from './attachment.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function attachmentRoutes(fastify: FastifyInstance) {
  const service = new AttachmentService(fastify.prisma);
  const controller = createAttachmentController(service);

  const preHandler = [authenticate, tenantContext];

  // POST /consultations/:consultationId/attachments — Generate upload URL
  fastify.post('/consultations/:consultationId/attachments', { preHandler, handler: controller.generateUploadUrlHandler });

  // POST /consultations/:consultationId/attachments/:id/confirm — Confirm upload
  fastify.post('/consultations/:consultationId/attachments/:id/confirm', { preHandler, handler: controller.confirmUploadHandler });

  // GET /consultations/:consultationId/attachments — List attachments
  fastify.get('/consultations/:consultationId/attachments', { preHandler, handler: controller.getAttachmentsHandler });

  // DELETE /consultations/:consultationId/attachments/:id — Delete attachment
  fastify.delete('/consultations/:consultationId/attachments/:id', { preHandler, handler: controller.deleteAttachmentHandler });
}
