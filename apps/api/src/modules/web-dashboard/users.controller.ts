import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuditEvent, writeAuditLog } from '../../lib/audit-log.js';

interface ToggleActiveBody {
  isActive: boolean;
}

/**
 * HTTP surface for the admin-only "Users" module (D-21, D-24, D-28): staff
 * listing with role + browser-access awareness, and active/inactive status
 * toggling. Deliberately does not grow into a broader HR/staffing surface --
 * role *assignment* and browser-policy toggles stay on
 * `access-policy.controller.ts`; this file only lists members and flips
 * `ClinicMember.isActive`.
 *
 * Gated Admin-only by `requirePermission('MANAGE_USERS')` in
 * `web-dashboard.routes.ts`, same as `access-policy.controller.ts`'s
 * `MANAGE_ROLES` gate.
 */
export function createUsersController() {
  return {
    /** GET /web-dashboard/users */
    async listHandler(request: FastifyRequest, reply: FastifyReply) {
      const clinicId = request.user.activeClinicId;

      const members = await request.db.clinicMember.findMany({
        where: { clinicId },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          roles: { include: { role: { select: { name: true } } } },
          statusChangedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const data = members.map((member) => ({
        userId: member.userId,
        fullName: member.user.fullName,
        email: member.user.email,
        roleNames: member.roles.map((memberRole) => memberRole.role.name),
        isActive: member.isActive,
        statusChangedByName: member.statusChangedBy?.fullName ?? null,
        statusChangedAt: member.statusChangedAt ? member.statusChangedAt.toISOString() : null,
      }));

      return reply.status(200).send({ data });
    },

    /**
     * PATCH /web-dashboard/users/:userId/status
     *
     * D-24: the response always names the acting Admin and the timestamp,
     * not only the backend audit log, so the UI can render "changed by /
     * changed at" directly from this call's response.
     */
    async setActiveHandler(
      request: FastifyRequest<{ Params: { userId: string }; Body: ToggleActiveBody }>,
      reply: FastifyReply,
    ) {
      const { userId } = request.params;
      const { isActive } = request.body ?? {};
      const clinicId = request.user.activeClinicId;

      if (typeof isActive !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'isActive must be a boolean' },
        });
      }

      const member = await request.db.clinicMember.findFirst({ where: { userId, clinicId } });
      if (!member) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found in this clinic' } });
      }

      const now = new Date();
      const updated = await request.db.clinicMember.update({
        where: { id: member.id },
        data: { isActive, statusChangedByUserId: request.user.id, statusChangedAt: now },
      });

      await writeAuditLog(request.db, isActive ? AuditEvent.USER_REACTIVATED : AuditEvent.USER_DEACTIVATED, {
        userId: request.user.id,
        clinicId,
        targetUserId: userId,
      });

      return reply.status(200).send({
        data: {
          userId,
          isActive: updated.isActive,
          updatedByUserId: request.user.id,
          updatedAt: now.toISOString(),
        },
      });
    },
  };
}
