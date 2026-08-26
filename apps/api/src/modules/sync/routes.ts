import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { ReplayIngestService, type ReplayIngestPrismaClient } from './services/replayIngest.service.js';
import { ReplayBroadcastService } from './services/replayBroadcast.service.js';
import { ClinicVetRosterProvider } from './services/onDutyRoster.service.js';
import { AvailabilityRepository } from '../scheduling/availability.repository.js';
import {
  createRetryEscalationController,
  buildRetryEscalationService,
} from './controllers/retryEscalation.controller.js';

/**
 * Top-level shape check only -- each individual operation/conflict envelope
 * is validated by the shared `@breeyo/validators` zod schemas inside
 * `ReplayIngestService` (T-10-01). Keeping this schema loose lets one
 * malformed envelope in a batch surface as a `SyncFailureTask` for that item
 * alone instead of rejecting the whole reconnect batch with a blanket 400.
 */
const replayRequestBodySchema = z.object({
  deviceId: z.string().trim().min(1),
  operations: z.array(z.unknown()).default([]),
  conflicts: z.array(z.unknown()).default([]),
});

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((issue) => issue.message).join(', '),
    },
  });
}

/**
 * `request.db` (the RLS-bound, tenant-scoped Prisma handle -- see
 * `tenant-context.ts`) is cast to `ReplayIngestPrismaClient`'s minimal
 * delegate surface rather than typed against it directly. The
 * `SyncReplayReceipt`/`SyncConflictRecord`/`SyncFailureTask` delegates only
 * exist on the generated Prisma Client once Task 3's blocking
 * `prisma db push` + `prisma generate` runs (deliberately not part of this
 * task -- see 10-01-PLAN.md Task 3), so this cast is the documented seam
 * between "schema + service written and tested" (this task) and "schema
 * live against a real database" (Task 3).
 */
function buildService(db: TenantPrismaClient, broadcast: ReplayBroadcastService): ReplayIngestService {
  return new ReplayIngestService(db as unknown as ReplayIngestPrismaClient, broadcast);
}

export default async function syncRoutes(fastify: FastifyInstance) {
  const preHandler = [authenticate, tenantContext];

  // Verify-fix 10.3: plugin-scope singleton, same `fastify.io` convention
  // `queue.routes.ts`/`billing.routes.ts` already use for `BrowserSyncService`
  // -- the Socket.IO server is transport, not tenant data, so it is built
  // once per plugin registration, not per request.
  const replayBroadcast = new ReplayBroadcastService(fastify.io ?? null);

  // Verify-fix 10.6 (D-36 roster resolution): `AvailabilityRepository` is
  // built from `fastify.prisma` (the plain admin client), matching
  // `scheduling.routes.ts`'s own construction -- that table has no DB-level
  // RLS (see the repository's own doc comment), so its explicit `clinicId`
  // parameter is the only tenancy boundary, always supplied by
  // `RetryEscalationService`/`resolveNextOnDutyClinicianId` from the
  // authenticated session's `activeClinicId`, never from client input.
  // Stateless, so it is a plugin-scope singleton like `replayBroadcast`.
  const onDutyRosterProvider = new ClinicVetRosterProvider(new AvailabilityRepository(fastify.prisma));
  const retryEscalationController = createRetryEscalationController((db) =>
    buildRetryEscalationService(db, onDutyRosterProvider),
  );

  fastify.post('/sync/replay', {
    preHandler,
    async handler(request: FastifyRequest, reply: FastifyReply) {
      const body = replayRequestBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const service = buildService(request.db, replayBroadcast);

      // T-10-01: clinicId/userId ALWAYS come from the authenticated session
      // (`request.user`, populated by `authenticate` from the verified JWT),
      // never from the request body -- a client cannot spoof its way into
      // writing replay state for another clinic or on behalf of another
      // user by putting different values in the envelope payload.
      const result = await service.ingest(
        {
          clinicId: request.user.activeClinicId,
          userId: request.user.id,
          deviceId: body.data.deviceId,
        },
        {
          operations: body.data.operations,
          conflicts: body.data.conflicts,
        },
      );

      return reply.status(200).send({ data: result });
    },
  });

  // Verify-fix 10.6 (D-22, D-23/D-24/D-36): the guided-retry/escalation
  // routes `retryEscalation.service.ts` had no live caller for -- wires
  // `SyncFailureCenterScreen.tsx`'s (mobile) Retry/Escalate actions to a
  // real ownership state transition instead of a dead callback.
  fastify.post('/sync/failures/:failureTaskId/retry', {
    preHandler,
    handler: retryEscalationController.retryHandler,
  });
  fastify.post('/sync/failures/:failureTaskId/escalate', {
    preHandler,
    handler: retryEscalationController.escalateHandler,
  });
}
