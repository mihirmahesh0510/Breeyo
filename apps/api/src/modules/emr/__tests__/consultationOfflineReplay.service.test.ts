import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictSeverity, ReplayPriority, ResolutionState } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';
import {
  ConsultationOfflineReplayService,
  EMR_SYNC_DOMAIN,
  CONSULTATION_DRAFT_ENTITY_TYPE,
  type ConsultationOfflineReplayGateway,
  type ConsultationReplayReceiptStore,
  type ClinicalConflictRecordStore,
  type ConsultationRecord,
} from '../services/consultationOfflineReplay.service.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const VET_ID = '00000000-0000-0000-0000-000000000099';
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000200';
const DEVICE_A = 'device-a';

function baseline(): SaveDraftInput {
  return {
    vitals: { weightKg: 10, temperatureC: null, heartRateBpm: null, respiratoryRate: null },
    subjective: { ownerReports: 'Lethargic', history: '', chips: [] },
    objective: { bodySystems: [], notes: '' },
    assessment: '',
    plan: { actionItems: [], freeText: '' },
    careInstructions: '',
    referral: null,
    rxNotes: '',
    prescriptions: [],
  };
}

function envelope(overrides: Record<string, unknown> = {}, payloadOverrides: Record<string, unknown> = {}) {
  return {
    deviceId: DEVICE_A,
    operationId: 'op-1',
    clinicId: CLINIC_ID,
    userId: USER_ID,
    domain: EMR_SYNC_DOMAIN,
    entityType: CONSULTATION_DRAFT_ENTITY_TYPE,
    entityId: CONSULTATION_ID,
    priority: ReplayPriority.CLINICAL_MEDIUM,
    createdAt: '2026-08-24T09:00:00.000Z',
    payload: {
      baseline: baseline(),
      draft: baseline(),
      ...payloadOverrides,
    },
    ...overrides,
  };
}

function makeConsultation(overrides: Partial<ConsultationRecord> = {}): ConsultationRecord {
  return {
    id: CONSULTATION_ID,
    clinicId: CLINIC_ID,
    vetId: VET_ID,
    status: 'draft',
    ...overrides,
  };
}

function createMockGateway(): ConsultationOfflineReplayGateway {
  return {
    getConsultation: vi.fn().mockResolvedValue(makeConsultation()),
    loadDraft: vi.fn().mockResolvedValue(baseline()),
    saveDraft: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockReceipts(): ConsultationReplayReceiptStore {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ operationId: 'op-1' }),
  };
}

function createMockConflictRecords(): ClinicalConflictRecordStore {
  return {
    create: vi.fn().mockResolvedValue({ id: 'conflict-1' }),
  };
}

const context = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_A };

describe('ConsultationOfflineReplayService', () => {
  let gateway: ReturnType<typeof createMockGateway>;
  let receipts: ReturnType<typeof createMockReceipts>;
  let conflictRecords: ReturnType<typeof createMockConflictRecords>;
  let service: ConsultationOfflineReplayService;

  beforeEach(() => {
    gateway = createMockGateway();
    receipts = createMockReceipts();
    conflictRecords = createMockConflictRecords();
    service = new ConsultationOfflineReplayService(gateway, receipts, conflictRecords);
  });

  describe('idempotency', () => {
    it('applies a new consultation draft replay exactly once and records a replay receipt', async () => {
      const result = await service.replayConsultationDraft(context, envelope());

      expect(result.status).toBe('APPLIED');
      expect(receipts.create).toHaveBeenCalledTimes(1);
    });

    it('acknowledges a duplicate/flapping replay of an already-processed operation as a no-op', async () => {
      vi.mocked(receipts.findUnique).mockResolvedValue({ operationId: 'op-1' });

      const result = await service.replayConsultationDraft(context, envelope());

      expect(result.status).toBe('ACKNOWLEDGED_DUPLICATE');
      expect(gateway.saveDraft).not.toHaveBeenCalled();
      expect(conflictRecords.create).not.toHaveBeenCalled();
      expect(receipts.create).not.toHaveBeenCalled();
    });
  });

  describe('rejection cases', () => {
    it('rejects a malformed envelope without touching the gateway', async () => {
      const result = await service.replayConsultationDraft(context, { operationId: 'bad' });
      expect(result.status).toBe('REJECTED');
      expect(gateway.getConsultation).not.toHaveBeenCalled();
    });

    it('rejects an envelope for an unsupported entityType', async () => {
      const result = await service.replayConsultationDraft(context, envelope({ entityType: 'SOMETHING_ELSE' }));
      expect(result.status).toBe('REJECTED');
    });

    it('rejects when the consultation does not belong to this clinic', async () => {
      vi.mocked(gateway.getConsultation).mockResolvedValue(null);

      const result = await service.replayConsultationDraft(context, envelope());

      expect(result.status).toBe('REJECTED');
      expect(gateway.saveDraft).not.toHaveBeenCalled();
    });
  });

  describe('safe auto-merge (D-07)', () => {
    it('applies a non-overlapping offline edit directly to the live draft', async () => {
      const base = baseline();
      const local = { ...base, careInstructions: 'Offline-only addition.' };
      vi.mocked(gateway.loadDraft).mockResolvedValue(base);

      const result = await service.replayConsultationDraft(
        context,
        envelope({}, { baseline: base, draft: local }),
      );

      expect(result.status).toBe('APPLIED');
      expect(gateway.saveDraft).toHaveBeenCalledWith(
        CONSULTATION_ID,
        CLINIC_ID,
        expect.objectContaining({ careInstructions: 'Offline-only addition.' }),
      );
      expect(conflictRecords.create).not.toHaveBeenCalled();
    });

    it('is a no-op write when the offline device made no real changes', async () => {
      const base = baseline();
      vi.mocked(gateway.loadDraft).mockResolvedValue(base);

      const result = await service.replayConsultationDraft(context, envelope({}, { baseline: base, draft: base }));

      expect(result.status).toBe('APPLIED');
      expect(gateway.saveDraft).not.toHaveBeenCalled();
    });
  });

  describe('SAFETY_CRITICAL clinical conflicts (D-05, D-06, D-09, D-24)', () => {
    it('creates a structured conflict record instead of silently overwriting an overlapping field, and never calls saveDraft', async () => {
      const base = baseline();
      const local = { ...base, assessment: 'Offline device: suspected pancreatitis.' };
      const liveServerDraft = { ...base, assessment: 'Another device: suspected renal failure.' };
      vi.mocked(gateway.loadDraft).mockResolvedValue(liveServerDraft);

      const result = await service.replayConsultationDraft(
        context,
        envelope({}, { baseline: base, draft: local }),
      );

      expect(result.status).toBe('CONFLICT_CREATED');
      expect(gateway.saveDraft).not.toHaveBeenCalled();
      expect(conflictRecords.create).toHaveBeenCalledTimes(1);

      const createArgs = vi.mocked(conflictRecords.create).mock.calls[0][0].data as Record<string, unknown>;
      expect(createArgs.severity).toBe(ConflictSeverity.SAFETY_CRITICAL);
      expect(createArgs.entityId).toBe(CONSULTATION_ID);
      expect(createArgs.domain).toBe(EMR_SYNC_DOMAIN);
      // D-08: both full payloads must be captured for explicit comparison.
      expect(createArgs.localPayloadJson).toEqual(local);
      expect(createArgs.serverPayloadJson).toEqual(liveServerDraft);
      // D-09/D-24: the assigned clinician (the consultation's own vetId) owns
      // resolution -- both the recommendation and the actual resolution
      // owner, since a consultation always has a definite assigned vet.
      expect(createArgs.recommendedOwnerUserId).toBe(VET_ID);
      expect(createArgs.resolutionOwnerUserId).toBe(VET_ID);
      expect(createArgs.resolutionState).toBe(ResolutionState.OPEN);
    });

    it('still records a replay receipt for a conflict so a flapping resend of the SAME operationId does not create a duplicate conflict record', async () => {
      const base = baseline();
      const local = { ...base, assessment: 'A' };
      vi.mocked(gateway.loadDraft).mockResolvedValue({ ...base, assessment: 'B' });

      await service.replayConsultationDraft(context, envelope({}, { baseline: base, draft: local }));

      expect(receipts.create).toHaveBeenCalledTimes(1);
    });

    it('never silently overwrites the disputed field even when other fields safely merge in the same replay', async () => {
      const base = baseline();
      const local = { ...base, assessment: 'Local diagnosis.', careInstructions: 'Local-only addition.' };
      vi.mocked(gateway.loadDraft).mockResolvedValue({ ...base, assessment: 'Server diagnosis.' });

      const result = await service.replayConsultationDraft(
        context,
        envelope({}, { baseline: base, draft: local }),
      );

      // D-06: clinical records are the most protected domain -- when ANY
      // field genuinely conflicts, the whole replay is held for review
      // rather than partially applying the safe fields underneath it.
      expect(result.status).toBe('CONFLICT_CREATED');
      expect(gateway.saveDraft).not.toHaveBeenCalled();
    });
  });
});
