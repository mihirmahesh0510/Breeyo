/**
 * `apps/mobile` runs vitest in a `node` environment with no Metro/Babel
 * transform, so `import 'react-native'` fails at parse time and
 * `react-test-renderer` is not installed (same constraint documented in
 * `QueueBoard.test.tsx` and `PaymentCollectionSheet.test.tsx`). Every
 * decision `ClinicalConflictResolutionSheet.tsx` makes lives in the
 * RN-free `lib/clinical-conflict-resolution.ts` and is exercised directly
 * here; the handful of assertions that are genuinely about the component
 * tree (the five explicit action affordances, and that the sheet renders
 * unconditionally while the conflict is unresolved) are made by reading the
 * component source off disk, the same technique `PaymentCollectionSheet.test.tsx`
 * uses for its QR props/absent-polling-timer checks.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConflictSeverity, ResolutionState } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';
import {
  CLINICAL_CONFLICT_RESOLUTION_ACTIONS,
  CLINICAL_FIELD_LABELS,
  buildFieldComparisonRows,
  isMergeSafeFieldsAvailable,
  isUnresolved,
  escalationOwnerLabel,
  availableActions,
  type ClinicalConflictSummary,
} from '../lib/clinical-conflict-resolution';

function componentSource(): string {
  return readFileSync(join(__dirname, '..', 'components', 'ClinicalConflictResolutionSheet.tsx'), 'utf8');
}

function draft(overrides: Partial<SaveDraftInput> = {}): SaveDraftInput {
  return {
    vitals: { weightKg: 10, temperatureC: null, heartRateBpm: null, respiratoryRate: null },
    subjective: { ownerReports: '', history: '', chips: [] },
    objective: { bodySystems: [], notes: '' },
    assessment: '',
    plan: { actionItems: [], freeText: '' },
    careInstructions: '',
    referral: null,
    rxNotes: '',
    prescriptions: [],
    ...overrides,
  };
}

const CLINICIAN_ID = 'vet-99';

function conflict(overrides: Partial<ClinicalConflictSummary> = {}): ClinicalConflictSummary {
  return {
    conflictId: 'conflict-1',
    entityId: 'consultation-1',
    severity: ConflictSeverity.SAFETY_CRITICAL,
    conflictingFields: ['assessment'],
    safeMergeFields: [],
    localPayload: draft({ assessment: 'Local diagnosis.' }),
    serverPayload: draft({ assessment: 'Server diagnosis.' }),
    recommendedOwnerUserId: CLINICIAN_ID,
    resolutionState: ResolutionState.OPEN,
    ...overrides,
  };
}

describe('clinical-conflict-resolution (Plan 10-03 Task 2, D-05, D-08, D-09, D-11, D-24)', () => {
  describe('buildFieldComparisonRows', () => {
    it('builds an explicit local-vs-server row for every conflicting field, never a generic message', () => {
      const c = conflict({ conflictingFields: ['assessment', 'careInstructions'] });
      const rows = buildFieldComparisonRows(c);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        field: 'assessment',
        label: CLINICAL_FIELD_LABELS.assessment,
        localValue: c.localPayload.assessment,
        serverValue: c.serverPayload.assessment,
      });
      expect(rows[1].field).toBe('careInstructions');
    });

    it('produces no rows when there is nothing in dispute', () => {
      expect(buildFieldComparisonRows(conflict({ conflictingFields: [] }))).toEqual([]);
    });
  });

  describe('isMergeSafeFieldsAvailable / availableActions', () => {
    it('omits MERGE_SAFE_FIELDS entirely when nothing is safe to merge (never offers a silent no-op action)', () => {
      const c = conflict({ safeMergeFields: [] });
      expect(isMergeSafeFieldsAvailable(c)).toBe(false);
      expect(availableActions(c)).not.toContain('MERGE_SAFE_FIELDS');
      expect(availableActions(c)).toEqual(['KEEP_LOCAL', 'KEEP_SERVER', 'RETRY', 'ESCALATE']);
    });

    it('includes MERGE_SAFE_FIELDS when at least one field is safely mergeable', () => {
      const c = conflict({ safeMergeFields: ['careInstructions'] });
      expect(isMergeSafeFieldsAvailable(c)).toBe(true);
      expect(availableActions(c)).toEqual(CLINICAL_CONFLICT_RESOLUTION_ACTIONS.slice());
    });
  });

  describe('isUnresolved (D-11: unresolved conflicts stay persistently visible)', () => {
    it.each([ResolutionState.OPEN, ResolutionState.GUIDED_RETRY, ResolutionState.ESCALATED])(
      'treats %s as still-unresolved (sheet/list entry stays visible)',
      (state) => {
        expect(isUnresolved(state)).toBe(true);
      },
    );

    it('treats RESOLVED as the only state that clears the sheet', () => {
      expect(isUnresolved(ResolutionState.RESOLVED)).toBe(false);
    });
  });

  describe('escalationOwnerLabel (D-09/D-24: clinician ownership)', () => {
    it('resolves the recommended clinician\'s display name for a SAFETY_CRITICAL conflict', () => {
      const c = conflict({ recommendedOwnerUserId: CLINICIAN_ID, severity: ConflictSeverity.SAFETY_CRITICAL });
      const label = escalationOwnerLabel(c, (id) => (id === CLINICIAN_ID ? 'Dr. Mehta' : 'Unknown'));
      expect(label).toBe('Dr. Mehta');
    });

    it('returns null for a non-SAFETY_CRITICAL conflict (this sheet is never shown for those, but the helper stays defensive)', () => {
      const c = conflict({ severity: ConflictSeverity.OPERATIONAL, recommendedOwnerUserId: CLINICIAN_ID });
      expect(escalationOwnerLabel(c, () => 'Dr. Mehta')).toBeNull();
    });

    it('returns null when no owner has been assigned', () => {
      const c = conflict({ recommendedOwnerUserId: undefined });
      expect(escalationOwnerLabel(c, () => 'Dr. Mehta')).toBeNull();
    });
  });

  describe('ClinicalConflictResolutionSheet.tsx component contract', () => {
    const source = componentSource();

    it('exports ClinicalConflictResolutionSheet', () => {
      expect(source).toMatch(/export function ClinicalConflictResolutionSheet/);
    });

    it('renders all five explicit resolution actions, not a generic retry toast', () => {
      expect(source).toMatch(/onKeepLocal/);
      expect(source).toMatch(/onKeepServer/);
      expect(source).toMatch(/onMergeSafeFields/);
      expect(source).toMatch(/onRetry/);
      expect(source).toMatch(/onEscalate/);
    });

    it('renders the structured field comparison via buildFieldComparisonRows rather than a plain diff string', () => {
      expect(source).toMatch(/buildFieldComparisonRows/);
    });

    it('gates visibility on isUnresolved rather than always-mounted or never-dismissible', () => {
      expect(source).toMatch(/isUnresolved/);
    });

    it('names the assigned clinician via escalationOwnerLabel rather than a bare user id', () => {
      expect(source).toMatch(/escalationOwnerLabel/);
    });
  });
});
