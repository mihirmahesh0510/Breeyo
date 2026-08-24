import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestVetAvailabilityWeek,
  createTestServiceForBooking,
} from '../helpers/factories.js';
import { futureSlot } from '../helpers/future-slot.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

/** Spy on app.io.to() -- returns a mock with chained .emit(), mirroring
 * tests/queue/queue-realtime.test.ts's established pattern exactly. */
let emitSpy: ReturnType<typeof vi.fn>;
let toSpy: ReturnType<typeof vi.spyOn>;

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  await createTestVetAvailabilityWeek(clinic.id, user.id);
  const service = await createTestServiceForBooking(clinic.id, { durationMinutes: 30 });
  return { user, clinic, accessToken, owner, pet, service };
}

async function book(accessToken: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/scheduling/appointments',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: body,
  });
}

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  emitSpy = vi.fn();
  toSpy = vi.spyOn(app.io, 'to').mockReturnValue({ emit: emitSpy } as any);
});

afterEach(() => {
  toSpy.mockRestore();
});

describe('Scheduling realtime broadcasts (SCH-04)', () => {
  it('creating an appointment emits appointment:created to clinic:{clinicId}', async () => {
    const { accessToken, clinic, owner, pet, user, service } = await setupTestContext();

    const res = await book(accessToken, {
      ownerId: owner.id,
      petIds: [pet.id],
      vetId: user.id,
      serviceCatalogId: service.id,
      scheduledFor: futureSlot(1, 600).toISOString(),
    });
    expect(res.statusCode).toBe(201);

    expect(toSpy).toHaveBeenCalledWith(`clinic:${clinic.id}`);
    expect(emitSpy).toHaveBeenCalledWith(
      'appointment:created',
      expect.objectContaining({ appointments: expect.any(Array), timestamp: expect.any(Number) }),
    );
  });

  it('rescheduling emits appointment:updated', async () => {
    const { accessToken, clinic, owner, pet, user, service } = await setupTestContext();

    const created = await book(accessToken, {
      ownerId: owner.id,
      petIds: [pet.id],
      vetId: user.id,
      serviceCatalogId: service.id,
      scheduledFor: futureSlot(1, 600).toISOString(),
    });
    const appointmentId = created.json().data.appointments[0].id;

    toSpy.mockClear();
    emitSpy.mockClear();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduling/appointments/${appointmentId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { scheduledFor: futureSlot(2, 660).toISOString() },
    });
    expect(res.statusCode).toBe(200);

    expect(toSpy).toHaveBeenCalledWith(`clinic:${clinic.id}`);
    expect(emitSpy).toHaveBeenCalledWith(
      'appointment:updated',
      expect.objectContaining({ appointment: expect.any(Object), timestamp: expect.any(Number) }),
    );
  });

  it('cancelling emits appointment:cancelled', async () => {
    const { accessToken, clinic, owner, pet, user, service } = await setupTestContext();

    const created = await book(accessToken, {
      ownerId: owner.id,
      petIds: [pet.id],
      vetId: user.id,
      serviceCatalogId: service.id,
      scheduledFor: futureSlot(1, 600).toISOString(),
    });
    const appointmentId = created.json().data.appointments[0].id;

    toSpy.mockClear();
    emitSpy.mockClear();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/scheduling/appointments/${appointmentId}/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    expect(toSpy).toHaveBeenCalledWith(`clinic:${clinic.id}`);
    expect(emitSpy).toHaveBeenCalledWith(
      'appointment:cancelled',
      expect.objectContaining({ appointmentId, timestamp: expect.any(Number) }),
    );
  });

  it('a template write emits availability:updated', async () => {
    const { accessToken, clinic, user } = await setupTestContext();

    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      isClosed: weekday === 0,
      openMinutes: weekday === 0 ? null : 540,
      closeMinutes: weekday === 0 ? null : 1080,
    }));

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scheduling/availability/${user.id}/template`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, days },
    });
    expect(res.statusCode).toBe(200);

    expect(toSpy).toHaveBeenCalledWith(`clinic:${clinic.id}`);
    expect(emitSpy).toHaveBeenCalledWith(
      'availability:updated',
      expect.objectContaining({ vetId: user.id, timestamp: expect.any(Number) }),
    );
  });

  it('every emit targets the room of the acting clinic and no other', async () => {
    const ctxA = await setupTestContext();
    const ctxB = await setupTestContext();

    await book(ctxA.accessToken, {
      ownerId: ctxA.owner.id,
      petIds: [ctxA.pet.id],
      vetId: ctxA.user.id,
      serviceCatalogId: ctxA.service.id,
      scheduledFor: futureSlot(1, 600).toISOString(),
    });

    const roomTargets = toSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(roomTargets).toContain(`clinic:${ctxA.clinic.id}`);
    expect(roomTargets).not.toContain(`clinic:${ctxB.clinic.id}`);
  });
});
