/**
 * Plan 10-05 Task 1: sync badge, failure center, retry-ownership mobile UX.
 * D-18 to D-24, D-11, D-36.
 *
 * `apps/mobile` runs vitest in a `node` environment with no Metro/Babel
 * transform, so `import 'react-native'` fails at parse time and
 * `react-test-renderer` is not installed (same constraint documented in
 * `QueueBoard.test.tsx` and `ClinicalConflictResolutionSheet.test.tsx`).
 * Every decision lives in the RN-free `lib/sync-status.ts` and
 * `store/syncUiStore.ts` and is exercised directly here; the handful of
 * assertions that are genuinely about the component tree / hook wiring are
 * made by reading the source off disk, the same technique
 * `ClinicalConflictResolutionSheet.test.tsx` uses.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConflictSeverity, ResolutionState, SyncVisibilityState } from '@breeyo/types';
import type { SyncConflictEnvelope, SyncFailureTaskRecord } from '@breeyo/types';
import {
  deriveVisibilityState,
  badgeCopy,
  shouldShowRecoveryCue,
  RECOVERY_CUE_COPY,
  isUnresolved,
  isClinicalConflictItem,
  resolveItemPressAction,
  toFailureCenterItemFromTask,
  toFailureCenterItemFromConflict,
  groupFailureCenterItems,
  type FailureCenterItem,
  type SyncStatusCounts,
} from '../lib/sync-status';
import { useSyncUiStore } from '../store/syncUiStore';

function componentSource(relativePath: string): string {
  return readFileSync(join(__dirname, '..', relativePath), 'utf8');
}

const VIEWER_ID = 'user_fd_1';
const CLINICIAN_ID = 'vet_99';
const OTHER_CLINICIAN_ID = 'vet_100';

function counts(overrides: Partial<SyncStatusCounts> = {}): SyncStatusCounts {
  return { pendingCount: 0, replayingCount: 0, conflictCount: 0, failedCount: 0, ...overrides };
}

function failureTask(overrides: Partial<SyncFailureTaskRecord> = {}): SyncFailureTaskRecord {
  return {
    taskId: 'task_1',
    clinicId: 'clinic_1',
    operationId: 'op_1',
    domain: 'queue',
    originatingUserId: VIEWER_ID,
    currentOwnerUserId: VIEWER_ID,
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
    localPayload: {},
    serverPayload: {},
    resolutionOwnerUserId: CLINICIAN_ID,
    resolutionState: ResolutionState.OPEN,
    createdAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

describe('deriveVisibilityState precedence (D-18 to D-21)', () => {
  it('reports FAILED whenever any failed item exists, regardless of other counts', () => {
    expect(deriveVisibilityState(counts({ failedCount: 1, conflictCount: 2, pendingCount: 3 }))).toBe(
      SyncVisibilityState.FAILED,
    );
  });

  it('reports CONFLICT when nothing failed but a conflict is open', () => {
    expect(deriveVisibilityState(counts({ conflictCount: 1, pendingCount: 3 }))).toBe(SyncVisibilityState.CONFLICT);
  });

  it('reports REPLAYING when nothing failed or conflicted but a replay is in flight', () => {
    expect(deriveVisibilityState(counts({ replayingCount: 1, pendingCount: 3 }))).toBe(SyncVisibilityState.REPLAYING);
  });

  it('reports PENDING when only backlog work remains', () => {
    expect(deriveVisibilityState(counts({ pendingCount: 3 }))).toBe(SyncVisibilityState.PENDING);
  });

  it('reports CAUGHT_UP when every count is zero', () => {
    expect(deriveVisibilityState(counts())).toBe(SyncVisibilityState.CAUGHT_UP);
  });
});

describe('badgeCopy (D-19: calm, never alarming)', () => {
  it('never uses an exclamation mark or the word "error" for any state', () => {
    for (const state of Object.values(SyncVisibilityState)) {
      const copy = badgeCopy(state, counts({ pendingCount: 2, conflictCount: 1, failedCount: 1, replayingCount: 1 }));
      expect(copy).not.toMatch(/!/);
      expect(copy.toLowerCase()).not.toContain('error');
    }
  });

  it('mentions the pending count for PENDING', () => {
    expect(badgeCopy(SyncVisibilityState.PENDING, counts({ pendingCount: 4 }))).toContain('4');
  });

  it('mentions the failed count for FAILED without alarming language', () => {
    const copy = badgeCopy(SyncVisibilityState.FAILED, counts({ failedCount: 2 }));
    expect(copy).toContain('2');
  });

  it('renders a calm all-clear message for CAUGHT_UP', () => {
    expect(badgeCopy(SyncVisibilityState.CAUGHT_UP, counts())).toMatch(/synced|caught up/i);
  });
});

describe('shouldShowRecoveryCue (D-21: subtle recovery cue, not loud celebration or silence)', () => {
  it('fires only on a genuine transition into CAUGHT_UP from a non-caught-up state', () => {
    expect(shouldShowRecoveryCue(SyncVisibilityState.PENDING, SyncVisibilityState.CAUGHT_UP)).toBe(true);
    expect(shouldShowRecoveryCue(SyncVisibilityState.FAILED, SyncVisibilityState.CAUGHT_UP)).toBe(true);
  });

  it('does not fire when there was nothing to recover from (no prior state)', () => {
    expect(shouldShowRecoveryCue(null, SyncVisibilityState.CAUGHT_UP)).toBe(false);
  });

  it('does not fire when already caught up (no repeated celebration)', () => {
    expect(shouldShowRecoveryCue(SyncVisibilityState.CAUGHT_UP, SyncVisibilityState.CAUGHT_UP)).toBe(false);
  });

  it('does not fire for any transition that does not land on CAUGHT_UP', () => {
    expect(shouldShowRecoveryCue(SyncVisibilityState.PENDING, SyncVisibilityState.REPLAYING)).toBe(false);
  });

  it('exposes a subtle (short, calm) copy string for the cue', () => {
    expect(RECOVERY_CUE_COPY.length).toBeLessThan(30);
    expect(RECOVERY_CUE_COPY).not.toMatch(/!/);
  });
});

describe('isUnresolved (D-11: unresolved items stay persistently visible)', () => {
  it.each([ResolutionState.OPEN, ResolutionState.GUIDED_RETRY, ResolutionState.ESCALATED])(
    'treats %s as still-unresolved',
    (state) => {
      expect(isUnresolved(state)).toBe(true);
    },
  );

  it('treats RESOLVED as the only state that clears an item from the failure center', () => {
    expect(isUnresolved(ResolutionState.RESOLVED)).toBe(false);
  });
});

describe('toFailureCenterItemFromTask / toFailureCenterItemFromConflict', () => {
  it('maps a SyncFailureTaskRecord with no severity (a raw envelope failure, not a domain conflict)', () => {
    const item = toFailureCenterItemFromTask(failureTask());
    expect(item).toMatchObject({
      kind: 'FAILURE_TASK',
      id: 'task_1',
      domain: 'queue',
      originatingUserId: VIEWER_ID,
      currentOwnerUserId: VIEWER_ID,
      resolutionState: ResolutionState.OPEN,
      severity: null,
    });
  });

  it('maps a SyncConflictEnvelope carrying its severity', () => {
    const item = toFailureCenterItemFromConflict(conflict());
    expect(item).toMatchObject({
      kind: 'CONFLICT',
      id: 'conflict_1',
      domain: 'emr',
      currentOwnerUserId: CLINICIAN_ID,
      severity: ConflictSeverity.SAFETY_CRITICAL,
    });
  });

  it('carries local/server payloads through so the failure center can build the structured comparison sheet (verify-fix 10.4)', () => {
    const item = toFailureCenterItemFromConflict(
      conflict({ localPayload: { assessment: 'local' }, serverPayload: { assessment: 'server' } }),
    );
    expect(item.localPayload).toEqual({ assessment: 'local' });
    expect(item.serverPayload).toEqual({ assessment: 'server' });
  });
});

describe('isClinicalConflictItem / resolveItemPressAction (verify-fix 10.4, D-08/D-09: EMR SAFETY_CRITICAL conflicts open the structured resolution sheet on tap; every other domain keeps its lighter-weight row untouched)', () => {
  it('routes an EMR SAFETY_CRITICAL conflict item (with local/server payloads) to OPEN_CLINICAL_CONFLICT_SHEET', () => {
    const item = toFailureCenterItemFromConflict(conflict());
    expect(isClinicalConflictItem(item)).toBe(true);
    expect(resolveItemPressAction(item)).toEqual({ kind: 'OPEN_CLINICAL_CONFLICT_SHEET', item });
  });

  it('does NOT route a non-EMR (e.g. inventory) domain conflict to the clinical sheet, even if SAFETY_CRITICAL', () => {
    const item = toFailureCenterItemFromConflict(conflict({ domain: 'inventory' }));
    expect(isClinicalConflictItem(item)).toBe(false);
    expect(resolveItemPressAction(item)).toEqual({ kind: 'NONE' });
  });

  it('does NOT route an EMR conflict that is only OPERATIONAL severity to the clinical sheet (D-10: lighter review)', () => {
    const item = toFailureCenterItemFromConflict(conflict({ severity: ConflictSeverity.OPERATIONAL }));
    expect(isClinicalConflictItem(item)).toBe(false);
    expect(resolveItemPressAction(item)).toEqual({ kind: 'NONE' });
  });

  it('does NOT route a raw SyncFailureTaskRecord (no severity/payload, an envelope-validation failure) to the clinical sheet even when its domain is emr', () => {
    const item = toFailureCenterItemFromTask(failureTask({ domain: 'emr' }));
    expect(isClinicalConflictItem(item)).toBe(false);
    expect(resolveItemPressAction(item)).toEqual({ kind: 'NONE' });
  });

  it('does NOT route an operational (queue/inventory-style) failure task to the clinical sheet', () => {
    const item = toFailureCenterItemFromTask(failureTask({ domain: 'queue' }));
    expect(resolveItemPressAction(item)).toEqual({ kind: 'NONE' });
  });
});

describe('groupFailureCenterItems (D-20, D-22 to D-24)', () => {
  it('puts an OPEN/GUIDED_RETRY item owned by the viewer into "needs your retry"', () => {
    const items: FailureCenterItem[] = [
      toFailureCenterItemFromTask(failureTask({ currentOwnerUserId: VIEWER_ID, resolutionState: ResolutionState.OPEN })),
    ];
    const groups = groupFailureCenterItems(items, VIEWER_ID);
    expect(groups.needsYourRetry).toHaveLength(1);
    expect(groups.escalatedToClinician).toHaveLength(0);
    expect(groups.operationalReview).toHaveLength(0);
  });

  it('puts any ESCALATED item into "escalated to clinician", regardless of who currently owns it', () => {
    const items: FailureCenterItem[] = [
      toFailureCenterItemFromConflict(
        conflict({ resolutionState: ResolutionState.ESCALATED, resolutionOwnerUserId: CLINICIAN_ID }),
      ),
    ];
    const groups = groupFailureCenterItems(items, VIEWER_ID);
    expect(groups.escalatedToClinician).toHaveLength(1);
    expect(groups.needsYourRetry).toHaveLength(0);
  });

  it('puts an unresolved item owned by someone else and not escalated into "operational review"', () => {
    const items: FailureCenterItem[] = [
      toFailureCenterItemFromTask(
        failureTask({ currentOwnerUserId: OTHER_CLINICIAN_ID, resolutionState: ResolutionState.GUIDED_RETRY }),
      ),
    ];
    const groups = groupFailureCenterItems(items, VIEWER_ID);
    expect(groups.operationalReview).toHaveLength(1);
    expect(groups.needsYourRetry).toHaveLength(0);
    expect(groups.escalatedToClinician).toHaveLength(0);
  });

  it('routes a non-safety-critical (operational) ESCALATED item to "operational review", not "escalated to clinician" (D-10: lighter review, no clinician hand-off)', () => {
    const items: FailureCenterItem[] = [
      toFailureCenterItemFromConflict(
        conflict({ severity: ConflictSeverity.OPERATIONAL, resolutionState: ResolutionState.ESCALATED }),
      ),
    ];
    const groups = groupFailureCenterItems(items, VIEWER_ID);
    expect(groups.escalatedToClinician).toHaveLength(0);
    expect(groups.operationalReview).toHaveLength(1);
  });

  it('excludes RESOLVED items from every group (cleared, not merely deprioritized)', () => {
    const items: FailureCenterItem[] = [
      toFailureCenterItemFromTask(failureTask({ resolutionState: ResolutionState.RESOLVED })),
    ];
    const groups = groupFailureCenterItems(items, VIEWER_ID);
    expect(groups.needsYourRetry).toHaveLength(0);
    expect(groups.escalatedToClinician).toHaveLength(0);
    expect(groups.operationalReview).toHaveLength(0);
  });

  it('keeps every mutually-exclusive bucket populated correctly for a mixed batch', () => {
    const items: FailureCenterItem[] = [
      toFailureCenterItemFromTask(failureTask({ taskId: 't1', currentOwnerUserId: VIEWER_ID, resolutionState: ResolutionState.OPEN })),
      toFailureCenterItemFromConflict(
        conflict({ conflictId: 'c1', resolutionState: ResolutionState.ESCALATED, resolutionOwnerUserId: OTHER_CLINICIAN_ID }),
      ),
      toFailureCenterItemFromTask(
        failureTask({ taskId: 't2', currentOwnerUserId: OTHER_CLINICIAN_ID, resolutionState: ResolutionState.GUIDED_RETRY }),
      ),
    ];
    const groups = groupFailureCenterItems(items, VIEWER_ID);
    expect(groups.needsYourRetry.map((i) => i.id)).toEqual(['t1']);
    expect(groups.escalatedToClinician.map((i) => i.id)).toEqual(['c1']);
    expect(groups.operationalReview.map((i) => i.id)).toEqual(['t2']);
  });
});

describe('syncUiStore (Plan 10-05 Task 1)', () => {
  beforeEach(() => {
    useSyncUiStore.getState().reset();
  });

  it('starts with a null previous state and CAUGHT_UP current state so the first real update never fires a bogus recovery cue', () => {
    const state = useSyncUiStore.getState();
    expect(state.visibilityState).toBe(SyncVisibilityState.CAUGHT_UP);
    expect(state.showRecoveryCue).toBe(false);
  });

  it('setSummary updates counts and visibility state', () => {
    useSyncUiStore.getState().setSummary(counts({ pendingCount: 5 }));
    expect(useSyncUiStore.getState().visibilityState).toBe(SyncVisibilityState.PENDING);
    expect(useSyncUiStore.getState().counts.pendingCount).toBe(5);
  });

  it('sets showRecoveryCue true only on a genuine PENDING -> CAUGHT_UP transition, and dismissRecoveryCue clears it', () => {
    useSyncUiStore.getState().setSummary(counts({ pendingCount: 2 }));
    expect(useSyncUiStore.getState().showRecoveryCue).toBe(false);

    useSyncUiStore.getState().setSummary(counts());
    expect(useSyncUiStore.getState().showRecoveryCue).toBe(true);

    useSyncUiStore.getState().dismissRecoveryCue();
    expect(useSyncUiStore.getState().showRecoveryCue).toBe(false);
  });

  it('setFailureItems stores the failure-center items', () => {
    const items = [toFailureCenterItemFromTask(failureTask())];
    useSyncUiStore.getState().setFailureItems(items);
    expect(useSyncUiStore.getState().failureItems).toEqual(items);
  });
});

describe('SyncStatusBadge.tsx component contract (D-18 to D-21)', () => {
  const source = componentSource('components/SyncStatusBadge.tsx');

  it('exports SyncStatusBadge', () => {
    expect(source).toMatch(/export function SyncStatusBadge/);
  });

  it('derives its copy and visibility state from the shared lib rather than inline strings', () => {
    expect(source).toMatch(/badgeCopy/);
    expect(source).toMatch(/deriveVisibilityState|visibilityState/);
  });

  it('renders the subtle recovery cue via shouldShowRecoveryCue rather than a blocking modal/alert', () => {
    expect(source).toMatch(/shouldShowRecoveryCue|showRecoveryCue/);
    expect(source).not.toMatch(/Alert\.alert/);
  });
});

describe('SyncFailureCenterScreen.tsx component contract (D-20, D-22 to D-24, D-11)', () => {
  const source = componentSource('screens/SyncFailureCenterScreen.tsx');

  it('exports SyncFailureCenterScreen', () => {
    expect(source).toMatch(/export function SyncFailureCenterScreen/);
  });

  it('groups items via the shared groupFailureCenterItems helper', () => {
    expect(source).toMatch(/groupFailureCenterItems/);
  });

  it('labels the three sections explicitly', () => {
    expect(source).toMatch(/Needs your retry/);
    expect(source).toMatch(/Escalated to clinician/);
    expect(source).toMatch(/Operational review/);
  });

  it('surfaces originating user and current owner, not just a bare operation id', () => {
    expect(source).toMatch(/originatingUserId/);
    expect(source).toMatch(/currentOwnerUserId/);
  });

  it('offers a guided retry action', () => {
    expect(source).toMatch(/onRetry|onGuidedRetry/);
  });

  it('mounts the structured ClinicalConflictResolutionSheet rather than only the generic row (verify-fix 10.4, D-08)', () => {
    expect(source).toMatch(/import\s*\{\s*ClinicalConflictResolutionSheet\s*\}\s*from\s*'\.\.\/\.\.\/consultation\/components\/ClinicalConflictResolutionSheet'/);
    expect(source).toMatch(/<ClinicalConflictResolutionSheet/);
  });

  it('gates opening the sheet on resolveItemPressAction/isClinicalConflictItem, not an unconditional mount (verify-fix 10.4)', () => {
    expect(source).toMatch(/resolveItemPressAction/);
    expect(source).toMatch(/isClinicalConflictItem/);
  });

  it('only wraps a clinical-conflict row in a pressable tap target, leaving non-clinical (operational) rows\' markup untouched', () => {
    expect(source).toMatch(/isClinicalConflictItem\(item\)/);
    expect(source).toMatch(/sync-failure-clinical-trigger-/);
  });
});

describe('useSyncStatus.ts hook contract (key link: reflects retry ownership/escalation from persisted failure tasks)', () => {
  const source = componentSource('hooks/useSyncStatus.ts');

  it('exports useSyncStatus', () => {
    expect(source).toMatch(/export function useSyncStatus/);
  });

  it('reads guidedRetryCount-bearing local failure/conflict tables through the shared sync-status lib', () => {
    expect(source).toMatch(/toFailureCenterItemFromTask/);
    expect(source).toMatch(/toFailureCenterItemFromConflict/);
  });

  it('writes into the shared syncUiStore rather than keeping its own parallel state', () => {
    expect(source).toMatch(/useSyncUiStore/);
  });
});
