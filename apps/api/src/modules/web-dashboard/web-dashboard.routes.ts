import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { PermissionService } from '../auth/permission.service.js';
import { AccessPolicyService } from './access-policy.service.js';
import { CockpitService } from './cockpit.service.js';
import { PreferencesService } from './preferences.service.js';
import { createAccessPolicyController } from './access-policy.controller.js';
import { createCockpitController } from './cockpit.controller.js';
import { createPreferencesController } from './preferences.controller.js';
import { createUsersController } from './users.controller.js';

/**
 * Phase 9's web-dashboard composition root: browser access policy, the
 * operations cockpit, per-user panel-order preferences, and the admin
 * user-management summary (D-01 to D-24, D-83).
 *
 * Paths carry no version prefix -- applied by `app.ts` at registration
 * time, matching every other module's routes file.
 */
export default async function webDashboardRoutes(fastify: FastifyInstance) {
  // `requirePermission` reads `request.server.permissionService`. Fastify's
  // plugin encapsulation means auth.routes.ts's decoration never reaches this
  // sibling plugin's scope, so it is decorated locally here, matching
  // `billing.routes.ts` and `inventory.routes.ts`.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis);
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  const buildAccessPolicyService = (db: TenantPrismaClient) => new AccessPolicyService(db);
  const buildCockpitService = (db: TenantPrismaClient, accessPolicyService: AccessPolicyService) =>
    new CockpitService(db, accessPolicyService);
  const buildPreferencesService = (db: TenantPrismaClient) => new PreferencesService(db);

  const accessPolicyController = createAccessPolicyController(buildAccessPolicyService);
  const cockpitController = createCockpitController(buildAccessPolicyService, buildCockpitService);
  const preferencesController = createPreferencesController(buildPreferencesService);
  const usersController = createUsersController();

  const authenticatedHandler = [authenticate, tenantContext];
  // D-21: user management, role changes, and permission administration stay
  // Admin-only. `MANAGE_ROLES` gates the browser access-policy toggles (they
  // change what an entire role can do); `MANAGE_USERS` gates the staff list
  // and active/inactive toggle (they change one person's standing).
  const manageAccessPolicyHandler = [authenticate, tenantContext, requirePermission('MANAGE_ROLES')];
  const manageUsersHandler = [authenticate, tenantContext, requirePermission('MANAGE_USERS')];

  // Cockpit (D-01 to D-13). No `requirePermission` gate: the controller
  // itself re-derives the caller's role and policy fresh on every request
  // (D-83) and 403s when browser access is denied, rather than gating on a
  // fixed permission code that would need its own cache-invalidation story.
  fastify.get('/web-dashboard/cockpit', {
    preHandler: authenticatedHandler,
    handler: cockpitController.getHandler,
  });

  // Browser access policy (D-15 to D-22), Admin-only.
  fastify.get('/web-dashboard/access-policy', {
    preHandler: manageAccessPolicyHandler,
    handler: accessPolicyController.listHandler,
  });
  fastify.patch('/web-dashboard/access-policy/:roleCode', {
    preHandler: manageAccessPolicyHandler,
    handler: accessPolicyController.updateHandler,
  });

  // Personal panel-order preference (D-14). Any authenticated browser user
  // may read/reorder their own panels -- no admin gate.
  fastify.get('/web-dashboard/preferences/panel-order', {
    preHandler: authenticatedHandler,
    handler: preferencesController.getPanelOrderHandler,
  });
  fastify.patch('/web-dashboard/preferences/panel-order', {
    preHandler: authenticatedHandler,
    handler: preferencesController.updatePanelOrderHandler,
  });

  // Admin user-management summary (D-21, D-24, D-28).
  fastify.get('/web-dashboard/users', {
    preHandler: manageUsersHandler,
    handler: usersController.listHandler,
  });
  fastify.patch('/web-dashboard/users/:userId/status', {
    preHandler: manageUsersHandler,
    handler: usersController.setActiveHandler,
  });
}
