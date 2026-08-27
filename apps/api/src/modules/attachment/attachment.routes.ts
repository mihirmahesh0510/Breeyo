import type { FastifyInstance } from 'fastify';
import { AttachmentService } from './attachment.service.js';
import { createAttachmentController } from './attachment.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { PermissionService } from '../auth/permission.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function attachmentRoutes(fastify: FastifyInstance) {
  // D-30: consultation_attachments is scoped through its parent consultation,
  // so it is only isolated when reached via the tenant handle.
  const buildService = (db: TenantPrismaClient) => new AttachmentService(db);

  const controller = createAttachmentController(buildService);

  // AC-3 (access-control audit): `auth.routes.ts`'s
  // `fastify.decorate('permissionService', ...)` never reaches this sibling
  // `app.register(...)` call -- Fastify's plugin encapsulation scopes it to
  // auth's own child context. Same wall every other module hits, resolved
  // the same way: re-decorate locally, guarded against clobbering.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  // AC-3: this module had zero permission checks -- attachments are
  // consultation-scoped clinical records, gated the same as `emr.routes.ts`
  // (VIEW_EMR to read, EDIT_EMR to upload/confirm/delete).
  const viewHandler = [authenticate, tenantContext, requirePermission('VIEW_EMR')];
  const editHandler = [authenticate, tenantContext, requirePermission('EDIT_EMR')];

  // POST /consultations/:consultationId/attachments — Generate upload URL
  fastify.post('/consultations/:consultationId/attachments', { preHandler: editHandler, handler: controller.generateUploadUrlHandler });

  // POST /consultations/:consultationId/attachments/:id/confirm — Confirm upload
  fastify.post('/consultations/:consultationId/attachments/:id/confirm', { preHandler: editHandler, handler: controller.confirmUploadHandler });

  // GET /consultations/:consultationId/attachments — List attachments
  fastify.get('/consultations/:consultationId/attachments', { preHandler: viewHandler, handler: controller.getAttachmentsHandler });

  // DELETE /consultations/:consultationId/attachments/:id — Delete attachment
  fastify.delete('/consultations/:consultationId/attachments/:id', { preHandler: editHandler, handler: controller.deleteAttachmentHandler });
}
