import type { FastifyRequest, FastifyReply } from 'fastify';
import { browserAccessPolicyUpdateSchema } from '@breeyo/validators';
import type { BrowserRoleCode } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { AccessPolicyService, ClinicianBrowserAccessError } from './access-policy.service.js';

const VALID_ROLE_CODES: BrowserRoleCode[] = ['ADMIN', 'FRONT_DESK', 'CLINICIAN'];

function validationError(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message } });
}

/**
 * HTTP surface for the D-15 to D-22 browser access policy -- Admin-only
 * (gated by `requirePermission('MANAGE_ROLES')` in `web-dashboard.routes.ts`,
 * matching D-21's "user management, role changes, and permission
 * administration stay Admin-only").
 *
 * Follows `billing/dashboard.controller.ts`: a factory over `request.db`
 * rather than a prebuilt service (D-30).
 */
export function createAccessPolicyController(
  buildService: (db: TenantPrismaClient) => AccessPolicyService,
) {
  return {
    /** GET /web-dashboard/access-policy — every role's current policy, for the admin management screen. */
    async listHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);
      const data = await service.listPolicies(request.user.activeClinicId);
      return reply.status(200).send({ data });
    },

    /**
     * PATCH /web-dashboard/access-policy/:roleCode — D-19: role-scoped only,
     * never a per-user override. D-15: rejects Clinician outright.
     */
    async updateHandler(
      request: FastifyRequest<{ Params: { roleCode: string } }>,
      reply: FastifyReply,
    ) {
      const roleCode = request.params.roleCode as BrowserRoleCode;
      if (!VALID_ROLE_CODES.includes(roleCode)) {
        return validationError(reply, `roleCode must be one of ${VALID_ROLE_CODES.join(', ')}`);
      }

      const parsed = browserAccessPolicyUpdateSchema.safeParse({
        ...(request.body as Record<string, unknown>),
        clinicId: request.user.activeClinicId,
        roleCode,
      });
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues.map((issue) => issue.message).join(', '));
      }

      const { clinicId: _clinicId, roleCode: _roleCode, ...updates } = parsed.data;

      const service = buildService(request.db);
      try {
        const data = await service.updatePolicy(
          request.user.activeClinicId,
          roleCode,
          updates,
          request.user.id,
        );
        return reply.status(200).send({ data });
      } catch (error) {
        if (error instanceof ClinicianBrowserAccessError) {
          return validationError(reply, error.message);
        }
        throw error;
      }
    },
  };
}
