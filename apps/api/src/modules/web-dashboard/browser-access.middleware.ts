import type { FastifyRequest, FastifyReply } from 'fastify';
import type { BrowserModuleCode } from '@breeyo/types';
import { AccessPolicyService } from './access-policy.service.js';

/**
 * D-15, D-17, D-18: server-side enforcement of the per-role browser module
 * toggles for the actual queue/billing/inventory web endpoints, not just the
 * cockpit aggregation response. Without this, disabling a module toggle (or
 * the Clinician browser-access ban) only hides the cockpit panel -- the
 * underlying data/mutation endpoints stayed reachable by any authenticated
 * clinic member holding the pre-existing mobile-app permission. Mirrors
 * `requireInventoryPermission`'s shape but resolves against
 * `AccessPolicyService` (the D-19/D-83 fresh-read source of truth) rather
 * than `PermissionService`.
 */
export function requireBrowserModuleAccess(moduleCode: BrowserModuleCode) {
  return async function requireBrowserModuleAccessHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: userId, activeClinicId } = request.user;
    const accessPolicyService = new AccessPolicyService(request.db);
    const visibleModules = await accessPolicyService.getVisibleModulesForUser(activeClinicId, userId);

    if (!visibleModules.includes(moduleCode)) {
      reply.status(403).send({
        error: { code: 'FORBIDDEN', message: `Browser access to ${moduleCode} is not enabled for your role` },
      });
      return;
    }
  };
}
