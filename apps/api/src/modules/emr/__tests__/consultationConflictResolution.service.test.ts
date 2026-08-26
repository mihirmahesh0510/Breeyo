import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResolutionState } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';
import {
  ConsultationConflictResolutionService,
  type ConsultationConflictResolutionGateway,
  type ConflictResolutionRecordStore,
  type ConflictRecordRow,
} from '../services/consultationConflictResolution.service.js';
import { EMR_SYNC_DOMAIN, CONSULTATION_DRAFT_ENTITY_TYPE } from '../services/consultationOfflineReplay.service.js';
import type { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';
import type { OnDutyRosterProvider } from '../../sync/services/retryEscalation.service.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_CLINIC_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const VET_ID = '00000000-0000-0000-0000-000000000099';
const OTHER_VET_ID = '00000000-0000-0000-0000-000000000098';
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000200';
const OTHER_CONSULTATION_ID = '00000000-0000-0000-0000-000000000201';
const CONFLICT_ID = '00000000-0000-0000-0000-000000000300';

function baseline(overrides: Partial<SaveDraftInput> = {}): SaveDraftInput {
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
    ...overrides,
  };
}

function makeRecord(overrides: Partial<ConflictRecordRow> = {}): ConflictRecordRow {
  return {
    id: CONFLICT_ID,
    clinicId: CLINIC_ID,
    domain: EMR_SYNC_DOMAIN,
    entityType: CONSULTATION_DRAFT_ENTITY_TYPE,
    entityId: CONSULTATION_ID,
    severity: 'SAFETY_CRITICAL',
    baselinePayloadJson: baseline(),
    localPayloadJson: baseline({ assessment: 'Offline device: suspected pancreatitis.' }),
    serverPayloadJson: baseline({ assessment: 'Another device: suspected renal failure.' }),
    recommendedOwnerUserId: VET_ID,
    currentOwnerUserId: VET_ID,
    resolutionState: ResolutionState.OPEN,
    ...overrides,
  };
}

function createMockGateway(overrides: Partial<ConsultationConflictResolutionGateway> = {}): ConsultationConflictResolutionGateway {
  return {
    getConsultation: vi.fn().mockResolvedValue({ id: CONSULTATION_ID, clinicId: CLINIC_ID, status: 'draft' }),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    addAddendum: vi.fn().mockResolvedValue({ id: 'addendum-1' }),
    ...overrides,
  };
}

function createMockStore(record: ConflictRecordRow | null = makeRecord()): ConflictResolutionRecordStore {
  let current = record;
  return {
    findFirst: vi.fn(async ({ where }) => {
      if (!current) return null;
      if (current.id !== where.id || current.clinicId !== where.clinicId) return null;
      return current;
    }),
    update: vi.fn(async ({ data }) => {
      current = { ...(current as ConflictRecordRow), ...data };
      return current as ConflictRecordRow;
    }),
  };
}

function createMockBroadcast(): ReplayBroadcastService {
  return {
    emitReplayApplied: vi.fn(),
    emitReplayConflictOpened: vi.fn(),
    emitReplayFailureEscalated: vi.fn(),
  } as unknown as ReplayBroadcastService;
}

function makeRosterProvider(clinicianIds: string[]): OnDutyRosterProvider {
  return {
    listOtherOnDutyClinicianIds: vi.fn(async (_clinicId: string, excludeUserId: string) =>
      clinicianIds.filter((id) => id !== excludeUserId),
    ),
  };
}

const context = { clinicId: CLINIC_ID, userId: USER_ID, userName: 'Dr Test' };

describe('ConsultationConflictResolutionService (verify-fix 10.5)', () => {
  let gateway: ConsultationConflictResolutionGateway;
  let store: ConflictResolutionRecordStore;
  let broadcast: ReplayBroadcastService;
  let service: ConsultationConflictResolutionService;

  beforeEach(() => {
    gateway = createMockGateway();
    store = createMockStore();
    broadcast = createMockBroadcast();
    service = new ConsultationConflictResolutionService(gateway, store, broadcast);
  });

  it('KEEP_LOCAL: writes the full local payload to the draft and resolves the conflict', async () => {
    const outcome = await service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'KEEP_LOCAL');

    expect(gateway.saveDraft).toHaveBeenCalledWith(
      CONSULTATION_ID,
      CLINIC_ID,
      expect.objectContaining({ assessment: 'Offline device: suspected pancreatitis.' }),
    );
    expect(gateway.addAddendum).not.toHaveBeenCalled();
    expect(outcome.resolutionState).toBe('RESOLVED');
    expect(outcome.appliedFields).toContain('assessment');

    const updated = await store.findFirst({ where: { id: CONFLICT_ID, clinicId: CLINIC_ID } });
    expect(updated?.resolutionState).toBe(ResolutionState.RESOLVED);
    expect(broadcast.emitReplayApplied).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      domain: EMR_SYNC_DOMAIN,
      entityIds: [CONSULTATION_ID],
    });
  });

  it('KEEP_SERVER: never writes the draft (server payload is already live) but still resolves the conflict', async () => {
    const outcome = await service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'KEEP_SERVER');

    expect(gateway.saveDraft).not.toHaveBeenCalled();
    expect(gateway.addAddendum).not.toHaveBeenCalled();
    expect(outcome.resolutionState).toBe('RESOLVED');
    expect(outcome.appliedFields).toEqual([]);

    const updated = await store.findFirst({ where: { id: CONFLICT_ID, clinicId: CLINIC_ID } });
    expect(updated?.resolutionState).toBe(ResolutionState.RESOLVED);
  });

  it('MERGE_SAFE_FIELDS: applies only fields the offline device alone changed since the baseline, keeping the disputed field at the server value', async () => {
    const base = baseline();
    const record = makeRecord({
      baselinePayloadJson: base,
      // Offline device changed BOTH `careInstructions` (server never
      // touched it -- safe) and `assessment` (server also changed it --
      // disputed).
      localPayloadJson: { ...base, careInstructions: 'Keep the cone on.', assessment: 'Offline: pancreatitis.' },
      serverPayloadJson: { ...base, assessment: 'Server: renal failure.' },
    });
    store = createMockStore(record);
    service = new ConsultationConflictResolutionService(gateway, store, broadcast);

    const outcome = await service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'MERGE_SAFE_FIELDS');

    expect(outcome.appliedFields).toEqual(['careInstructions']);
    expect(gateway.saveDraft).toHaveBeenCalledWith(
      CONSULTATION_ID,
      CLINIC_ID,
      expect.objectContaining({
        careInstructions: 'Keep the cone on.',
        // D-05/D-06: the disputed field is NEVER silently overwritten with
        // the local value by this action -- it keeps the server's value.
        assessment: 'Server: renal failure.',
      }),
    );
    expect(outcome.resolutionState).toBe('RESOLVED');
  });

  it('MERGE_SAFE_FIELDS: falls back to no safe fields (never guesses) when the record predates the baseline column', async () => {
    const record = makeRecord({ baselinePayloadJson: null });
    store = createMockStore(record);
    service = new ConsultationConflictResolutionService(gateway, store, broadcast);

    const outcome = await service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'MERGE_SAFE_FIELDS');

    expect(outcome.appliedFields).toEqual([]);
    expect(gateway.saveDraft).not.toHaveBeenCalled();
    expect(outcome.resolutionState).toBe('RESOLVED');
  });

  it('ESCALATE (verify-fix 10.6): transitions to ESCALATED, applies no field-level change, and reassigns ownership to a DIFFERENT on-duty clinician via the roster provider (D-24)', async () => {
    const roster = makeRosterProvider([VET_ID, OTHER_VET_ID]);
    service = new ConsultationConflictResolutionService(gateway, store, broadcast, roster);

    const outcome = await service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'ESCALATE');

    expect(gateway.saveDraft).not.toHaveBeenCalled();
    expect(gateway.addAddendum).not.toHaveBeenCalled();
    expect(gateway.getConsultation).not.toHaveBeenCalled();
    expect(outcome.resolutionState).toBe('ESCALATED');
    expect(outcome.appliedFields).toEqual([]);

    const updated = await store.findFirst({ where: { id: CONFLICT_ID, clinicId: CLINIC_ID } });
    expect(updated?.resolutionState).toBe(ResolutionState.ESCALATED);
    // The clinician whose own record this was (VET_ID) is never the target
    // -- D-24 always hands off to a DIFFERENT on-duty clinician.
    expect(updated?.currentOwnerUserId).toBe(OTHER_VET_ID);
    expect(roster.listOtherOnDutyClinicianIds).toHaveBeenCalledWith(CLINIC_ID, VET_ID);
    expect(broadcast.emitReplayFailureEscalated).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      domain: EMR_SYNC_DOMAIN,
      entityIds: [CONSULTATION_ID],
    });
  });

  it('ESCALATE: throws (statusCode 500, ROSTER_PROVIDER_REQUIRED) rather than silently transitioning ownership when no roster provider is wired in', async () => {
    // `service` from `beforeEach` has no roster provider.
    const outcome = service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'ESCALATE');

    await expect(outcome).rejects.toMatchObject({ statusCode: 500, code: 'ROSTER_PROVIDER_REQUIRED' });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('ESCALATE (D-36): throws rather than falling back to Admin or stalling when the roster has no other on-duty clinician', async () => {
    const roster = makeRosterProvider([VET_ID]); // only the current owner -- nobody else on duty
    service = new ConsultationConflictResolutionService(gateway, store, broadcast, roster);

    const outcome = service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'ESCALATE');

    await expect(outcome).rejects.toMatchObject({ statusCode: 409, code: 'NO_ON_DUTY_CLINICIAN_AVAILABLE' });
    // Never applied a partial escalation -- the record stays exactly as it was.
    const updated = await store.findFirst({ where: { id: CONFLICT_ID, clinicId: CLINIC_ID } });
    expect(updated?.resolutionState).toBe(ResolutionState.OPEN);
    expect(updated?.currentOwnerUserId).toBe(VET_ID);
  });

  it('routes a resolution against an already-finalized consultation through EmrRepository.addAddendum instead of saveDraft', async () => {
    gateway = createMockGateway({
      getConsultation: vi.fn().mockResolvedValue({ id: CONSULTATION_ID, clinicId: CLINIC_ID, status: 'finalized' }),
    });
    service = new ConsultationConflictResolutionService(gateway, store, broadcast);

    const outcome = await service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'KEEP_LOCAL');

    expect(gateway.saveDraft).not.toHaveBeenCalled();
    expect(gateway.addAddendum).toHaveBeenCalledTimes(1);
    const [addendumConsultationId, addendum] = vi.mocked(gateway.addAddendum).mock.calls[0];
    expect(addendumConsultationId).toBe(CONSULTATION_ID);
    expect(addendum.addedBy).toBe(USER_ID);
    expect(addendum.text).toContain('assessment');
    expect(outcome.resolutionState).toBe('RESOLVED');
  });

  it('rejects resolving a conflict that is already RESOLVED, with a clear error rather than a silent no-op', async () => {
    store = createMockStore(makeRecord({ resolutionState: ResolutionState.RESOLVED }));
    service = new ConsultationConflictResolutionService(gateway, store, broadcast);

    await expect(service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'KEEP_LOCAL')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT_ALREADY_RESOLVED',
    });
    expect(gateway.saveDraft).not.toHaveBeenCalled();
  });

  it('allows resolving a conflict that is ESCALATED (a real owner can still pick a field-level outcome)', async () => {
    store = createMockStore(makeRecord({ resolutionState: ResolutionState.ESCALATED }));
    service = new ConsultationConflictResolutionService(gateway, store, broadcast);

    const outcome = await service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'KEEP_SERVER');
    expect(outcome.resolutionState).toBe('RESOLVED');
  });

  it('tenant isolation: a conflict id scoped to a different clinic is rejected as not found, never leaked', async () => {
    // Simulates the RLS-scoped lookup missing entirely for a spoofed
    // clinicId/conflictId pair from another clinic -- `findFirst` is always
    // called with `context.clinicId` (server-derived), never anything from
    // the request body/params.
    const outcome = service.resolveConflict(
      { ...context, clinicId: OTHER_CLINIC_ID },
      CONSULTATION_ID,
      CONFLICT_ID,
      'KEEP_LOCAL',
    );

    await expect(outcome).rejects.toMatchObject({ statusCode: 404, code: 'CONFLICT_NOT_FOUND' });
    expect(store.findFirst).toHaveBeenCalledWith({ where: { id: CONFLICT_ID, clinicId: OTHER_CLINIC_ID } });
    expect(gateway.saveDraft).not.toHaveBeenCalled();
  });

  it('rejects when the conflict id does not belong to the consultation id named in the URL', async () => {
    const outcome = service.resolveConflict(context, OTHER_CONSULTATION_ID, CONFLICT_ID, 'KEEP_LOCAL');
    await expect(outcome).rejects.toMatchObject({ statusCode: 404, code: 'CONFLICT_NOT_FOUND' });
  });

  it('rejects when the consultation itself is missing (deleted since the conflict was created)', async () => {
    gateway = createMockGateway({ getConsultation: vi.fn().mockResolvedValue(null) });
    service = new ConsultationConflictResolutionService(gateway, store, broadcast);

    const outcome = service.resolveConflict(context, CONSULTATION_ID, CONFLICT_ID, 'KEEP_LOCAL');
    await expect(outcome).rejects.toMatchObject({ statusCode: 404, code: 'CONSULTATION_NOT_FOUND' });
  });
});
