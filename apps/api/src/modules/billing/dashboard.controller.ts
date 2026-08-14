import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { DashboardService } from './dashboard.service.js';

/**
 * HTTP surface for the Billing tab landing aggregate (D-24, RPT-01 via D-33).
 *
 * Follows `invoice.controller.ts`: a factory rather than a prebuilt service, so
 * the handler resolves its Prisma handle from `request.db` — the tenant-scoped,
 * RLS-bound client — as its first statement (D-30). There is no request body
 * and no path parameter to validate; the clinic comes from the token.
 */
export function createDashboardController(
  buildService: (db: TenantPrismaClient) => DashboardService,
) {
  return {
    /** GET /billing/dashboard */
    async getSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
      const service = buildService(request.db);

      const data = await service.getSummary(request.user.activeClinicId);

      return reply.status(200).send({ data });
    },
  };
}
