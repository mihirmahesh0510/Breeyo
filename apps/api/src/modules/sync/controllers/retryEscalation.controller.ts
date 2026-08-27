import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantPrismaClient } from '../../../lib/prisma-rls.js';
import {
  RetryEscalationService,
  type RetryEscalationPrismaClient,
  type RetryEscalationRecordKind,
  type OnDutyRosterProvider,
} from '../services/retryEscalation.service.js';

/**
 * Verify-fix 10.6: `:failureTaskId` names the URL segment (mirroring the
 * mobile-side "Sync Failure Center" the routes back), but the underlying row
 * can be either a `SyncFailureTask` (a raw envelope-validation failure, D-10)
 * or a `SyncConflictRecord` (a domain conflict, D-05 to D-09) --
 * `RetryEscalationService` already handles both kinds identically along the
 * same `OPEN -> GUIDED_RETRY -> ESCALATED -> RESOLVED` ladder. The caller
 * names which one via `kind` in the body (mirrors `FailureCenterItem.kind`
 * in `apps/mobile/src/features/offline-sync/lib/sync-status.ts`); defaults
 * to `FAILURE_TASK` since that is what `/sync/failures/...` names.
 */
const paramsSchema = z.object({ failureTaskId: z.string().min(1) });
const bodySchema = z
  .object({ kind: z.enum(['FAILURE_TASK', 'CONFLICT']).default('FAILURE_TASK') })
  .default({ kind: 'FAILURE_TASK' });

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((issue) => issue.message).join(', '),
    },
  });
}

/**
 * T-10-01/tenant isolation convention (matches `buildService` in
 * `../routes.ts` and `buildConsultationOfflineReplayService` in
 * `emr/controllers/consultationSync.controller.ts`): `db` is always the
 * RLS-bound `TenantPrismaClient` off `request.db`, never `fastify.prisma`.
 * A `failureTaskId`/`conflictId` belonging to another clinic is filtered out
 * by Postgres RLS itself before `RetryEscalationService.getRow` ever sees
 * the row, so it resolves as a genuine `NOT_FOUND` (404) rather than a leak.
 */
export function buildRetryEscalationService(
  db: TenantPrismaClient,
  onDutyRosterProvider: OnDutyRosterProvider,
): RetryEscalationService {
  return new RetryEscalationService(db as unknown as RetryEscalationPrismaClient, onDutyRosterProvider);
}

export function createRetryEscalationController(
  buildService: (db: TenantPrismaClient) => RetryEscalationService,
) {
  return {
    /**
     * POST /sync/failures/:failureTaskId/retry (D-22): the current owner's
     * own guided retry -- OPEN -> GUIDED_RETRY, ownership unchanged.
     */
    async retryHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      const body = bodySchema.safeParse(request.body ?? {});
      if (!body.success) return validationError(reply, body.error.errors);

      const service = buildService(request.db);
      const updated = await service.assignOriginatingUserRetry(
        body.data.kind as RetryEscalationRecordKind,
        params.data.failureTaskId,
      );
      return reply.status(200).send({ data: updated });
    },

    /**
     * POST /sync/failures/:failureTaskId/escalate (D-23/D-24/D-36): a
     * failed guided retry (or an already-escalated owner who is ALSO
     * unreachable) hands off to the next owner. `RetryEscalationService.escalate`
     * dispatches to the right transition based on the row's current state.
     */
    async escalateHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      const body = bodySchema.safeParse(request.body ?? {});
      if (!body.success) return validationError(reply, body.error.errors);

      const service = buildService(request.db);
      const updated = await service.escalate(
        body.data.kind as RetryEscalationRecordKind,
        params.data.failureTaskId,
      );
      return reply.status(200).send({ data: updated });
    },
  };
}
