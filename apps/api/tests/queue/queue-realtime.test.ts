import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

/** Spy on app.io.to() — returns a mock with chained .emit() */
let emitSpy: ReturnType<typeof vi.fn>;
let toSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(() => {
  emitSpy = vi.fn();
  toSpy = vi.spyOn(app.io, 'to').mockReturnValue({ emit: emitSpy } as any);
});

afterEach(() => {
  toSpy.mockRestore();
});

/**
 * Creates a test user, clinic, and clinic member, then generates auth tokens.
 */
async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

/**
 * Registers a patient (owner + pet) and checks them in, returning the queue entry data.
 */
async function registerAndCheckIn(token: string, overrides = {}) {
  const mobile = `${6000000000 + Math.floor(Math.random() * 3999999999)}`;
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/v1/patients/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      owner: { mobile, name: 'Test Owner' },
      pet: { name: `Pet-${mobile.slice(-4)}`, species: 'DOG' },
    },
  });
  const { pet } = regRes.json().data;

  const checkInRes = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/check-in',
    headers: { authorization: `Bearer ${token}` },
    payload: { petId: pet.id, ...overrides },
  });
  return checkInRes.json().data;
}

describe('Queue Real-time (QUE-02)', () => {
  beforeEach(async () => {
    // Clean queue entries first (depends on Pet), then other tables
    await prisma.queueEntry.deleteMany();
    await prisma.pet.deleteMany();
    await prisma.petOwner.deleteMany();
    await cleanupTestData();
  });

  describe('broadcast on check-in', () => {
    it('emits PATIENT_CHECKED_IN event to clinic room on check-in', async () => {
      const { clinic, accessToken } = await setupTestContext();

      await registerAndCheckIn(accessToken);

      // Verify app.io.to was called with the correct clinic room
      expect(toSpy).toHaveBeenCalledWith(`clinic:${clinic.id}`);

      // Verify emit was called with the correct event name
      expect(emitSpy).toHaveBeenCalledWith(
        'patient:checked-in',
        expect.objectContaining({
          entry: expect.any(Object),
          timestamp: expect.any(Number),
        }),
      );
    });

    it('event payload includes queue entry with pet and owner', async () => {
      const { accessToken } = await setupTestContext();

      await registerAndCheckIn(accessToken);

      // Extract the payload from the emit call
      const emitCalls = emitSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === 'patient:checked-in',
      );
      expect(emitCalls.length).toBeGreaterThanOrEqual(1);

      const payload = emitCalls[0][1];
      expect(payload.entry).toBeDefined();
      expect(payload.entry.id).toBeDefined();
      expect(payload.entry.petId).toBeDefined();
      expect(payload.entry.status).toBe('WAITING');
      expect(payload.entry.pet).toBeDefined();
      expect(payload.entry.pet.name).toBeDefined();
      expect(payload.entry.pet.owner).toBeDefined();
      expect(payload.entry.pet.owner.name).toBe('Test Owner');
    });
  });

  describe('broadcast on status change', () => {
    it('emits QUEUE_UPDATED event to clinic room on status transition', async () => {
      const { clinic, accessToken } = await setupTestContext();

      const entry = await registerAndCheckIn(accessToken);

      // Clear spies from check-in broadcast
      toSpy.mockClear();
      emitSpy.mockClear();

      // Transition WAITING -> IN_CONSULT
      const statusRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/queue/${entry.id}/status`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { status: 'IN_CONSULT' },
      });
      expect(statusRes.statusCode).toBe(200);

      // Verify broadcast to the clinic room
      expect(toSpy).toHaveBeenCalledWith(`clinic:${clinic.id}`);
      expect(emitSpy).toHaveBeenCalledWith(
        'queue:updated',
        expect.objectContaining({
          entry: expect.any(Object),
          updatedBy: expect.any(String),
          timestamp: expect.any(Number),
        }),
      );
    });

    it('event payload includes updated entry and updatedBy user', async () => {
      const { user, accessToken } = await setupTestContext();

      const entry = await registerAndCheckIn(accessToken);

      // Clear spies from check-in broadcast
      toSpy.mockClear();
      emitSpy.mockClear();

      // Transition WAITING -> IN_CONSULT
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/queue/${entry.id}/status`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { status: 'IN_CONSULT' },
      });

      // Extract the payload from the emit call
      const emitCalls = emitSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === 'queue:updated',
      );
      expect(emitCalls.length).toBeGreaterThanOrEqual(1);

      const payload = emitCalls[0][1];
      expect(payload.entry).toBeDefined();
      expect(payload.entry.id).toBe(entry.id);
      expect(payload.entry.status).toBe('IN_CONSULT');
      expect(payload.updatedBy).toBe(user.id);
      expect(payload.timestamp).toBeTypeOf('number');
    });
  });

  describe('broadcast on call next', () => {
    it('emits QUEUE_UPDATED event when call-next transitions entry', async () => {
      const { clinic, accessToken } = await setupTestContext();

      // Check in a patient so there is someone in the queue
      await registerAndCheckIn(accessToken);

      // Clear spies from check-in broadcast
      toSpy.mockClear();
      emitSpy.mockClear();

      // Call next patient
      const callNextRes = await app.inject({
        method: 'POST',
        url: '/api/v1/queue/call-next',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(callNextRes.statusCode).toBe(200);

      // Verify broadcast to the clinic room
      expect(toSpy).toHaveBeenCalledWith(`clinic:${clinic.id}`);
      expect(emitSpy).toHaveBeenCalledWith(
        'queue:updated',
        expect.objectContaining({
          entry: expect.objectContaining({
            status: 'IN_CONSULT',
          }),
          updatedBy: expect.any(String),
          timestamp: expect.any(Number),
        }),
      );
    });
  });

  describe('room scoping', () => {
    it('only broadcasts to clients in the same clinic room', async () => {
      const { clinic, accessToken } = await setupTestContext();

      await registerAndCheckIn(accessToken);

      // Every to() call should target this clinic's room
      const toCalls = toSpy.mock.calls;
      expect(toCalls.length).toBeGreaterThanOrEqual(1);

      for (const call of toCalls) {
        expect(call[0]).toBe(`clinic:${clinic.id}`);
      }
    });

    it('does not leak events to other clinic rooms', async () => {
      // Set up two separate clinics
      const ctxA = await setupTestContext();
      const ctxB = await setupTestContext();

      // Check in a patient to clinic A
      await registerAndCheckIn(ctxA.accessToken);

      // Collect all room targets from to() calls
      const roomTargets = toSpy.mock.calls.map((call: unknown[]) => call[0]);

      // Verify clinic A's room was targeted
      expect(roomTargets).toContain(`clinic:${ctxA.clinic.id}`);

      // Verify clinic B's room was NEVER targeted
      expect(roomTargets).not.toContain(`clinic:${ctxB.clinic.id}`);
    });
  });
});
