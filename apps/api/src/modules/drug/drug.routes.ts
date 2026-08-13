import type { FastifyInstance } from 'fastify';
import { DrugRepository } from './drug.repository.js';
import { DrugService } from './drug.service.js';
import { createDrugController } from './drug.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function drugRoutes(fastify: FastifyInstance) {
  const repository = new DrugRepository(fastify.prisma);
  const service = new DrugService(repository);
  const controller = createDrugController(service);

  const preHandler = [authenticate, tenantContext];

  // GET /drugs — All drugs (client-side cache)
  fastify.get('/drugs', { preHandler, handler: controller.getAllDrugsHandler });

  // GET /drugs/search?q=X&limit=N — Search drugs
  fastify.get('/drugs/search', { preHandler, handler: controller.searchDrugsHandler });

  // GET /drugs/:drugId/dosage/:species — Species-specific dosage range
  fastify.get('/drugs/:drugId/dosage/:species', { preHandler, handler: controller.getDosageRangeHandler });
}
