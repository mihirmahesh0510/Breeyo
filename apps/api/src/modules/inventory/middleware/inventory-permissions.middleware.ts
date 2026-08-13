import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * D-41–D-44: maps each inventory action to the permission code that grants it.
 *
 * DEVIATION FROM THE PLAN'S LITERAL SNIPPET: the plan sketches this as a hardcoded
 * map of role-name strings (admin/clinician/inventory_manager/front_desk) read off
 * `request.user.role`, plus a `request.user.customPermissions` override. Neither of
 * those exists in this codebase:
 *  - `authenticate` (apps/api/src/middleware/authenticate.ts) decodes the JWT into
 *    `request.user = { id, activeClinicId }` only — there is no `.role` field.
 *  - Role → permission resolution is always done through
 *    ClinicMember → ClinicMemberRole → Role → RolePermission, plus per-user
 *    UserPermissionOverride rows, via `PermissionService.getUserPermissions()`
 *    (apps/api/src/modules/auth/permission.service.ts). Every existing gated route
 *    (auth.routes.ts, clinic.routes.ts) uses `requirePermission(...permissionCodes)`
 *    from apps/api/src/middleware/authorize.ts against that same service — overrides
 *    are already folded into the returned list, so there's no separate
 *    "customPermissions" concept to check.
 *
 * `requireInventoryPermission` mirrors that real convention instead: each inventory
 * action maps to one permission code, and prisma/seed.ts's DEFAULT_ROLE_PERMISSIONS
 * assigns those codes per role to encode the D-41-D-44 rules:
 *  - viewInventory (VIEW_INVENTORY): Admin, Clinician, FrontDesk, InventoryManager
 *  - manageStock (MANAGE_INVENTORY_STOCK): Admin, FrontDesk, InventoryManager (D-41/D-42)
 *  - dispense (DISPENSE_INVENTORY): Admin, Clinician, InventoryManager (D-43 — front desk excluded)
 *  - setPricesAndParLevels (MANAGE_INVENTORY_PRICES): Admin, InventoryManager only (D-44)
 *  - exportData (EXPORT_INVENTORY_DATA): Admin, InventoryManager
 */
export const INVENTORY_PERMISSIONS = {
  viewInventory: 'VIEW_INVENTORY',
  manageStock: 'MANAGE_INVENTORY_STOCK',
  dispense: 'DISPENSE_INVENTORY',
  setPricesAndParLevels: 'MANAGE_INVENTORY_PRICES',
  exportData: 'EXPORT_INVENTORY_DATA',
} as const;

export function requireInventoryPermission(action: keyof typeof INVENTORY_PERMISSIONS) {
  return async function requireInventoryPermissionHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: userId, activeClinicId } = request.user;
    const permissionService = request.server.permissionService;
    const requiredCode = INVENTORY_PERMISSIONS[action];

    const userPerms = await permissionService.getUserPermissions(userId, activeClinicId);

    if (!userPerms.includes(requiredCode)) {
      reply.status(403).send({
        error: { code: 'FORBIDDEN', message: `Permission denied: ${action}` },
      });
      return;
    }

    request.permissions = userPerms;
  };
}
