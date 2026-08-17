import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestVetAvailabilityWeek,
  createTestServiceForBooking,
  createTestPetOwner,
  createTestPet,
} from '../helpers/factories.js';
import { getTodayIST, addDaysIST, weekdayIST } from '../../src/lib/ist-date.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  const service = await createTestServiceForBooking(clinic.id, { durationMinutes: 30 });
  return { user, clinic, accessToken, owner, pet, service };
}

/** A future weekday (skips Sunday). */
function futureWeekday(daysAhead: number): Date {
  let day = addDaysIST(getTodayIST(), daysAhead);
  while (weekdayIST(day) === 0) {
    day = addDaysIST(day, 1);
  }
  return day;
}

function sevenDayTemplate(overrides: Partial<{ openMinutes: number; closeMinutes: number }> = {}) {
  const openMinutes = overrides.openMinutes ?? 540;
  const closeMinutes = overrides.closeMinutes ?? 1080;
  const days = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const isSunday = weekday === 0;
    days.push({
      weekday,
      isClosed: isSunday,
      openMinutes: isSunday ? null : openMinutes,
      closeMinutes: isSunday ? null : closeMinutes,
    });
  }
  return days;
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

describe('Scheduling availability API (SCH-01)', () => {
  it('PUT of a seven-day template succeeds and reads back', async () => {
    const { accessToken, user } = await setupTestContext();

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/scheduling/availability/${user.id}/template`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, days: sevenDayTemplate() },
    });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().data.template).toHaveLength(7);
    expect(putRes.json().data).toHaveProperty('affectedAppointmentCount');

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/availability/${user.id}/template`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().data).toHaveLength(7);
  });

  it('a six-day template returns 400', async () => {
    const { accessToken, user } = await setupTestContext();

    const days = sevenDayTemplate().slice(0, 6);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scheduling/availability/${user.id}/template`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, days },
    });

    expect(res.statusCode).toBe(400);
  });

  it('a blocked period overlapping an existing one returns 409 BLOCKED_PERIOD_OVERLAP', async () => {
    const { accessToken, user } = await setupTestContext();
    const date = futureWeekday(1);

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/blocked-periods',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, date: date.toISOString(), startMinutes: 720, endMinutes: 780, reason: 'LUNCH' },
    });
    expect(first.statusCode).toBe(201);

    const overlapping = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/blocked-periods',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, date: date.toISOString(), startMinutes: 750, endMinutes: 800, reason: 'BREAK' },
    });

    expect(overlapping.statusCode).toBe(409);
    expect(overlapping.json().error.code).toBe('BLOCKED_PERIOD_OVERLAP');
  });

  it('OTHER with no reasonText returns 400', async () => {
    const { accessToken, user } = await setupTestContext();
    const date = futureWeekday(1);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/blocked-periods',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, date: date.toISOString(), startMinutes: 720, endMinutes: 780, reason: 'OTHER' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /scheduling/slots reflects the template, excludes blocked ranges and flags taken slots', async () => {
    const { accessToken, clinic, user, owner, pet, service } = await setupTestContext();
    await createTestVetAvailabilityWeek(clinic.id, user.id);
    const date = futureWeekday(1);

    const baseline = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/slots?vetId=${user.id}&date=${date.toISOString()}&serviceCatalogId=${service.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(baseline.statusCode).toBe(200);
    const baselineSlots = baseline.json().data;
    expect(baselineSlots.length).toBeGreaterThan(0);
    expect(baselineSlots.every((s: { isDoubleBooked: boolean }) => s.isDoubleBooked === false)).toBe(true);

    // Block the first hour of the day (540-600) -- two 30-minute slots.
    await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/blocked-periods',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, date: date.toISOString(), startMinutes: 540, endMinutes: 600, reason: 'LUNCH' },
    });

    const afterBlock = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/slots?vetId=${user.id}&date=${date.toISOString()}&serviceCatalogId=${service.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const blockedSlots = afterBlock.json().data;
    expect(blockedSlots.length).toBe(baselineSlots.length - 2);
    expect(blockedSlots.some((s: { startMinutes: number }) => s.startMinutes === 540)).toBe(false);

    // Book the 600-630 slot; it should now be flagged (not excluded).
    const scheduledFor = new Date(date.getTime() + 600 * 60000);
    const booking = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/appointments',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ownerId: owner.id, petIds: [pet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: scheduledFor.toISOString() },
    });
    expect(booking.statusCode).toBe(201);

    const afterBooking = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/slots?vetId=${user.id}&date=${date.toISOString()}&serviceCatalogId=${service.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const bookedSlots = afterBooking.json().data;
    const takenSlot = bookedSlots.find((s: { startMinutes: number }) => s.startMinutes === 600);
    expect(takenSlot).toBeDefined();
    expect(takenSlot.isDoubleBooked).toBe(true);
    // The slot count is unchanged from the blocked-only state -- a taken
    // slot is flagged, never excluded (D-14).
    expect(bookedSlots.length).toBe(blockedSlots.length);
  });

  it('GET /scheduling/availability/resolved returns null hours for a closed override day', async () => {
    const { accessToken, user } = await setupTestContext();
    const date = futureWeekday(1);

    const override = await app.inject({
      method: 'PUT',
      url: `/api/v1/scheduling/availability/${user.id}/override`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, date: date.toISOString(), isClosed: true, reason: 'Vet on leave' },
    });
    expect(override.statusCode).toBe(200);
    expect(override.json().data).toHaveProperty('affectedAppointmentCount');

    const resolved = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/availability/resolved?date=${date.toISOString()}&vetId=${user.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(resolved.statusCode).toBe(200);
    const [entry] = resolved.json().data;
    expect(entry.vetId).toBe(user.id);
    expect(entry.hours).toBeNull();
  });

  it('DELETE of a blocked period succeeds and a second delete returns 404', async () => {
    const { accessToken, user } = await setupTestContext();
    const date = futureWeekday(1);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/blocked-periods',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, date: date.toISOString(), startMinutes: 720, endMinutes: 780, reason: 'LUNCH' },
    });
    const blockedPeriodId = created.json().data.blockedPeriod.id;

    const firstDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/scheduling/blocked-periods/${blockedPeriodId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(firstDelete.statusCode).toBe(200);

    const secondDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/scheduling/blocked-periods/${blockedPeriodId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(secondDelete.statusCode).toBe(404);
    expect(secondDelete.json().error.code).toBe('BLOCKED_PERIOD_NOT_FOUND');
  });

  it('GET /scheduling/blocked-periods lists periods for a vet and date', async () => {
    const { accessToken, user } = await setupTestContext();
    const date = futureWeekday(1);

    await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/blocked-periods',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vetId: user.id, date: date.toISOString(), startMinutes: 720, endMinutes: 780, reason: 'LUNCH' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/blocked-periods?vetId=${user.id}&date=${date.toISOString()}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
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
    expect(vets.map((v: { id: string }) => v.id)).toContain(user.id);
    const ids = vets.map((v: { id: string }) => v.id);
    expect(ids).toEqual([...ids].sort());
  });
});
