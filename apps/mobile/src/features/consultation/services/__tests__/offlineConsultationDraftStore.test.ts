import { describe, it, expect, vi, beforeEach } from 'vitest';

// expo-sqlite is a native module; never import the real thing in this
// vitest "node" environment (matches offlineDb.test.ts's own mocking
// convention -- this file exercises `saveOfflineConsultationDraft`/
// `loadOfflineConsultationDraft` against an in-memory fake db, never a real
// SQLite connection).
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(() => {
    throw new Error('openDatabaseAsync should never be called when a db is injected in tests');
  }),
}));

import { ReplayPriority } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';
import { ApiClientError } from '../../../../lib/api';
import {
  saveOfflineConsultationDraft,
  loadOfflineConsultationDraft,
  isNetworkFailure,
  CLINICAL_MEDIUM,
  EMR_SYNC_DOMAIN,
  CONSULTATION_DRAFT_ENTITY_TYPE,
} from '../offlineConsultationDraftStore';

const CLINIC_ID = 'clinic-1';
const DEVICE_ID = 'device-1';
const USER_ID = 'user-1';
const CONSULTATION_ID = 'consultation-1';

function baseline(): SaveDraftInput {
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
  };
}

/**
 * Minimal in-memory fake of the Expo SQLite async surface this module's
 * dependency (`offlineDb.ts`) actually uses -- same convention as
 * `offlineDb.test.ts`'s own fake, extended just enough to back
 * `consultation_draft_snapshot` reads/writes and `sync_operations` inserts.
 */
function createFakeDb() {
  const tables: {
    sync_meta: Record<string, unknown>[];
    consultation_draft_snapshot: Record<string, unknown>[];
    sync_operations: Record<string, unknown>[];
  } = { sync_meta: [], consultation_draft_snapshot: [], sync_operations: [] };

  const db = {
    execAsync: vi.fn(async () => undefined),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => {
      await task();
    }),
    runAsync: vi.fn(async (sql: string, params: Record<string, unknown>) => {
      if (/^INSERT OR REPLACE INTO sync_meta/.test(sql)) {
        tables.sync_meta = tables.sync_meta.filter((r) => r.key !== params.$key);
        tables.sync_meta.push({ key: params.$key, value: params.$value });
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getFirstAsync: vi.fn(async (sql: string, params: Record<string, unknown>) => {
      if (/FROM sync_meta/.test(sql)) {
        return tables.sync_meta.find((r) => r.key === params.$key) ?? null;
      }
      if (/FROM consultation_draft_snapshot/.test(sql)) {
        return tables.consultation_draft_snapshot.find((r) => r.entity_id === params.$entityId) ?? null;
      }
      return null;
    }),
    prepareAsync: vi.fn(async (sql: string) => ({
      executeAsync: vi.fn(async (params: Record<string, unknown>) => {
        if (/INTO consultation_draft_snapshot/.test(sql)) {
          tables.consultation_draft_snapshot = tables.consultation_draft_snapshot.filter(
            (r) => r.entity_id !== params.$entityId,
          );
          tables.consultation_draft_snapshot.push({
            entity_id: params.$entityId,
            clinic_id: params.$clinicId,
            device_id: params.$deviceId,
            data_json: params.$dataJson,
            record_date: params.$recordDate,
            working_set_anchored_at: params.$workingSetAnchoredAt,
            is_fully_editable: params.$isFullyEditable,
            updated_at: params.$updatedAt,
          });
        } else if (/INTO sync_operations/.test(sql)) {
          tables.sync_operations.push({
            operation_id: params.$operationId,
            device_id: params.$deviceId,
            clinic_id: params.$clinicId,
            user_id: params.$userId,
            domain: params.$domain,
            entity_type: params.$entityType,
            entity_id: params.$entityId,
            priority: params.$priority,
            payload_json: params.$payloadJson,
            created_at: params.$createdAt,
          });
        }
        return { changes: 1, lastInsertRowId: 0 };
      }),
      finalizeAsync: vi.fn(async () => undefined),
    })),
  };

  return { db, tables };
}

describe('offlineConsultationDraftStore (Plan 10-03 Task 1, D-01, D-05, D-06, D-15 to D-17)', () => {
  let fake: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    fake = createFakeDb();
  });

  it('re-exports the CLINICAL_MEDIUM replay priority so consultation replay never rides the queue tier', () => {
    expect(CLINICAL_MEDIUM).toBe(ReplayPriority.CLINICAL_MEDIUM);
  });

  describe('isNetworkFailure', () => {
    it('treats a server response (ApiClientError) as NOT a network failure -- must surface to the caller unchanged', () => {
      expect(isNetworkFailure(new ApiClientError('locked', 'CONSULTATION_LOCKED', 423))).toBe(false);
    });

    it('treats anything else (fetch TypeError, offline rejection) as a network failure', () => {
      expect(isNetworkFailure(new TypeError('Network request failed'))).toBe(true);
      expect(isNetworkFailure(new Error('generic'))).toBe(true);
    });
  });

  it('returns null when nothing has been saved offline for this consultation yet', async () => {
    const loaded = await loadOfflineConsultationDraft(fake.db as any, CONSULTATION_ID);
    expect(loaded).toBeNull();
  });

  it('persists a draft locally and makes it loadable across a simulated app restart', async () => {
    const base = baseline();
    const local = { ...base, careInstructions: 'Change the bandage daily.' };

    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: local,
      baseline: base,
    });

    // Simulate an app restart: a fresh call against the SAME underlying
    // fake db (a real restart just reopens the same on-disk sqlite file).
    const loaded = await loadOfflineConsultationDraft(fake.db as any, CONSULTATION_ID);

    expect(loaded).not.toBeNull();
    expect(loaded!.draft).toEqual(local);
    expect(loaded!.baseline).toEqual(base);
    expect(loaded!.changedFields).toEqual(['careInstructions']);
  });

  it('computes changed-field metadata against the baseline, not just "something changed"', async () => {
    const base = baseline();
    const local = { ...base, assessment: 'Suspected otitis externa.', rxNotes: 'Ear drops BID.' };

    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: local,
      baseline: base,
    });

    const loaded = await loadOfflineConsultationDraft(fake.db as any, CONSULTATION_ID);
    expect(loaded!.changedFields.sort()).toEqual(['assessment', 'rxNotes']);
  });

  it('enqueues a CLINICAL_MEDIUM replay envelope (never QUEUE_HIGH) tagged with the emr consultation-draft entity type', async () => {
    const base = baseline();
    const local = { ...base, assessment: 'Updated.' };

    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: local,
      baseline: base,
    });

    expect(fake.tables.sync_operations).toHaveLength(1);
    const op = fake.tables.sync_operations[0];
    expect(op.priority).toBe(ReplayPriority.CLINICAL_MEDIUM);
    expect(op.domain).toBe(EMR_SYNC_DOMAIN);
    expect(op.entity_type).toBe(CONSULTATION_DRAFT_ENTITY_TYPE);
    expect(op.entity_id).toBe(CONSULTATION_ID);
    expect(op.clinic_id).toBe(CLINIC_ID);
    expect(op.device_id).toBe(DEVICE_ID);
  });

  it('does not enqueue a second replay envelope when re-saving an unchanged draft (avoids flooding the ledger on repeated failed retries)', async () => {
    const base = baseline();
    const local = { ...base, assessment: 'Updated once.' };

    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: local,
      baseline: base,
    });
    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: local,
      baseline: base,
    });

    expect(fake.tables.sync_operations).toHaveLength(1);
  });

  it('enqueues a fresh replay envelope when the draft changes again after an earlier offline save', async () => {
    const base = baseline();
    const firstEdit = { ...base, assessment: 'First pass.' };
    const secondEdit = { ...base, assessment: 'First pass.', rxNotes: 'Add ear drops.' };

    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: firstEdit,
      baseline: base,
    });
    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: secondEdit,
      baseline: base,
    });

    expect(fake.tables.sync_operations).toHaveLength(2);
  });

  it('scopes the persisted snapshot to the same-day working set rather than a full historical mirror (D-15 to D-17)', async () => {
    const base = baseline();
    const local = { ...base, assessment: 'Today only.' };

    await saveOfflineConsultationDraft(fake.db as any, {
      consultationId: CONSULTATION_ID,
      clinicId: CLINIC_ID,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      draft: local,
      baseline: base,
    });

    const row = fake.tables.consultation_draft_snapshot[0];
    expect(row).toBeDefined();
    // Written through the SAME same-day working-set snapshot table/anchor
    // mechanism (D-35) every other domain adapter uses -- not a bespoke,
    // unbounded local EMR cache.
    expect(row.is_fully_editable).toBe(1);
  });
});
