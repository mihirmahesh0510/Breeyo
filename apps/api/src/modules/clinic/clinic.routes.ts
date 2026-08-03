import type { FastifyInstance } from 'fastify';
import { ClinicService } from './clinic.service.js';
import { createClinicController } from './clinic.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { PermissionService } from '../auth/permission.service.js';

export default async function clinicRoutes(fastify: FastifyInstance) {
  const clinicService = new ClinicService(fastify.prisma);

  // Ensure permissionService is decorated for the authorize middleware
  if (!fastify.hasDecorator('permissionService')) {
    const permissionService = new PermissionService(fastify.prisma, fastify.redis);
    fastify.decorate('permissionService', permissionService);
  }

  const controller = createClinicController(clinicService);

  fastify.get('/clinics/current', {
    preHandler: [authenticate, tenantContext],
    handler: controller.getClinicHandler,
  });

  fastify.put('/clinics/current/profile', {
    preHandler: [authenticate, tenantContext, requirePermission('MANAGE_CLINIC_SETTINGS')],
    handler: controller.updateProfileHandler,
  });

  fastify.put('/clinics/current/hours', {
    preHandler: [authenticate, tenantContext, requirePermission('MANAGE_CLINIC_SETTINGS')],
    handler: controller.updateHoursHandler,
  });

  fastify.post('/clinics/current/wizard-complete', {
    preHandler: [authenticate, tenantContext],
    handler: controller.completeWizardHandler,
  });
}
