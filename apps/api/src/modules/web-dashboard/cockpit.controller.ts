import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { AccessPolicyService } from './access-policy.service.js';
import type { CockpitService } from './cockpit.service.js';

/**
 * HTTP surface for the D-01 to D-13 operations cockpit.
 *
 * D-83: this handler re-resolves the caller's role and policy on every
 * request (through `AccessPolicyService`, never from a cached claim), so a
 * user whose browser access was revoked after they logged in gets a 403 on
 * their very next poll instead of continuing to see a stale cockpit.
 */
export function createCockpitController(
  buildAccessPolicyService: (db: TenantPrismaClient) => AccessPolicyService,
  buildCockpitService: (db: TenantPrismaClient, accessPolicyService: AccessPolicyService) => CockpitService,
) {
  return {
    /** GET /web-dashboard/cockpit */
    async getHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicId = request.user.activeClinicId;
      const userId = request.user.id;

      const accessPolicyService = buildAccessPolicyService(request.db);
      const roleCode = await accessPolicyService.getRoleCodeForUser(clinicId, userId);

      if (!roleCode) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'No browser-eligible role for this clinic' },
        });
      }

      const policy = await accessPolicyService.getPolicy(clinicId, roleCode);
      if (!policy.browserEnabled) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Browser access is disabled for this role' },
        });
      }

      const cockpitService = buildCockpitService(request.db, accessPolicyService);
      const data = await cockpitService.getCockpit(clinicId, userId);
      return reply.status(200).send({ data });
    },
  };
}
