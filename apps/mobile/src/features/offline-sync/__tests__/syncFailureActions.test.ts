// Verify-fix 10.6 (D-22, D-23/D-24/D-36): `SyncFailureCenterScreen.tsx`'s
// `onRetry`/`onEscalate` props were dead callbacks with no real
// implementation behind them anywhere. `syncFailureActions.ts`'s pure
// `buildRetryRequest`/`buildEscalateRequest` are the RN-free decision layer
// `hooks/useSyncFailureActions.ts` wraps with a real `apiClient` call --
// this file exercises the decision layer directly, matching this feature's
// established "test the RN-free layer, not the hook" convention
// (`SyncFailureCenterScreen.test.tsx`'s own file header explains why).
import { describe, it, expect } from 'vitest';
import { ConflictSeverity, ResolutionState } from '@breeyo/types';
import { buildRetryRequest, buildEscalateRequest } from '../lib/syncFailureActions';
import { toFailureCenterItemFromTask, toFailureCenterItemFromConflict, type FailureCenterItem } from '../lib/sync-status';
import type { SyncConflictEnvelope, SyncFailureTaskRecord } from '@breeyo/types';

function failureTask(overrides: Partial<SyncFailureTaskRecord> = {}): SyncFailureTaskRecord {
  return {
    taskId: 'task_1',
    clinicId: 'clinic_1',
    operationId: 'op_1',
    domain: 'queue',
    originatingUserId: 'user_1',
    currentOwnerUserId: 'user_1',
    guidedRetryCount: 0,
    resolutionState: ResolutionState.OPEN,
    nextSuggestedAction: 'Fix and resend',
    lastAttemptedAt: '2026-08-20T09:00:00.000Z',
    createdAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

function conflict(overrides: Partial<SyncConflictEnvelope> = {}): SyncConflictEnvelope {
  return {
    conflictId: 'conflict_1',
    clinicId: 'clinic_1',
    deviceId: 'device_1',
    operationId: 'op_2',
    domain: 'emr',
    entityType: 'CONSULTATION',
    entityId: 'consultation_1',
    severity: ConflictSeverity.SAFETY_CRITICAL,
    localPayload: { assessment: 'local' },
    serverPayload: { assessment: 'server' },
    resolutionOwnerUserId: 'vet_99',
    resolutionState: ResolutionState.OPEN,
    createdAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

describe('buildRetryRequest (D-22: the current owner\'s own guided retry, generic across kinds)', () => {
  it('targets the generic /sync/failures/:id/retry route with kind FAILURE_TASK for a raw envelope failure', () => {
    const item: FailureCenterItem = toFailureCenterItemFromTask(failureTask({ taskId: 'task_abc' }));
    expect(buildRetryRequest(item)).toEqual({
      path: '/api/v1/sync/failures/task_abc/retry',
      method: 'POST',
      body: { kind: 'FAILURE_TASK' },
    });
  });

  it('targets the generic /sync/failures/:id/retry route with kind CONFLICT for a clinical SAFETY_CRITICAL conflict too -- retry is never routed through the EMR resolve endpoint', () => {
    const item: FailureCenterItem = toFailureCenterItemFromConflict(conflict({ conflictId: 'conflict_abc' }));
    expect(buildRetryRequest(item)).toEqual({
      path: '/api/v1/sync/failures/conflict_abc/retry',
      method: 'POST',
      body: { kind: 'CONFLICT' },
    });
  });

  it('targets the generic route with kind CONFLICT for a non-EMR (operational) conflict as well', () => {
    const item: FailureCenterItem = toFailureCenterItemFromConflict(
      conflict({ conflictId: 'conflict_op', domain: 'inventory', severity: ConflictSeverity.OPERATIONAL }),
    );
    expect(buildRetryRequest(item)).toEqual({
      path: '/api/v1/sync/failures/conflict_op/retry',
      method: 'POST',
      body: { kind: 'CONFLICT' },
    });
  });
});

describe('buildEscalateRequest (D-23/D-24/D-36: hand off to the next owner)', () => {
  it('routes a clinical (EMR, SAFETY_CRITICAL) conflict through the EMR resolve endpoint with action ESCALATE, using entityId as the consultation id', () => {
    const item: FailureCenterItem = toFailureCenterItemFromConflict(
      conflict({ conflictId: 'conflict_clinical', entityId: 'consultation_42' }),
    );
    expect(buildEscalateRequest(item)).toEqual({
      path: '/api/v1/consultations/consultation_42/conflicts/conflict_clinical/resolve',
      method: 'POST',
      body: { action: 'ESCALATE' },
    });
  });

  it('routes a plain FAILURE_TASK through the generic /sync/failures/:id/escalate route', () => {
    const item: FailureCenterItem = toFailureCenterItemFromTask(failureTask({ taskId: 'task_generic' }));
    expect(buildEscalateRequest(item)).toEqual({
      path: '/api/v1/sync/failures/task_generic/escalate',
      method: 'POST',
      body: { kind: 'FAILURE_TASK' },
    });
  });

  it('routes a non-EMR (operational) conflict through the generic /sync/failures/:id/escalate route, not the EMR resolve endpoint', () => {
    const item: FailureCenterItem = toFailureCenterItemFromConflict(
      conflict({ conflictId: 'conflict_op', domain: 'inventory', severity: ConflictSeverity.SAFETY_CRITICAL }),
    );
    expect(buildEscalateRequest(item)).toEqual({
      path: '/api/v1/sync/failures/conflict_op/escalate',
      method: 'POST',
      body: { kind: 'CONFLICT' },
    });
  });

  it('routes an EMR conflict that is only OPERATIONAL severity through the generic route (D-10: lighter review, not a clinical hand-off)', () => {
    const item: FailureCenterItem = toFailureCenterItemFromConflict(
      conflict({ conflictId: 'conflict_emr_op', domain: 'emr', severity: ConflictSeverity.OPERATIONAL }),
    );
    expect(buildEscalateRequest(item)).toEqual({
      path: '/api/v1/sync/failures/conflict_emr_op/escalate',
      method: 'POST',
      body: { kind: 'CONFLICT' },
    });
  });
});
