import type { FastifyInstance } from 'fastify';
import { ClinicService } from './clinic.service.js';
import { createClinicController } from './clinic.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { PermissionService } from '../auth/permission.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function clinicRoutes(fastify: FastifyInstance) {
  // D-30: built per request from `request.db`, the tenant-scoped handle
  // `tenantContext` installs, rather than once at plugin scope from the
  // breeyo_admin client, which bypasses RLS by design.
  const buildService = (db: TenantPrismaClient) => new ClinicService(db);

  // Ensure permissionService is decorated for the authorize middleware.
  //
  // Admin client by design: runs before tenantContext (D-30 exemption).
  // Permission resolution reads `users`, `roles`, `permissions` and
  // `clinic_member_roles` — global reference tables plan 06-00 deliberately
  // left without RLS policies — and it executes during `authenticate`, before
  // `tenantContext` has set `request.db`. Moving it onto the tenant handle
  // breaks login.
  if (!fastify.hasDecorator('permissionService')) {
    const permissionService = new PermissionService(fastify.prisma, fastify.redis);
    fastify.decorate('permissionService', permissionService);
  }

  const controller = createClinicController(buildService);

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
