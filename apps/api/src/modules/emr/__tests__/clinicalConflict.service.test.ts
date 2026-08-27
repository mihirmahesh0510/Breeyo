import { describe, it, expect } from 'vitest';
import { ConflictSeverity } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';
import {
  ClinicalConflictService,
  classifyClinicalConflict,
  CLINICAL_DRAFT_FIELDS,
} from '../services/clinicalConflict.service.js';

const CLINICIAN_ID = '00000000-0000-0000-0000-000000000099';

function baseline(overrides: Partial<SaveDraftInput> = {}): SaveDraftInput {
  return {
    vitals: { weightKg: 10, temperatureC: null, heartRateBpm: null, respiratoryRate: null },
    subjective: { ownerReports: 'Lethargic since morning', history: '', chips: [] },
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

describe('classifyClinicalConflict (D-05 to D-09)', () => {
  it('reports no conflict and an unchanged mergedPayload when neither side touched anything', () => {
    const draft = baseline();
    const result = classifyClinicalConflict({
      baseline: draft,
      local: draft,
      server: draft,
      assignedClinicianId: CLINICIAN_ID,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.severity).toBeNull();
    expect(result.conflictingFields).toEqual([]);
    expect(result.safeMergeFields).toEqual([]);
    expect(result.mergedPayload).toEqual(draft);
    expect(result.recommendedOwnerUserId).toBeUndefined();
  });

  it('D-07: safely auto-merges a field the offline device changed that the server never touched (appending an untouched note section)', () => {
    const base = baseline();
    const local = { ...base, careInstructions: 'Keep the cone on for 7 days.' };
    const server = base; // server draft unchanged since baseline

    const result = classifyClinicalConflict({
      baseline: base,
      local,
      server,
      assignedClinicianId: CLINICIAN_ID,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.severity).toBeNull();
    expect(result.safeMergeFields).toEqual(['careInstructions']);
    expect(result.conflictingFields).toEqual([]);
    expect(result.mergedPayload.careInstructions).toBe('Keep the cone on for 7 days.');
    // Untouched fields keep the server's copy.
    expect(result.mergedPayload.subjective).toEqual(base.subjective);
  });

  it('merges independent non-overlapping fields from both sides without flagging either as a conflict', () => {
    const base = baseline();
    const local = { ...base, careInstructions: 'Local addition.' };
    const server = { ...base, vitals: { ...base.vitals!, weightKg: 12 } };

    const result = classifyClinicalConflict({
      baseline: base,
      local,
      server,
      assignedClinicianId: CLINICIAN_ID,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.safeMergeFields).toEqual(['careInstructions']);
    expect(result.mergedPayload.careInstructions).toBe('Local addition.');
    expect(result.mergedPayload.vitals).toEqual({ ...base.vitals, weightKg: 12 });
  });

  it('does not treat a server-only change as a safe-merge field (nothing local to apply)', () => {
    const base = baseline();
    const local = base;
    const server = { ...base, assessment: 'Vet B already wrote an assessment.' };

    const result = classifyClinicalConflict({
      baseline: base,
      local,
      server,
      assignedClinicianId: CLINICIAN_ID,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.safeMergeFields).toEqual([]);
    expect(result.mergedPayload.assessment).toBe('Vet B already wrote an assessment.');
  });

  it('treats both sides converging on the identical value as a non-conflict', () => {
    const base = baseline();
    const local = { ...base, assessment: 'Suspected gastroenteritis.' };
    const server = { ...base, assessment: 'Suspected gastroenteritis.' };

    const result = classifyClinicalConflict({
      baseline: base,
      local,
      server,
      assignedClinicianId: CLINICIAN_ID,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.conflictingFields).toEqual([]);
    expect(result.mergedPayload.assessment).toBe('Suspected gastroenteritis.');
  });

  describe('D-06/D-24: broad auto-merge is REJECTED for genuinely overlapping clinical edits', () => {
    it('classifies SAFETY_CRITICAL and recommends the assigned clinician when both sides changed the same field to different values', () => {
      const base = baseline();
      const local = { ...base, assessment: 'Local vet: suspected pancreatitis.' };
      const server = { ...base, assessment: 'Other vet: suspected renal failure.' };

      const result = classifyClinicalConflict({
        baseline: base,
        local,
        server,
        assignedClinicianId: CLINICIAN_ID,
      });

      expect(result.hasConflict).toBe(true);
      expect(result.severity).toBe(ConflictSeverity.SAFETY_CRITICAL);
      expect(result.conflictingFields).toEqual(['assessment']);
      // D-09/D-24: clinician ownership assignment.
      expect(result.recommendedOwnerUserId).toBe(CLINICIAN_ID);
    });

    it('never overwrites the conflicting field in mergedPayload with the local value (no silent last-write-wins)', () => {
      const base = baseline();
      const local = { ...base, assessment: 'Local diagnosis.' };
      const server = { ...base, assessment: 'Server diagnosis (written by another device).' };

      const result = classifyClinicalConflict({
        baseline: base,
        local,
        server,
        assignedClinicianId: CLINICIAN_ID,
      });

      expect(result.mergedPayload.assessment).toBe('Server diagnosis (written by another device).');
      expect(result.mergedPayload.assessment).not.toBe('Local diagnosis.');
    });

    it('still safely merges an untouched-by-server field alongside a genuine conflict elsewhere (per-field granularity)', () => {
      const base = baseline();
      const local = { ...base, assessment: 'Local diagnosis.', careInstructions: 'Local-only addition.' };
      const server = { ...base, assessment: 'Server diagnosis.' };

      const result = classifyClinicalConflict({
        baseline: base,
        local,
        server,
        assignedClinicianId: CLINICIAN_ID,
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingFields).toEqual(['assessment']);
      expect(result.safeMergeFields).toEqual(['careInstructions']);
      expect(result.mergedPayload.careInstructions).toBe('Local-only addition.');
      expect(result.mergedPayload.assessment).toBe('Server diagnosis.');
    });

    it('flags overlapping vitals edits (both devices recorded a different weight) as SAFETY_CRITICAL rather than auto-merging', () => {
      const base = baseline();
      const local = { ...base, vitals: { ...base.vitals!, weightKg: 11.2 } };
      const server = { ...base, vitals: { ...base.vitals!, weightKg: 10.8 } };

      const result = classifyClinicalConflict({
        baseline: base,
        local,
        server,
        assignedClinicianId: CLINICIAN_ID,
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingFields).toEqual(['vitals']);
      expect(result.mergedPayload.vitals).toEqual(server.vitals);
    });

    it('flags overlapping prescription-list edits as SAFETY_CRITICAL rather than array-merging them', () => {
      const base = baseline();
      const local = {
        ...base,
        prescriptions: [{ drugName: 'Amoxicillin', formulation: 'tablet', strength: '250mg', dosage: '1', route: 'oral', frequency: 'BID', duration: '7 days', sortOrder: 0 } as any],
      };
      const server = {
        ...base,
        prescriptions: [{ drugName: 'Metronidazole', formulation: 'tablet', strength: '400mg', dosage: '1', route: 'oral', frequency: 'BID', duration: '5 days', sortOrder: 0 } as any],
      };

      const result = classifyClinicalConflict({
        baseline: base,
        local,
        server,
        assignedClinicianId: CLINICIAN_ID,
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingFields).toEqual(['prescriptions']);
      expect(result.mergedPayload.prescriptions).toEqual(server.prescriptions);
    });
  });

  it('exposes the fixed clinical draft field list used for diffing', () => {
    expect(CLINICAL_DRAFT_FIELDS).toContain('vitals');
    expect(CLINICAL_DRAFT_FIELDS).toContain('subjective');
    expect(CLINICAL_DRAFT_FIELDS).toContain('assessment');
    expect(CLINICAL_DRAFT_FIELDS).toContain('prescriptions');
  });

  it('ClinicalConflictService.classifyClinicalConflict delegates to the same classification logic', () => {
    const base = baseline();
    const local = { ...base, assessment: 'A' };
    const server = { ...base, assessment: 'B' };
    const service = new ClinicalConflictService();

    const result = service.classifyClinicalConflict({
      baseline: base,
      local,
      server,
      assignedClinicianId: CLINICIAN_ID,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.recommendedOwnerUserId).toBe(CLINICIAN_ID);
  });
});
