// Plan 10-05 Task 2: guided retry / clinician escalation (D-22 to D-24,
// D-36) and scoped replay broadcasts (D-42-style, T-10-09). One file covers
// both services, matching this plan's file list.
import { describe, it, expect, vi } from 'vitest';
import { ConflictSeverity, ReplayPriority, ResolutionState, REPLAY_PRIORITIES } from '@breeyo/types';
import {
  RetryEscalationService,
  type RetryEscalationConflictRow,
  type RetryEscalationTaskRow,
  type OnDutyRosterProvider,
} from '../services/retryEscalation.service.js';
import { ReplayBroadcastService, REPLAY_BROADCAST_EVENTS } from '../services/replayBroadcast.service.js';

const CLINIC_ID = 'clinic_1';
const CLINICIAN_A = 'vet_a';
const CLINICIAN_B = 'vet_b';
const ORIGINATING_USER = 'user_fd_1';

function conflictRow(overrides: Partial<RetryEscalationConflictRow> = {}): RetryEscalationConflictRow {
  return {
    id: 'conflict_1',
    clinicId: CLINIC_ID,
    severity: ConflictSeverity.SAFETY_CRITICAL,
    currentOwnerUserId: CLINICIAN_A,
    guidedRetryCount: 0,
    resolutionState: ResolutionState.OPEN,
    ...overrides,
  };
}

function taskRow(overrides: Partial<RetryEscalationTaskRow> = {}): RetryEscalationTaskRow {
  return {
    id: 'task_1',
    clinicId: CLINIC_ID,
    currentOwnerUserId: ORIGINATING_USER,
    guidedRetryCount: 0,
    resolutionState: ResolutionState.OPEN,
    ...overrides,
  };
}

function makeDb(opts: { conflict?: RetryEscalationConflictRow | null; task?: RetryEscalationTaskRow | null } = {}) {
  const conflict = opts.conflict === undefined ? conflictRow() : opts.conflict;
  const task = opts.task === undefined ? taskRow() : opts.task;

  return {
    syncConflictRecord: {
      findUnique: vi.fn().mockResolvedValue(conflict),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...(conflict as RetryEscalationConflictRow),
        ...data,
      })),
    },
    syncFailureTask: {
      findUnique: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...(task as RetryEscalationTaskRow),
        ...data,
      })),
    },
  };
}

function makeRosterProvider(clinicianIds: string[]): OnDutyRosterProvider {
  return {
    listOtherOnDutyClinicianIds: vi.fn().mockImplementation(async (_clinicId: string, excludeUserId: string) =>
      clinicianIds.filter((id) => id !== excludeUserId),
    ),
  };
}

describe('RetryEscalationService.assignOriginatingUserRetry (D-22)', () => {
  it('advances an OPEN failure task to GUIDED_RETRY, keeping the originating user as owner', async () => {
    const db = makeDb({ task: taskRow({ resolutionState: ResolutionState.OPEN, currentOwnerUserId: ORIGINATING_USER }) });
    const service = new RetryEscalationService(db as never);

    const updated = await service.assignOriginatingUserRetry('FAILURE_TASK', 'task_1');

    expect(updated.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(updated.currentOwnerUserId).toBe(ORIGINATING_USER);
  });

  it('advances an OPEN SAFETY_CRITICAL conflict to GUIDED_RETRY without reassigning the already-accountable clinician (D-09)', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.OPEN, currentOwnerUserId: CLINICIAN_A }) });
    const service = new RetryEscalationService(db as never);

    const updated = await service.assignOriginatingUserRetry('CONFLICT', 'conflict_1');

    expect(updated.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(updated.currentOwnerUserId).toBe(CLINICIAN_A);
  });

  it('rejects starting a guided retry from any state other than OPEN', async () => {
    const db = makeDb({ task: taskRow({ resolutionState: ResolutionState.ESCALATED }) });
    const service = new RetryEscalationService(db as never);

    await expect(service.assignOriginatingUserRetry('FAILURE_TASK', 'task_1')).rejects.toThrow();
  });
});

describe('RetryEscalationService.recordGuidedRetryFailure (D-23, D-24, D-10)', () => {
  it('escalates a failed SAFETY_CRITICAL conflict to another on-duty clinician, never leaving it with the clinician whose retry just failed', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.GUIDED_RETRY, currentOwnerUserId: CLINICIAN_A, guidedRetryCount: 0 }) });
    const roster = makeRosterProvider([CLINICIAN_A, CLINICIAN_B]);
    const service = new RetryEscalationService(db as never, roster);

    const updated = await service.recordGuidedRetryFailure('CONFLICT', 'conflict_1');

    expect(updated.resolutionState).toBe(ResolutionState.ESCALATED);
    expect(updated.currentOwnerUserId).toBe(CLINICIAN_B);
    expect(updated.guidedRetryCount).toBe(1);
    expect(roster.listOtherOnDutyClinicianIds).toHaveBeenCalledWith(CLINIC_ID, CLINICIAN_A);
  });

  it('throws rather than silently stalling when no other on-duty clinician exists to escalate a SAFETY_CRITICAL conflict to', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.GUIDED_RETRY, currentOwnerUserId: CLINICIAN_A }) });
    const roster = makeRosterProvider([CLINICIAN_A]);
    const service = new RetryEscalationService(db as never, roster);

    await expect(service.recordGuidedRetryFailure('CONFLICT', 'conflict_1')).rejects.toThrow();
  });

  it('escalates a failed OPERATIONAL conflict to ESCALATED without reassigning ownership (D-10: lighter review, no clinician hand-off)', async () => {
    const db = makeDb({
      conflict: conflictRow({
        severity: ConflictSeverity.OPERATIONAL,
        resolutionState: ResolutionState.GUIDED_RETRY,
        currentOwnerUserId: ORIGINATING_USER,
      }),
    });
    const service = new RetryEscalationService(db as never);

    const updated = await service.recordGuidedRetryFailure('CONFLICT', 'conflict_1');

    expect(updated.resolutionState).toBe(ResolutionState.ESCALATED);
    expect(updated.currentOwnerUserId).toBe(ORIGINATING_USER);
  });

  it('escalates a failed plain failure task to ESCALATED without reassigning ownership (no clinician concept for a raw envelope failure)', async () => {
    const db = makeDb({ task: taskRow({ resolutionState: ResolutionState.GUIDED_RETRY, currentOwnerUserId: ORIGINATING_USER }) });
    const service = new RetryEscalationService(db as never);

    const updated = await service.recordGuidedRetryFailure('FAILURE_TASK', 'task_1');

    expect(updated.resolutionState).toBe(ResolutionState.ESCALATED);
    expect(updated.currentOwnerUserId).toBe(ORIGINATING_USER);
  });

  it('rejects recording a guided-retry failure from any state other than GUIDED_RETRY', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.OPEN }) });
    const service = new RetryEscalationService(db as never);

    await expect(service.recordGuidedRetryFailure('CONFLICT', 'conflict_1')).rejects.toThrow();
  });

  it('requires an on-duty roster provider to escalate a SAFETY_CRITICAL conflict at all', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.GUIDED_RETRY }) });
    const service = new RetryEscalationService(db as never);

    await expect(service.recordGuidedRetryFailure('CONFLICT', 'conflict_1')).rejects.toThrow();
  });
});

describe('RetryEscalationService.reassignUnreachableEscalatedOwner (D-36: further escalation, never to Admin, never stalled)', () => {
  it('moves an already-ESCALATED SAFETY_CRITICAL conflict to a different on-duty clinician when the current owner is also unreachable', async () => {
    const db = makeDb({
      conflict: conflictRow({ resolutionState: ResolutionState.ESCALATED, currentOwnerUserId: CLINICIAN_B, guidedRetryCount: 1 }),
    });
    const roster = makeRosterProvider([CLINICIAN_A, CLINICIAN_B, 'vet_c']);
    const service = new RetryEscalationService(db as never, roster);

    const updated = await service.reassignUnreachableEscalatedOwner('CONFLICT', 'conflict_1');

    expect(updated.currentOwnerUserId).not.toBe(CLINICIAN_B);
    expect(['vet_a', 'vet_c']).toContain(updated.currentOwnerUserId);
  });

  it('throws rather than falling back to Admin or stalling indefinitely when every clinician is unreachable', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.ESCALATED, currentOwnerUserId: CLINICIAN_B }) });
    const roster = makeRosterProvider([CLINICIAN_B]);
    const service = new RetryEscalationService(db as never, roster);

    await expect(service.reassignUnreachableEscalatedOwner('CONFLICT', 'conflict_1')).rejects.toThrow();
  });

  it('rejects reassigning a non-safety-critical item this way (D-24 scopes clinician hand-off to SAFETY_CRITICAL only)', async () => {
    const db = makeDb({
      conflict: conflictRow({ severity: ConflictSeverity.OPERATIONAL, resolutionState: ResolutionState.ESCALATED }),
    });
    const roster = makeRosterProvider([CLINICIAN_A, CLINICIAN_B]);
    const service = new RetryEscalationService(db as never, roster);

    await expect(service.reassignUnreachableEscalatedOwner('CONFLICT', 'conflict_1')).rejects.toThrow();
  });
});

describe('D-37: escalation/ownership changes never alter replay priority or grant preemption over QUEUE_HIGH', () => {
  it('QUEUE_HIGH always precedes CLINICAL_MEDIUM in the locked replay ladder, independent of any conflict severity or resolution state', () => {
    expect(REPLAY_PRIORITIES.indexOf(ReplayPriority.QUEUE_HIGH)).toBeLessThan(
      REPLAY_PRIORITIES.indexOf(ReplayPriority.CLINICAL_MEDIUM),
    );
  });

  it('never writes a priority/replayPriority field when escalating a SAFETY_CRITICAL conflict to another clinician', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.GUIDED_RETRY, currentOwnerUserId: CLINICIAN_A }) });
    const roster = makeRosterProvider([CLINICIAN_A, CLINICIAN_B]);
    const service = new RetryEscalationService(db as never, roster);

    await service.recordGuidedRetryFailure('CONFLICT', 'conflict_1');

    const updateArgs = (db.syncConflictRecord.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data).not.toHaveProperty('priority');
    expect(updateArgs.data).not.toHaveProperty('replayPriority');
  });

  it('never writes a priority/replayPriority field when reassigning an unreachable escalated owner', async () => {
    const db = makeDb({ conflict: conflictRow({ resolutionState: ResolutionState.ESCALATED, currentOwnerUserId: CLINICIAN_B }) });
    const roster = makeRosterProvider([CLINICIAN_A, CLINICIAN_B]);
    const service = new RetryEscalationService(db as never, roster);

    await service.reassignUnreachableEscalatedOwner('CONFLICT', 'conflict_1');

    const updateArgs = (db.syncConflictRecord.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data).not.toHaveProperty('priority');
    expect(updateArgs.data).not.toHaveProperty('replayPriority');
  });
});

describe('ReplayBroadcastService (T-10-09: scoped payloads only, per-clinic room)', () => {
  function makeIo() {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    return { io: { to } as unknown as { to: typeof to }, to, emit };
  }

  it('emits REPLAY_APPLIED scoped to the clinic room, carrying clinicId/domain/entityIds', () => {
    const { io, to, emit } = makeIo();
    const service = new ReplayBroadcastService(io as never);

    service.emitReplayApplied({ clinicId: CLINIC_ID, domain: 'queue', entityIds: ['entry_1', 'entry_2'] });

    expect(to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    expect(emit).toHaveBeenCalledWith(
      REPLAY_BROADCAST_EVENTS.REPLAY_APPLIED,
      expect.objectContaining({ clinicId: CLINIC_ID, domain: 'queue', entityIds: ['entry_1', 'entry_2'] }),
    );
  });

  it('emits REPLAY_CONFLICT_OPENED scoped to the clinic room', () => {
    const { io, to, emit } = makeIo();
    const service = new ReplayBroadcastService(io as never);

    service.emitReplayConflictOpened({ clinicId: CLINIC_ID, domain: 'emr', entityIds: ['consultation_1'] });

    expect(to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    expect(emit).toHaveBeenCalledWith(REPLAY_BROADCAST_EVENTS.REPLAY_CONFLICT_OPENED, expect.objectContaining({ domain: 'emr' }));
  });

  it('emits REPLAY_FAILURE_ESCALATED scoped to the clinic room, with an optional date-window hint', () => {
    const { io, to, emit } = makeIo();
    const service = new ReplayBroadcastService(io as never);

    service.emitReplayFailureEscalated({
      clinicId: CLINIC_ID,
      domain: 'inventory',
      entityIds: ['item_1'],
      dateWindow: { from: '2026-08-20', to: '2026-08-20' },
    });

    expect(to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    expect(emit).toHaveBeenCalledWith(
      REPLAY_BROADCAST_EVENTS.REPLAY_FAILURE_ESCALATED,
      expect.objectContaining({ dateWindow: { from: '2026-08-20', to: '2026-08-20' } }),
    );
  });

  it('never emits to a global/unscoped channel -- io.to is always called with the specific clinic room before emit', () => {
    const { io, to } = makeIo();
    const service = new ReplayBroadcastService(io as never);

    service.emitReplayApplied({ clinicId: 'clinic_other', domain: 'queue', entityIds: ['e1'] });

    expect(to).toHaveBeenCalledWith('clinic:clinic_other');
    expect(to).not.toHaveBeenCalledWith('*');
  });

  it('is a safe no-op when constructed with a null io (unit tests / callers with no realtime server)', () => {
    const service = new ReplayBroadcastService(null);
    expect(() => service.emitReplayApplied({ clinicId: CLINIC_ID, domain: 'queue', entityIds: ['e1'] })).not.toThrow();
  });
});
