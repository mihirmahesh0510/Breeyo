import { describe, it, expect } from 'vitest';
import {
  ConflictSeverity,
  DEFAULT_GUIDED_RETRY_POLICY,
  REPLAY_PRIORITIES,
  ReplayPriority,
  ResolutionState,
  SYNC_VISIBILITY_STATES,
  SyncVisibilityState,
} from '@breeyo/types';
import { offlineOperationEnvelopeSchema, syncConflictEnvelopeSchema, syncVisibilityStateSchema } from '../schemas.js';

const baseEnvelope = {
  deviceId: 'device-1',
  operationId: 'op-1',
  clinicId: 'clinic-1',
  userId: 'user-1',
  domain: 'queue',
  entityType: 'QueueEntry',
  entityId: 'entity-1',
  priority: ReplayPriority.QUEUE_HIGH,
  createdAt: new Date().toISOString(),
  payload: { note: 'hello' },
};

const baseConflict = {
  conflictId: 'conflict-1',
  clinicId: 'clinic-1',
  deviceId: 'device-1',
  operationId: 'op-1',
  domain: 'emr',
  entityType: 'Consultation',
  entityId: 'entity-1',
  severity: ConflictSeverity.OPERATIONAL,
  localPayload: { note: 'local' },
  serverPayload: { note: 'server' },
  resolutionState: ResolutionState.OPEN,
  createdAt: new Date().toISOString(),
};

// ─── Behaviour 1: queue-first priority ladder is locked (D-12 to D-14, D-37) ──

describe('REPLAY_PRIORITIES — queue-first ladder', () => {
  it('places QUEUE_HIGH first with no severity-based exception', () => {
    expect(REPLAY_PRIORITIES[0]).toBe(ReplayPriority.QUEUE_HIGH);
  });

  it('exposes exactly the four locked tiers in order', () => {
    expect(REPLAY_PRIORITIES).toEqual([
      ReplayPriority.QUEUE_HIGH,
      ReplayPriority.CLINICAL_MEDIUM,
      ReplayPriority.INVENTORY_MEDIUM,
      ReplayPriority.ANCILLARY_LOW,
    ]);
  });
});

// ─── Behaviour 2: offline operation envelope rejects bad ownership/priority ──

describe('offlineOperationEnvelopeSchema — ownership and priority contract', () => {
  it('accepts a fully-formed envelope', () => {
    expect(() => offlineOperationEnvelopeSchema.parse(baseEnvelope)).not.toThrow();
  });

  it.each(['clinicId', 'userId', 'deviceId'] as const)('rejects a missing %s', (field) => {
    const rest: Record<string, unknown> = { ...baseEnvelope };
    delete rest[field];
    expect(() => offlineOperationEnvelopeSchema.parse(rest)).toThrow();
  });

  it('rejects an unknown priority code', () => {
    expect(() => offlineOperationEnvelopeSchema.parse({ ...baseEnvelope, priority: 'NOT_A_REAL_PRIORITY' })).toThrow();
  });
});

// ─── Behaviour 3: conflict envelope requires both payload sides + owner ─────

describe('syncConflictEnvelopeSchema — payload and SAFETY_CRITICAL ownership', () => {
  it('accepts an OPERATIONAL conflict without a resolution owner', () => {
    expect(() => syncConflictEnvelopeSchema.parse(baseConflict)).not.toThrow();
  });

  it('rejects a conflict missing localPayload', () => {
    const rest: Record<string, unknown> = { ...baseConflict };
    delete rest.localPayload;
    expect(() => syncConflictEnvelopeSchema.parse(rest)).toThrow();
  });

  it('rejects a conflict missing serverPayload', () => {
    const rest: Record<string, unknown> = { ...baseConflict };
    delete rest.serverPayload;
    expect(() => syncConflictEnvelopeSchema.parse(rest)).toThrow();
  });

  it('rejects a SAFETY_CRITICAL conflict with no resolutionOwnerUserId', () => {
    const unresolvedSafetyCritical = { ...baseConflict, severity: ConflictSeverity.SAFETY_CRITICAL };
    expect(() => syncConflictEnvelopeSchema.parse(unresolvedSafetyCritical)).toThrow();
  });

  it('accepts a SAFETY_CRITICAL conflict once resolutionOwnerUserId is set', () => {
    const ownedSafetyCritical = {
      ...baseConflict,
      severity: ConflictSeverity.SAFETY_CRITICAL,
      resolutionOwnerUserId: 'clinician-1',
    };
    expect(() => syncConflictEnvelopeSchema.parse(ownedSafetyCritical)).not.toThrow();
  });
});

// ─── Behaviour 4: visibility-state parsing covers all five states ───────────

describe('syncVisibilityStateSchema — five D-18 to D-21 states', () => {
  it.each(SYNC_VISIBILITY_STATES)('parses %s', (state) => {
    expect(syncVisibilityStateSchema.parse(state)).toBe(state);
  });

  it('rejects an unknown visibility state', () => {
    expect(() => syncVisibilityStateSchema.parse('UNKNOWN_STATE')).toThrow();
  });

  it('covers exactly the five locked states', () => {
    expect(SYNC_VISIBILITY_STATES).toEqual([
      SyncVisibilityState.PENDING,
      SyncVisibilityState.REPLAYING,
      SyncVisibilityState.CONFLICT,
      SyncVisibilityState.FAILED,
      SyncVisibilityState.CAUGHT_UP,
    ]);
  });
});

// ─── Behaviour 5: default guided retry policy (D-22, D-23) ──────────────────

describe('DEFAULT_GUIDED_RETRY_POLICY', () => {
  it('allows exactly one guided retry before automatic escalation', () => {
    expect(DEFAULT_GUIDED_RETRY_POLICY).toEqual({
      maxGuidedRetries: 1,
      escalationAfterGuidedRetry: true,
    });
  });
});
