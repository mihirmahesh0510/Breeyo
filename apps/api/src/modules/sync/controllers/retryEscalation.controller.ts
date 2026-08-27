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
 * WR-6: matches `requirePermission`'s 403 shape (`middleware/authorize.ts`)
 * and the `forbiddenError` convention already used across the codebase
 * (e.g. `billing-workbench.service.ts`, `consultationOfflineReplay.service.ts`)
 * -- a plain `Error` with `statusCode`/`code` set, thrown and left for the
 * centralized `error-handler.ts` to format as `{ error: { code, message } }`.
 */
function forbiddenError(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  return error;
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
     *
     * WR-6: only the row's CURRENT OWNER may trigger this -- any other
     * authenticated staff member in the same clinic gets a 403, even though
     * RLS would otherwise let them read/act on the row (RLS scopes by
     * `clinicId` only, not by owner).
     */
    async retryHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      const body = bodySchema.safeParse(request.body ?? {});
      if (!body.success) return validationError(reply, body.error.errors);

      const service = buildService(request.db);
      const currentOwnerUserId = await service.getCurrentOwnerUserId(
        body.data.kind as RetryEscalationRecordKind,
        params.data.failureTaskId,
      );
      if (currentOwnerUserId !== request.user.id) {
        throw forbiddenError('Only the current owner of this item may retry it');
      }

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
     *
     * WR-6: same owner-only gate as `retryHandler` -- escalation is
     * triggered by the CURRENT owner reporting their own attempt failed, not
     * by an arbitrary staff member on the row's behalf.
     */
    async escalateHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return validationError(reply, params.error.errors);

      const body = bodySchema.safeParse(request.body ?? {});
      if (!body.success) return validationError(reply, body.error.errors);

      const service = buildService(request.db);
      const currentOwnerUserId = await service.getCurrentOwnerUserId(
        body.data.kind as RetryEscalationRecordKind,
        params.data.failureTaskId,
      );
      if (currentOwnerUserId !== request.user.id) {
        throw forbiddenError('Only the current owner of this item may escalate it');
      }

      const updated = await service.escalate(
        body.data.kind as RetryEscalationRecordKind,
        params.data.failureTaskId,
      );
      return reply.status(200).send({ data: updated });
    },
  };
}
