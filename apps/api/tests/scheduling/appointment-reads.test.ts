import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
  createTestAppointment,
} from '../helpers/factories.js';
import { getTodayIST, addDaysIST } from '../../src/lib/ist-date.js';
import { futureSlot } from '../helpers/future-slot.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

/**
 * SCH-03: `GET /scheduling/appointments` is the single range-read serving
 * both the mobile day agenda (from/to one day apart) and the web week grid
 * (seven days apart) -- RESEARCH Pattern 4. All dates are anchored to
 * `getTodayIST()` plus a known offset rather than bare `new Date()`, so a
 * run near IST midnight cannot flake.
 */

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

function dateRangeUrl(from: Date, to: Date, extra = ''): string {
  return `/api/v1/scheduling/appointments?from=${from.toISOString()}&to=${to.toISOString()}${extra}`;
}

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('Scheduling appointment reads (SCH-03)', () => {
  it('a one-day range returns only that day\'s appointments', async () => {
    const { accessToken, clinic, user, owner, pet, service } = await setupTestContext();

    const dayOneSlot = futureSlot(2, 600);
    const dayTwoSlot = futureSlot(3, 600);

    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: dayOneSlot,
      durationMinutes: service.durationMinutes,
    });
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: dayTwoSlot,
      durationMinutes: service.durationMinutes,
    });

    const { start, end } = { start: dayOneSlot, end: addDaysIST(getTodayIST(dayOneSlot), 1) };
    const res = await app.inject({
      method: 'GET',
      url: dateRangeUrl(getTodayIST(dayOneSlot), end),
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const appointments = res.json().data;
    expect(appointments).toHaveLength(1);
    expect(new Date(appointments[0].scheduledFor).getTime()).toBe(dayOneSlot.getTime());
    void start;
  });

  it('a seven-day range returns the week\'s appointments, ordered by scheduledFor', async () => {
    const { accessToken, clinic, user, owner, pet, service } = await setupTestContext();

    const later = futureSlot(5, 660);
    const earlier = futureSlot(1, 600);

    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: later,
      durationMinutes: service.durationMinutes,
    });
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: earlier,
      durationMinutes: service.durationMinutes,
    });

    const from = getTodayIST();
    const to = addDaysIST(from, 7);
    const res = await app.inject({
      method: 'GET',
      url: dateRangeUrl(from, to),
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const appointments = res.json().data;
    expect(appointments).toHaveLength(2);
    expect(new Date(appointments[0].scheduledFor).getTime()).toBe(earlier.getTime());
    expect(new Date(appointments[1].scheduledFor).getTime()).toBe(later.getTime());
  });

  it('a vetId filter narrows correctly', async () => {
    const { accessToken, clinic, user, owner, pet, service } = await setupTestContext();

    // A second "vet" -- any active clinic member id works as vetId at the
    // repository level (only `AvailabilityService.assertVetInClinic`/the
    // controller-level MANAGE_SCHEDULE permission gate the write side).
    const otherVetUser = await createTestUser();
    await createTestClinicMember(otherVetUser.id, clinic.id, 'Clinician');

    const from = getTodayIST();
    const to = addDaysIST(from, 7);

    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: futureSlot(1, 600),
      durationMinutes: service.durationMinutes,
    });
    await createTestAppointment(clinic.id, otherVetUser.id, owner.id, [pet.id], user.id, {
      scheduledFor: futureSlot(2, 600),
      durationMinutes: service.durationMinutes,
    });

    const res = await app.inject({
      method: 'GET',
      url: dateRangeUrl(from, to, `&vetId=${otherVetUser.id}`),
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const appointments = res.json().data;
    expect(appointments).toHaveLength(1);
    expect(appointments[0].vet.id).toBe(otherVetUser.id);
  });

  it('cancelled appointments ARE returned (the web grid renders them dimmed)', async () => {
    const { accessToken, clinic, user, owner, pet, service } = await setupTestContext();

    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: futureSlot(1, 600),
      durationMinutes: service.durationMinutes,
      status: 'CANCELLED',
    });

    const from = getTodayIST();
    const to = addDaysIST(from, 7);
    const res = await app.inject({
      method: 'GET',
      url: dateRangeUrl(from, to),
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const appointments = res.json().data;
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe('CANCELLED');
  });

  it('each item carries pets, owner, vet and service', async () => {
    const { accessToken, clinic, user, owner, pet, service } = await setupTestContext();

    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: futureSlot(1, 600),
      durationMinutes: service.durationMinutes,
      serviceCatalogId: service.id,
    });

    const from = getTodayIST();
    const to = addDaysIST(from, 7);
    const res = await app.inject({
      method: 'GET',
      url: dateRangeUrl(from, to),
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const [appointment] = res.json().data;
    expect(appointment.pets).toHaveLength(1);
    expect(appointment.pets[0].pet.id).toBe(pet.id);
    expect(appointment.owner.id).toBe(owner.id);
    expect(appointment.vet.id).toBe(user.id);
    expect(appointment.service.id).toBe(service.id);
  });

  it('a range wider than 62 days returns 400 VALIDATION_ERROR', async () => {
    const { accessToken } = await setupTestContext();

    const from = getTodayIST();
    const to = addDaysIST(from, 63);
    const res = await app.inject({
      method: 'GET',
      url: dateRangeUrl(from, to),
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('to before from returns 400', async () => {
    const { accessToken } = await setupTestContext();

    const from = getTodayIST();
    const to = addDaysIST(from, -1);
    const res = await app.inject({
      method: 'GET',
      url: dateRangeUrl(from, to),
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /scheduling/appointments/:id returns a single appointment', async () => {
    const { accessToken, clinic, user, owner, pet, service } = await setupTestContext();

    const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
      scheduledFor: futureSlot(1, 600),
      durationMinutes: service.durationMinutes,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/appointments/${appointment.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(appointment.id);
  });

  it('GET /scheduling/appointments/:id for a nonexistent id returns 404 APPOINTMENT_NOT_FOUND', async () => {
    const { accessToken } = await setupTestContext();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/appointments/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('APPOINTMENT_NOT_FOUND');
  });

  it('GET /scheduling/vets returns the vets sorted by id', async () => {
    const { accessToken, user } = await setupTestContext();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/vets',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const vets = res.json().data;
    expect(vets.some((v: { id: string }) => v.id === user.id)).toBe(true);
    const ids = vets.map((v: { id: string }) => v.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('requires authentication (401 with no token)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/scheduling/appointments?from=2026-01-01&to=2026-01-02' });
    expect(res.statusCode).toBe(401);
  });
});
