import type { FastifyRequest, FastifyReply } from 'fastify';
import { dashboardPanelOrderSchema } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { InvalidPanelOrderError, type PreferencesService } from './preferences.service.js';

/**
 * HTTP surface for D-14's personal panel-order preference. Any browser user
 * may reorder their own panels -- there is no admin gate here, unlike
 * `access-policy.controller.ts`.
 */
export function createPreferencesController(
  buildService: (db: TenantPrismaClient) => PreferencesService,
) {
  return {
    /** PATCH /web-dashboard/preferences/panel-order */
    async updatePanelOrderHandler(request: FastifyRequest, reply: FastifyReply) {
      const parsed = dashboardPanelOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((issue) => issue.message).join(', '),
          },
        });
      }

      const service = buildService(request.db);
      try {
        const panelOrder = await service.updatePanelOrder(
          request.user.id,
          request.user.activeClinicId,
          parsed.data.panelOrder,
        );
        return reply.status(200).send({ data: { panelOrder } });
      } catch (error) {
        if (error instanceof InvalidPanelOrderError) {
          return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        }
        throw error;
      }
    },

    /** GET /web-dashboard/preferences/panel-order */
    async getPanelOrderHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);
      const panelOrder = await service.getPanelOrder(request.user.id, request.user.activeClinicId);
      return reply.status(200).send({ data: { panelOrder } });
    },
  };
}
