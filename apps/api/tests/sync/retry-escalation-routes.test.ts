import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { ConflictSeverity, ReplayPriority, ResolutionState } from '@breeyo/types';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  prisma,
} from '../helpers/factories.js';

/**
 * Verify-fix 10.6: real HTTP + real Postgres proof for `POST
 * /sync/failures/:failureTaskId/retry` and `POST
 * /sync/failures/:failureTaskId/escalate` -- the two routes
 * `retryEscalation.service.ts` had no live caller for (D-22, D-23/D-24,
 * D-36), plus `ClinicVetRosterProvider` (the concrete `OnDutyRosterProvider`
 * resolved from Phase 8's `AvailabilityRepository.listClinicVets`) actually
 * driving real clinician hand-off through these routes. Every
 * `SyncFailureTask`/`SyncConflictRecord` here is produced through the real
 * `POST /api/v1/sync/replay` endpoint (matching
 * `consultation-conflict-resolve.test.ts`'s "no service mocked, no row
 * seeded directly" convention), not written straight into the tables.
 */

let app: FastifyInstance;

let clinicId: string;
let vetUserId: string;
let token: string;

const DEVICE_A = 'device-retry-escalate-A';

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

  const vet = await createTestUser({ fullName: 'Dr Retry Escalate' });
  vetUserId = vet.id;

  const clinic = await createTestClinic(vet.id, { name: 'Retry Escalate Clinic' });
  clinicId = clinic.id;
  await createTestClinicMember(vet.id, clinic.id, 'Admin');
  token = (await createTestTokens(app, vet.id, clinic.id)).accessToken;
});

const auth = (t: string = token) => ({ Authorization: `Bearer ${t}` });

/**
 * WR-5: `ClinicVetRosterProvider` now filters candidates by real-time
 * availability (`VetAvailabilityTemplate`/`AvailabilityOverride`/
 * `BlockedPeriod`), not just clinic membership + `EDIT_EMR`. This is a real
 * Postgres integration test (no injectable "now"), so every clinician this
 * suite expects to be escalation-eligible needs a template that covers every
 * weekday, all day -- deterministically "on duty" regardless of what instant
 * CI happens to run at.
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

/**
 * A deliberately malformed operation envelope (missing `entityType`) so
 * `offlineOperationEnvelopeSchema.safeParse` rejects it and
 * `ReplayIngestService` creates a real `SyncFailureTask`
 * (`originatingUserId = currentOwnerUserId = the authenticated user`,
 * `resolutionState: OPEN` -- D-22) rather than a `SyncConflictRecord`.
 */
async function createRealFailureTask(authToken: string = token): Promise<string> {
  const malformedOperation = {
    deviceId: DEVICE_A,
    operationId: randomUUID(),
    clinicId: 'ignored-by-server',
    userId: 'ignored-by-server',
    domain: 'inventory',
    // entityType intentionally omitted
    entityId: randomUUID(),
    priority: ReplayPriority.INVENTORY_MEDIUM,
    createdAt: new Date().toISOString(),
    payload: {},
  };

  const res = await request(app.server)
    .post('/api/v1/sync/replay')
    .set(auth(authToken))
    .send({ deviceId: DEVICE_A, operations: [malformedOperation] });

  expect(res.status).toBe(200);
  expect(res.body.data.failureTaskIds).toHaveLength(1);
  return res.body.data.failureTaskIds[0] as string;
}

/**
 * A real `SyncConflictRecord` via the generic `/api/v1/sync/replay`
 * `conflicts` array (`syncConflictEnvelopeSchema`) -- deliberately NOT
 * routed through the EMR-specific `/consultations/sync/replay` path (that
 * one is exercised by `apps/api/tests/emr/consultation-conflict-resolve.test.ts`);
 * this proves the GENERIC retry/escalate routes work for a `CONFLICT`-kind
 * row on their own, independent of the EMR module.
 */
async function createRealConflict(
  overrides: { resolutionOwnerUserId: string; severity?: ConflictSeverity },
  authToken: string = token,
): Promise<string> {
  const conflictEnvelope = {
    conflictId: randomUUID(),
    clinicId: 'ignored-by-server',
    deviceId: DEVICE_A,
    operationId: randomUUID(),
    domain: 'emr',
    entityType: 'CONSULTATION_DRAFT_SAVE',
    entityId: randomUUID(),
    severity: overrides.severity ?? ConflictSeverity.SAFETY_CRITICAL,
    localPayload: { assessment: 'local' },
    serverPayload: { assessment: 'server' },
    resolutionOwnerUserId: overrides.resolutionOwnerUserId,
    resolutionState: ResolutionState.OPEN,
    createdAt: new Date().toISOString(),
  };

  const res = await request(app.server)
    .post('/api/v1/sync/replay')
    .set(auth(authToken))
    .send({ deviceId: DEVICE_A, conflicts: [conflictEnvelope] });

  expect(res.status).toBe(200);
  expect(res.body.data.conflictsCreated).toHaveLength(1);

  // `conflictsCreated` echoes back the CLIENT-supplied envelope (including
  // its own client-generated `conflictId`), not the real database row id --
  // `ReplayIngestService` never writes the client's `conflictId` onto the
  // row's Postgres-generated `id` column. Look the real row up the same way
  // the service's own idempotency check does (the
  // `[clinicId, deviceId, operationId]` unique key) to get the id the
  // retry/escalate routes actually operate on.
  const row = await prisma.syncConflictRecord.findUnique({
    where: {
      clinicId_deviceId_operationId: {
        clinicId,
        deviceId: DEVICE_A,
        operationId: conflictEnvelope.operationId,
      },
    },
  });
  if (!row) throw new Error('Expected the just-created SyncConflictRecord row to exist');
  return row.id;
}

function retry(id: string, kind?: 'FAILURE_TASK' | 'CONFLICT', authToken: string = token) {
  return request(app.server)
    .post(`/api/v1/sync/failures/${id}/retry`)
    .set(auth(authToken))
    .send(kind ? { kind } : {});
}

function escalate(id: string, kind?: 'FAILURE_TASK' | 'CONFLICT', authToken: string = token) {
  return request(app.server)
    .post(`/api/v1/sync/failures/${id}/escalate`)
    .set(auth(authToken))
    .send(kind ? { kind } : {});
}

describe('POST /sync/failures/:failureTaskId/retry (verify-fix 10.6, D-22)', () => {
  it('FAILURE_TASK: advances OPEN -> GUIDED_RETRY, keeping the originating user as owner', async () => {
    const taskId = await createRealFailureTask();

    const res = await retry(taskId);
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(res.body.data.currentOwnerUserId).toBe(vetUserId);

    const row = await prisma.syncFailureTask.findUnique({ where: { id: taskId } });
    expect(row?.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
  });

  it('CONFLICT: advances OPEN -> GUIDED_RETRY without reassigning the already-accountable clinician (D-09)', async () => {
    const conflictId = await createRealConflict({ resolutionOwnerUserId: vetUserId });

    const res = await retry(conflictId, 'CONFLICT');
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(res.body.data.currentOwnerUserId).toBe(vetUserId);
  });

  it('rejects retrying from a state other than OPEN with a real 409, not a silent no-op', async () => {
    const taskId = await createRealFailureTask();
    const first = await retry(taskId);
    expect(first.status).toBe(200);

    const second = await retry(taskId);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RETRY_ESCALATION_INVALID_STATE');
  });

  it('tenant isolation: a failure task id from another clinic can never be retried, and returns 404 not a leak', async () => {
    const taskId = await createRealFailureTask();

    const otherVet = await createTestUser({ fullName: 'Dr Other Clinic' });
    const otherClinic = await createTestClinic(otherVet.id, { name: 'Other Clinic' });
    await createTestClinicMember(otherVet.id, otherClinic.id, 'Admin');
    const otherToken = (await createTestTokens(app, otherVet.id, otherClinic.id)).accessToken;

    const res = await retry(taskId, undefined, otherToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    const row = await prisma.syncFailureTask.findUnique({ where: { id: taskId } });
    expect(row?.resolutionState).toBe(ResolutionState.OPEN);
    expect(row?.clinicId).toBe(clinicId);
  });

  it('returns 404 for an id that does not exist at all', async () => {
    const res = await retry(randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects an unrecognized kind with a 400 validation error', async () => {
    const taskId = await createRealFailureTask();
    const res = await request(app.server)
      .post(`/api/v1/sync/failures/${taskId}/retry`)
      .set(auth())
      .send({ kind: 'NOT_A_REAL_KIND' });
    expect(res.status).toBe(400);
  });
});

describe('POST /sync/failures/:failureTaskId/escalate (verify-fix 10.6, D-23/D-24/D-36)', () => {
  it('FAILURE_TASK: a failed guided retry moves GUIDED_RETRY -> ESCALATED without reassigning ownership (D-10: no clinician concept for a raw envelope failure)', async () => {
    const taskId = await createRealFailureTask();
    expect((await retry(taskId)).status).toBe(200);

    const res = await escalate(taskId);
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe(ResolutionState.ESCALATED);
    expect(res.body.data.currentOwnerUserId).toBe(vetUserId);

    const row = await prisma.syncFailureTask.findUnique({ where: { id: taskId } });
    expect(row?.resolutionState).toBe(ResolutionState.ESCALATED);
  });

  it('CONFLICT (D-24): a failed guided retry on a SAFETY_CRITICAL conflict hands off to a DIFFERENT real on-duty clinician via ClinicVetRosterProvider', async () => {
    const otherVet = await createTestUser({ fullName: 'Dr Other On-Duty' });
    await createTestClinicMember(otherVet.id, clinicId, 'Clinician');
    await makeAlwaysOnDuty(otherVet.id, clinicId);

    const conflictId = await createRealConflict({ resolutionOwnerUserId: vetUserId });
    expect((await retry(conflictId, 'CONFLICT')).status).toBe(200);

    const res = await escalate(conflictId, 'CONFLICT');
    expect(res.status).toBe(200);
    expect(res.body.data.resolutionState).toBe(ResolutionState.ESCALATED);
    expect(res.body.data.currentOwnerUserId).toBe(otherVet.id);
    expect(res.body.data.currentOwnerUserId).not.toBe(vetUserId);

    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.currentOwnerUserId).toBe(otherVet.id);
  });

  it('CONFLICT (D-36): further escalation on an already-ESCALATED conflict hands off to yet another on-duty clinician when the first is also unreachable', async () => {
    const secondVet = await createTestUser({ fullName: 'Dr Second On-Duty' });
    await createTestClinicMember(secondVet.id, clinicId, 'Clinician');
    await makeAlwaysOnDuty(secondVet.id, clinicId);
    const secondVetToken = (await createTestTokens(app, secondVet.id, clinicId)).accessToken;
    const thirdVet = await createTestUser({ fullName: 'Dr Third On-Duty' });
    await createTestClinicMember(thirdVet.id, clinicId, 'Clinician');
    await makeAlwaysOnDuty(thirdVet.id, clinicId);
    const thirdVetToken = (await createTestTokens(app, thirdVet.id, clinicId)).accessToken;

    const conflictId = await createRealConflict({ resolutionOwnerUserId: vetUserId });
    expect((await retry(conflictId, 'CONFLICT')).status).toBe(200);
    const firstEscalate = await escalate(conflictId, 'CONFLICT');
    expect(firstEscalate.status).toBe(200);
    const firstOwner = firstEscalate.body.data.currentOwnerUserId as string;

    // WR-6: the clinician it was just handed to is ALSO unreachable -- THEY
    // (the new current owner, not the original vet) are the one reporting
    // that and escalating again.
    const firstOwnerToken = firstOwner === secondVet.id ? secondVetToken : thirdVetToken;
    const secondEscalate = await escalate(conflictId, 'CONFLICT', firstOwnerToken);
    expect(secondEscalate.status).toBe(200);
    expect(secondEscalate.body.data.resolutionState).toBe(ResolutionState.ESCALATED);
    expect(secondEscalate.body.data.currentOwnerUserId).not.toBe(firstOwner);
    expect([vetUserId, secondVet.id, thirdVet.id]).toContain(secondEscalate.body.data.currentOwnerUserId);
  });

  it('CONFLICT (D-36): throws a real 409 rather than falling back to Admin or silently stalling when no other on-duty clinician exists', async () => {
    // This clinic has exactly ONE EDIT_EMR-holding member: vetUserId (Admin).
    const conflictId = await createRealConflict({ resolutionOwnerUserId: vetUserId });
    expect((await retry(conflictId, 'CONFLICT')).status).toBe(200);

    const res = await escalate(conflictId, 'CONFLICT');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_ON_DUTY_CLINICIAN_AVAILABLE');

    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(row?.currentOwnerUserId).toBe(vetUserId);
  });

  it('rejects escalating a still-OPEN item (the ladder is not skippable)', async () => {
    const taskId = await createRealFailureTask();
    const res = await escalate(taskId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RETRY_ESCALATION_INVALID_STATE');
  });

  it('tenant isolation: a conflict id from another clinic can never be escalated, and returns 404 not a leak', async () => {
    const conflictId = await createRealConflict({ resolutionOwnerUserId: vetUserId });
    expect((await retry(conflictId, 'CONFLICT')).status).toBe(200);

    const otherVet = await createTestUser({ fullName: 'Dr Other Clinic 2' });
    const otherClinic = await createTestClinic(otherVet.id, { name: 'Other Clinic 2' });
    await createTestClinicMember(otherVet.id, otherClinic.id, 'Admin');
    const otherToken = (await createTestTokens(app, otherVet.id, otherClinic.id)).accessToken;

    const res = await escalate(conflictId, 'CONFLICT', otherToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    const row = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(row?.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(row?.clinicId).toBe(clinicId);
  });
});

describe('WR-6: owner-only authorization on retry/escalate', () => {
  /**
   * A staff member who IS a member of the SAME clinic as the owner (so RLS
   * alone would let them read/act on the row) but is NOT the row's
   * `currentOwnerUserId`. Before WR-6, any such staff member could retry or
   * escalate a task/conflict currently owned by a different clinician.
   */
  async function createSameClinicNonOwner(): Promise<{ userId: string; token: string }> {
    const otherStaff = await createTestUser({ fullName: 'Dr Not The Owner' });
    await createTestClinicMember(otherStaff.id, clinicId, 'Clinician');
    const otherToken = (await createTestTokens(app, otherStaff.id, clinicId)).accessToken;
    return { userId: otherStaff.id, token: otherToken };
  }

  it('FAILURE_TASK retry: a non-owner staff member in the same clinic gets 403, the owner still succeeds', async () => {
    const taskId = await createRealFailureTask(); // owner = vetUserId
    const nonOwner = await createSameClinicNonOwner();

    const forbidden = await retry(taskId, undefined, nonOwner.token);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const untouched = await prisma.syncFailureTask.findUnique({ where: { id: taskId } });
    expect(untouched?.resolutionState).toBe(ResolutionState.OPEN);
    expect(untouched?.currentOwnerUserId).toBe(vetUserId);

    const owned = await retry(taskId);
    expect(owned.status).toBe(200);
    expect(owned.body.data.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
  });

  it('CONFLICT retry: a non-owner staff member in the same clinic gets 403, the owner still succeeds', async () => {
    const conflictId = await createRealConflict({ resolutionOwnerUserId: vetUserId });
    const nonOwner = await createSameClinicNonOwner();

    const forbidden = await retry(conflictId, 'CONFLICT', nonOwner.token);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const untouched = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(untouched?.resolutionState).toBe(ResolutionState.OPEN);
    expect(untouched?.currentOwnerUserId).toBe(vetUserId);

    const owned = await retry(conflictId, 'CONFLICT');
    expect(owned.status).toBe(200);
    expect(owned.body.data.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
  });

  it('FAILURE_TASK escalate: a non-owner staff member in the same clinic gets 403, the owner still succeeds', async () => {
    const taskId = await createRealFailureTask(); // owner = vetUserId
    expect((await retry(taskId)).status).toBe(200); // -> GUIDED_RETRY, so escalate is a valid transition
    const nonOwner = await createSameClinicNonOwner();

    const forbidden = await escalate(taskId, undefined, nonOwner.token);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const untouched = await prisma.syncFailureTask.findUnique({ where: { id: taskId } });
    expect(untouched?.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(untouched?.currentOwnerUserId).toBe(vetUserId);

    const owned = await escalate(taskId);
    expect(owned.status).toBe(200);
    expect(owned.body.data.resolutionState).toBe(ResolutionState.ESCALATED);
  });

  it('CONFLICT escalate: a non-owner staff member in the same clinic gets 403, the owner still succeeds', async () => {
    const otherVet = await createTestUser({ fullName: 'Dr Other On-Duty For WR-6' });
    await createTestClinicMember(otherVet.id, clinicId, 'Clinician');
    await makeAlwaysOnDuty(otherVet.id, clinicId);

    const conflictId = await createRealConflict({ resolutionOwnerUserId: vetUserId });
    expect((await retry(conflictId, 'CONFLICT')).status).toBe(200); // -> GUIDED_RETRY
    const nonOwner = await createSameClinicNonOwner();

    const forbidden = await escalate(conflictId, 'CONFLICT', nonOwner.token);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const untouched = await prisma.syncConflictRecord.findUnique({ where: { id: conflictId } });
    expect(untouched?.resolutionState).toBe(ResolutionState.GUIDED_RETRY);
    expect(untouched?.currentOwnerUserId).toBe(vetUserId);

    const owned = await escalate(conflictId, 'CONFLICT');
    expect(owned.status).toBe(200);
    expect(owned.body.data.resolutionState).toBe(ResolutionState.ESCALATED);
    expect(owned.body.data.currentOwnerUserId).toBe(otherVet.id);
  });
});
