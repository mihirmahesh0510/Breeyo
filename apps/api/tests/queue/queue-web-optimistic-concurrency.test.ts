import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
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
 * Verify-fix 10.10 (Plan 10-05, D-05): `WebQueueService.updateEntryStatus`'s
 * `expectedVersion` check used to be a separate `findUnique` read, with the
 * real write (`QueueService.updateStatus`) running several `await`s later --
 * a genuine gap for two concurrent browser tabs racing a stale claim. Every
 * pre-existing test for this path mocked the Prisma delegate, so the gap was
 * never provable against real concurrent behavior. This file fires two
 * GENUINELY concurrent HTTP requests (`Promise.allSettled`, real listening
 * server via `buildTestApp`, real Postgres) sharing the same stale
 * `expectedVersion` against the same row, and asserts exactly one succeeds.
 *
 * `apps/api/vitest.config.ts` sets `fileParallelism: false`, so this file's
 * own concurrency has to come from `Promise.allSettled` inside one test,
 * same convention as `apps/api/tests/billing/finalize-stock.test.ts`'s
 * "two concurrent finalizes" race and `numbering-concurrency.test.ts`.
 */
let app: FastifyInstance;

let clinicId: string;
let token: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  const user = await createTestUser({ fullName: 'Front Desk Admin' });
  const clinic = await createTestClinic(user.id, { name: 'Concurrency Clinic' });
  await createTestClinicMember(user.id, clinic.id, 'Admin');
  clinicId = clinic.id;
  token = (await createTestTokens(app, user.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

/** Registers an owner+pet and checks the pet in, returning the queue entry id. */
async function createCheckedInEntry(): Promise<string> {
  const registerRes = await request(app.server)
    .post('/api/v1/patients/register')
    .set(auth())
    .send({
      owner: { mobile: `${6000000000 + Math.floor(Math.random() * 3999999999)}`, name: 'Race Owner' },
      pet: { name: 'Bruno', species: 'DOG' },
    });
  expect(registerRes.status).toBe(201);
  const { pet } = registerRes.body.data;

  const checkInRes = await request(app.server)
    .post('/api/v1/queue/check-in')
    .set(auth())
    .send({ petId: pet.id });
  expect(checkInRes.status).toBe(201);

  return checkInRes.body.data.id as string;
}

/** Reads the entry's browser-visible `staleVersion` (== live `updatedAt` in ms) off the real web board. */
async function readKnownVersion(entryId: string): Promise<number> {
  const boardRes = await request(app.server).get('/api/v1/queue/web/board').set(auth());
  expect(boardRes.status).toBe(200);
  const entry = boardRes.body.data.waiting.find((row: { id: string }) => row.id === entryId);
  expect(entry).toBeTruthy();
  return entry.changeMetadata.staleVersion as number;
}

describe('Browser queue write path: real concurrent stale-version race (verify-fix 10.10)', () => {
  it('resolves two genuinely concurrent status updates sharing the same expectedVersion to exactly one success and one real 409 conflict', async () => {
    const entryId = await createCheckedInEntry();
    const expectedVersion = await readKnownVersion(entryId);

    // Two browser tabs, both still rendering the pre-update version, both
    // fire at once. Before the fix this was a plain read-then-write with no
    // atomicity between the check and `QueueService.updateStatus` -- both
    // could observe themselves as current and both apply.
    const [first, second] = await Promise.allSettled([
      request(app.server)
        .post(`/api/v1/queue/web/entries/${entryId}/status`)
        .set(auth())
        .send({ status: 'IN_CONSULT', expectedVersion }),
      request(app.server)
        .post(`/api/v1/queue/web/entries/${entryId}/status`)
        .set(auth())
        .send({ status: 'IN_CONSULT', expectedVersion }),
    ]);

    const responses = [first, second].map((r) => (r.status === 'fulfilled' ? r.value : null));
    const statuses = responses.map((r) => r?.status ?? 0);

    // Exactly one deterministic winner, exactly one deterministic conflict --
    // never both-succeed, never both-fail, never a nondeterministic 500.
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    const conflictResponse = responses.find((r) => r?.status === 409);
    expect(conflictResponse?.body.error.code).toBe('STALE_WRITE_CONFLICT');
    // The `.conflict` payload must actually be on the wire -- this is an
    // HTTP-level assertion the mock-based unit tests could never make.
    expect(conflictResponse?.body.error.conflict).toMatchObject({
      domain: 'queue',
      entityType: 'QUEUE_ENTRY',
      entityId: entryId,
      severity: 'OPERATIONAL',
    });
    expect(conflictResponse?.body.error.conflict.currentVersion).toBeGreaterThan(expectedVersion);

    // The row itself only ever transitioned once.
    const finalEntry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(finalEntry.status).toBe('IN_CONSULT');
  });

  it('lets a second write through once it carries the post-write version (no false-positive conflicts)', async () => {
    const entryId = await createCheckedInEntry();
    const v1 = await readKnownVersion(entryId);

    const firstRes = await request(app.server)
      .post(`/api/v1/queue/web/entries/${entryId}/status`)
      .set(auth())
      .send({ status: 'IN_CONSULT', expectedVersion: v1 });
    expect(firstRes.status).toBe(200);

    const v2 = firstRes.body.data.changeMetadata.staleVersion as number;
    expect(v2).toBeGreaterThan(v1);

    const secondRes = await request(app.server)
      .post(`/api/v1/queue/web/entries/${entryId}/status`)
      .set(auth())
      .send({ status: 'DONE', expectedVersion: v2 });
    expect(secondRes.status).toBe(200);

    const finalEntry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(finalEntry.status).toBe('DONE');
  });
});
