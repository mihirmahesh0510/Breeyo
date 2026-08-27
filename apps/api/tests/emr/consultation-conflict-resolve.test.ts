import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { ReplayPriority, ConflictSeverity, ResolutionState } from '@breeyo/types';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  prisma,
} from '../helpers/factories.js';

/**
 * Verify-fix 10.5: real HTTP + real Postgres proof for `POST
 * /consultations/:consultationId/conflicts/:conflictId/resolve`, the route
 * `ClinicalConflictResolutionSheet.tsx` (D-08, verify-fix 10.4) has needed
 * since it was built. Every conflict here is produced through the real
 * `/consultations/sync/replay` endpoint (matching
 * `offline-recovery.e2e.test.ts`'s "no service mocked" convention), not
 * seeded directly into `sync_conflict_records`, so the resolve endpoint is
 * exercised against exactly the row shape the replay path really creates.
 */

let app: FastifyInstance;

let clinicId: string;
let vetUserId: string;
let token: string;
let ownerId: string;

const DEVICE_A = 'device-conflict-resolve-A';

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const vet = await createTestUser({ fullName: 'Dr Conflict Resolve' });
  vetUserId = vet.id;

  const clinic = await createTestClinic(vet.id, { name: 'Conflict Resolve Clinic' });
  clinicId = clinic.id;
  await createTestClinicMember(vet.id, clinic.id, 'Admin');
  token = (await createTestTokens(app, vet.id, clinic.id)).accessToken;

  const owner = await createTestPetOwner(clinicId);
  ownerId = owner.id;
});

const auth = (t: string = token) => ({ Authorization: `Bearer ${t}` });

/**
 * WR-5: `ClinicVetRosterProvider` now filters escalation candidates by
 * real-time availability (`VetAvailabilityTemplate`/`AvailabilityOverride`/
 * `BlockedPeriod`), not just clinic membership + `EDIT_EMR`. This is a real
 * Postgres integration test (no injectable "now"), so any clinician this
 * suite expects to be escalation-eligible needs a template covering every
 * weekday, all day -- deterministically "on duty" regardless of what instant
 * this suite happens to run at.
 */
async function makeAlwaysOnDuty(vetIdToCover: string, clinicIdToCover: string): Promise<void> {
  await prisma.vetAvailabilityTemplate.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      clinicId: clinicIdToCover,
      vetId: vetIdToCover,
      weekday,
      isClosed: false,
      openMinutes: 0,
      closeMinutes: 1440,
    })),
  });
}

function envelope(overrides: {
  entityId: string;
  operationId?: string;
  payload: unknown;
}) {
  return {
    deviceId: DEVICE_A,
    operationId: overrides.operationId ?? randomUUID(),
    clinicId: 'ignored-by-server',
    userId: 'ignored-by-server',
    domain: 'emr',
    entityType: 'CONSULTATION_DRAFT_SAVE',
    priority: ReplayPriority.CLINICAL_MEDIUM,
    createdAt: new Date().toISOString(),
    payload: overrides.payload,
    entityId: overrides.entityId,
  };
}

/**
 * Drives a real conflict into existence: an online PATCH sets the server's
 * draft, then a real `/consultations/sync/replay` call carries a colliding
 * offline edit against the SAME empty baseline. Returns the resulting
 * `SyncConflictRecord` row id plus the consultation id.
 */
async function createRealConflict(overrides: {
  onlineAssessment: string;
  offlineAssessment: string;
  offlineCareInstructions?: string;
}) {
  const pet = await createTestPet(clinicId, ownerId, { name: `Pet-${randomUUID().slice(0, 6)}` });
  const consultation = await createTestConsultation(clinicId, pet.id, vetUserId);

  const onlineUpdate = await request(app.server)
    .patch(`/api/v1/consultations/${consultation.id}/draft`)
    .set(auth())
    .send({ assessment: overrides.onlineAssessment });
  expect(onlineUpdate.status).toBe(200);

  const draftPayload: Record<string, unknown> = { assessment: overrides.offlineAssessment };
  if (overrides.offlineCareInstructions !== undefined) {
    draftPayload.careInstructions = overrides.offlineCareInstructions;
  }

  const draftOp = envelope({
    entityId: consultation.id,
    payload: { baseline: {}, draft: draftPayload },
  });

  const replayRes = await request(app.server)
    .post('/api/v1/consultations/sync/replay')
    .set(auth())
    .send({ deviceId: DEVICE_A, operations: [draftOp] });

  expect(replayRes.status).toBe(409);
  expect(replayRes.body.data.conflictIds).toHaveLength(1);

  const conflictId = replayRes.body.data.conflictIds[0] as string;
  return { consultationId: consultation.id, conflictId };
}

function resolve(consultationId: string, conflictId: string, action: string, authToken: string = token) {
  return request(app.server)
    .post(`/api/v1/consultations/${consultationId}/conflicts/${conflictId}/resolve`)
    .set(auth(authToken))
    .send({ action });
}

describe('POST /consultations/:consultationId/conflicts/:conflictId/resolve (verify-fix 10.5)', () => {
  it('KEEP_LOCAL: writes the full offline payload to the draft and resolves the conflict', async () => {
    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    const res = await resolve(consultationId, conflictId, 'KEEP_LOCAL');
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe('RESOLVED');
    expect(res.body.data.appliedFields).toContain('assessment');

    const draftAfter = await request(app.server)
      .get(`/api/v1/consultations/${consultationId}/draft`)
      .set(auth());
    expect(draftAfter.body.data.assessment).toBe('Offline note: suspected ear infection');

    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.resolutionState).toBe(ResolutionState.RESOLVED);
  });

  it('KEEP_SERVER: leaves the draft at the server value and resolves the conflict', async () => {
    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    const res = await resolve(consultationId, conflictId, 'KEEP_SERVER');
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe('RESOLVED');
    expect(res.body.data.appliedFields).toEqual([]);

    const draftAfter = await request(app.server)
      .get(`/api/v1/consultations/${consultationId}/draft`)
      .set(auth());
    expect(draftAfter.body.data.assessment).toBe('Assessed in clinic: mild dehydration');

    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.resolutionState).toBe(ResolutionState.RESOLVED);
  });

  it('MERGE_SAFE_FIELDS: applies only the field nobody else touched, keeping the disputed field at the server value', async () => {
    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
      offlineCareInstructions: 'Keep the cone on for 7 days.',
    });

    const res = await resolve(consultationId, conflictId, 'MERGE_SAFE_FIELDS');
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe('RESOLVED');
    // `careInstructions` was only ever touched by the offline device -- safe
    // to merge. `assessment` was touched by BOTH sides to different values
    // -- D-05/D-06 forbid ever silently applying that one here.
    expect(res.body.data.appliedFields).toEqual(['careInstructions']);

    const draftAfter = await request(app.server)
      .get(`/api/v1/consultations/${consultationId}/draft`)
      .set(auth());
    expect(draftAfter.body.data.careInstructions).toBe('Keep the cone on for 7 days.');
    expect(draftAfter.body.data.assessment).toBe('Assessed in clinic: mild dehydration');
  });

  it('ESCALATE (verify-fix 10.6): transitions the conflict to ESCALATED with no field-level change, and reassigns ownership to a DIFFERENT real on-duty clinician via ClinicVetRosterProvider (D-24)', async () => {
    // A second real clinician in the same clinic -- the on-duty roster
    // provider resolves against `AvailabilityRepository.listClinicVets`, so
    // there must be a genuine second EDIT_EMR-holding member to hand off to.
    const otherVet = await createTestUser({ fullName: 'Dr Other On-Duty' });
    await createTestClinicMember(otherVet.id, clinicId, 'Clinician');
    await makeAlwaysOnDuty(otherVet.id, clinicId);

    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    const beforeRow = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(beforeRow?.currentOwnerUserId).toBe(vetUserId);

    const res = await resolve(consultationId, conflictId, 'ESCALATE');
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe('ESCALATED');
    expect(res.body.data.appliedFields).toEqual([]);

    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.resolutionState).toBe(ResolutionState.ESCALATED);
    // D-24: hands off to a DIFFERENT on-duty clinician, never the same one.
    expect(row?.currentOwnerUserId).toBe(otherVet.id);
    expect(row?.currentOwnerUserId).not.toBe(beforeRow?.currentOwnerUserId);

    // Untouched -- resolving via ESCALATE must never itself overwrite the draft.
    const draftAfter = await request(app.server)
      .get(`/api/v1/consultations/${consultationId}/draft`)
      .set(auth());
    expect(draftAfter.body.data.assessment).toBe('Assessed in clinic: mild dehydration');
  });

  it('ESCALATE (D-36): throws a real 409 rather than falling back to Admin or silently stalling when no other on-duty clinician exists', async () => {
    // This clinic (per `beforeEach`) has exactly ONE EDIT_EMR-holding
    // member: `vetUserId`, seeded as Admin. Escalating must not silently
    // "succeed" by leaving the conflict pinned to the same Admin/clinician,
    // and must not fabricate a fallback owner.
    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    const res = await resolve(consultationId, conflictId, 'ESCALATE');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_ON_DUTY_CLINICIAN_AVAILABLE');

    // Nothing was partially applied -- the conflict stays exactly where it was.
    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.resolutionState).toBe(ResolutionState.OPEN);
    expect(row?.currentOwnerUserId).toBe(vetUserId);
  });

  it('routes a late resolution against an already-finalized consultation through the addendum path, not the draft', async () => {
    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    // The consultation finalizes AFTER the conflict was created but BEFORE
    // it gets resolved -- the same late-timing scenario verify-fix 10.1
    // covers for a plain replay, now for a resolve.
    const finalizeRes = await request(app.server)
      .post(`/api/v1/consultations/${consultationId}/finalize`)
      .set(auth())
      .send({});
    expect(finalizeRes.status).toBe(200);

    const res = await resolve(consultationId, conflictId, 'KEEP_LOCAL');
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe('RESOLVED');
    expect(res.body.data.message).toMatch(/addendum/i);

    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    expect(consultation?.status).toBe('finalized');
    const addenda = (consultation?.addenda as unknown[]) ?? [];
    expect(addenda).toHaveLength(1);
    expect(JSON.stringify(addenda[0])).toContain('Offline note: suspected ear infection');

    // The finalized consultation row's own `assessment` column must NOT
    // have been silently rewritten -- post-finalization edits are
    // addendum-only (04-CONTEXT.md, reused by verify-fix 10.1).
    expect(consultation?.assessment).toBe('Assessed in clinic: mild dehydration');
  });

  it('rejects resolving a conflict that is already RESOLVED, with a clear 409 rather than a silent no-op', async () => {
    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    const first = await resolve(consultationId, conflictId, 'KEEP_SERVER');
    expect(first.status).toBe(200);

    const second = await resolve(consultationId, conflictId, 'KEEP_LOCAL');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT_ALREADY_RESOLVED');

    // The second (rejected) call's action must not have silently applied
    // anyway.
    const draftAfter = await request(app.server)
      .get(`/api/v1/consultations/${consultationId}/draft`)
      .set(auth());
    expect(draftAfter.body.data.assessment).toBe('Assessed in clinic: mild dehydration');
  });

  it('tenant isolation: a conflict id from another clinic never resolves, even against a valid consultation id shape, and returns 404 not a leak', async () => {
    const { consultationId, conflictId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    // A second, unrelated clinic + authenticated user.
    const otherVet = await createTestUser({ fullName: 'Dr Other Clinic' });
    const otherClinic = await createTestClinic(otherVet.id, { name: 'Other Clinic' });
    await createTestClinicMember(otherVet.id, otherClinic.id, 'Admin');
    const otherToken = (await createTestTokens(app, otherVet.id, otherClinic.id)).accessToken;

    const res = await resolve(consultationId, conflictId, 'KEEP_LOCAL', otherToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONFLICT_NOT_FOUND');

    // Nothing was applied and the original conflict is still OPEN for the
    // real owning clinic.
    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.resolutionState).toBe(ResolutionState.OPEN);
    expect(row?.clinicId).toBe(clinicId);
  });

  it('rejects an unknown conflict id for the caller\'s own clinic with 404', async () => {
    const { consultationId } = await createRealConflict({
      onlineAssessment: 'Assessed in clinic: mild dehydration',
      offlineAssessment: 'Offline note: suspected ear infection',
    });

    const res = await resolve(consultationId, randomUUID(), 'KEEP_LOCAL');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONFLICT_NOT_FOUND');
  });
});
