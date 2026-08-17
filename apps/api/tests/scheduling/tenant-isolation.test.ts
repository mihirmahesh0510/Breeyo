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
  createTestBlockedPeriod,
  prisma,
} from '../helpers/factories.js';
import { getTodayIST, addDaysIST, weekdayIST, minutesToIstDate } from '../../src/lib/ist-date.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

/**
 * Two fully-independent clinics (T-08-54/T-08-55/T-08-56): the tenancy
 * contract under test is that `clinicId` comes only from the JWT, and that a
 * cross-tenant miss is ALWAYS 404, never 403 (which would leak existence).
 */

function futureSlot(daysAhead: number, minutesOfDay = 600): Date {
  let day = addDaysIST(getTodayIST(), daysAhead);
  while (weekdayIST(day) === 0) {
    day = addDaysIST(day, 1);
  }
  return minutesToIstDate(day, minutesOfDay);
}

async function setupClinic(slotOffset: number) {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  await createTestVetAvailabilityWeek(clinic.id, user.id);
  const service = await createTestServiceForBooking(clinic.id, { durationMinutes: 30 });
  const slot = futureSlot(slotOffset, 600);
  const appointment = await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id, {
    scheduledFor: slot,
    durationMinutes: service.durationMinutes,
  });
  const blockedPeriod = await createTestBlockedPeriod(clinic.id, user.id, futureSlot(slotOffset, 0), user.id, {
    startMinutes: 720,
    endMinutes: 780,
  });
  return { user, clinic, accessToken, owner, pet, service, appointment, blockedPeriod, slot };
}

/** FrontDesk role (VIEW_SCHEDULE + MANAGE_SCHEDULE by default), with a
 * per-member override that revokes MANAGE_SCHEDULE -- the plan's own
 * instruction: no seeded role natively has VIEW_SCHEDULE without
 * MANAGE_SCHEDULE, so a custom fixture proves the second permission tier. */
async function createReadOnlyStaffToken(clinicId: string) {
  const user = await createTestUser();
  const member = await createTestClinicMember(user.id, clinicId, 'FrontDesk');
  const manageSchedule = await prisma.permission.findUniqueOrThrow({ where: { code: 'MANAGE_SCHEDULE' } });
  await prisma.userPermissionOverride.create({
    data: { clinicMemberId: member.id, permissionId: manageSchedule.id, granted: false },
  });
  const { accessToken } = await createTestTokens(app, user.id, clinicId);
  return accessToken;
}

/** InventoryManager holds neither VIEW_SCHEDULE nor MANAGE_SCHEDULE. */
async function createNoScheduleAccessToken(clinicId: string) {
  const user = await createTestUser();
  await createTestClinicMember(user.id, clinicId, 'InventoryManager');
  const { accessToken } = await createTestTokens(app, user.id, clinicId);
  return accessToken;
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

describe('Scheduling tenant isolation and permissions (security)', () => {
  it("clinic A's token reading clinic B's appointment id returns 404 (not 403, not 200)", async () => {
    const clinicA = await setupClinic(1);
    const clinicB = await setupClinic(2);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/appointments/${clinicB.appointment.id}`,
      headers: { authorization: `Bearer ${clinicA.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('APPOINTMENT_NOT_FOUND');

    const stillThere = await prisma.appointment.findUnique({ where: { id: clinicB.appointment.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.clinicId).toBe(clinicB.clinic.id);
  });

  it("rescheduling clinic B's appointment with clinic A's token returns 404 and leaves it unchanged", async () => {
    const clinicA = await setupClinic(1);
    const clinicB = await setupClinic(2);
    const newSlot = futureSlot(5, 660);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduling/appointments/${clinicB.appointment.id}`,
      headers: { authorization: `Bearer ${clinicA.accessToken}` },
      payload: { scheduledFor: newSlot.toISOString() },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('APPOINTMENT_NOT_FOUND');

    const stillThere = await prisma.appointment.findUnique({ where: { id: clinicB.appointment.id } });
    expect(stillThere!.scheduledFor.getTime()).toBe(clinicB.slot.getTime());
  });

  it("cancelling clinic B's appointment with clinic A's token returns 404 and leaves it SCHEDULED", async () => {
    const clinicA = await setupClinic(1);
    const clinicB = await setupClinic(2);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/scheduling/appointments/${clinicB.appointment.id}/cancel`,
      headers: { authorization: `Bearer ${clinicA.accessToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('APPOINTMENT_NOT_FOUND');

    const stillThere = await prisma.appointment.findUnique({ where: { id: clinicB.appointment.id } });
    expect(stillThere!.status).toBe('SCHEDULED');
  });

  it("status-updating clinic B's appointment with clinic A's token returns 404 and leaves it SCHEDULED", async () => {
    const clinicA = await setupClinic(1);
    const clinicB = await setupClinic(2);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduling/appointments/${clinicB.appointment.id}/status`,
      headers: { authorization: `Bearer ${clinicA.accessToken}` },
      payload: { status: 'CHECKED_IN' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('APPOINTMENT_NOT_FOUND');

    const stillThere = await prisma.appointment.findUnique({ where: { id: clinicB.appointment.id } });
    expect(stillThere!.status).toBe('SCHEDULED');
  });

  it("PUT of a template for clinic B's vet with clinic A's token returns 404", async () => {
    const clinicA = await setupClinic(1);
    const clinicB = await setupClinic(2);

    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      isClosed: weekday === 0,
      openMinutes: weekday === 0 ? null : 540,
      closeMinutes: weekday === 0 ? null : 1080,
    }));

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scheduling/availability/${clinicB.user.id}/template`,
      headers: { authorization: `Bearer ${clinicA.accessToken}` },
      payload: { vetId: clinicB.user.id, days },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('VET_NOT_FOUND');
  });

  it("deleting clinic B's blocked period with clinic A's token returns 404 and leaves the row intact", async () => {
    const clinicA = await setupClinic(1);
    const clinicB = await setupClinic(2);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/scheduling/blocked-periods/${clinicB.blockedPeriod.id}`,
      headers: { authorization: `Bearer ${clinicA.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('BLOCKED_PERIOD_NOT_FOUND');

    const stillThere = await prisma.blockedPeriod.findUnique({ where: { id: clinicB.blockedPeriod.id } });
    expect(stillThere).not.toBeNull();
  });

  it("a range read with clinic A's token never contains a clinic B appointment", async () => {
    const clinicA = await setupClinic(1);
    const clinicB = await setupClinic(1);

    const from = getTodayIST();
    const to = addDaysIST(from, 7);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
      headers: { authorization: `Bearer ${clinicA.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((a: { id: string }) => a.id);
    expect(ids).toContain(clinicA.appointment.id);
    expect(ids).not.toContain(clinicB.appointment.id);
  });

  it('a token with no VIEW_SCHEDULE permission gets 403 on a read endpoint', async () => {
    const clinicA = await setupClinic(1);
    const token = await createNoScheduleAccessToken(clinicA.clinic.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/vets',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('a token with VIEW_SCHEDULE but not MANAGE_SCHEDULE gets 403 on a write endpoint while succeeding on reads', async () => {
    const clinicA = await setupClinic(1);
    const token = await createReadOnlyStaffToken(clinicA.clinic.id);

    const readRes = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/vets',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(readRes.statusCode).toBe(200);

    const writeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduling/appointments',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ownerId: clinicA.owner.id,
        petIds: [clinicA.pet.id],
        vetId: clinicA.user.id,
        serviceCatalogId: clinicA.service.id,
        scheduledFor: futureSlot(3, 600).toISOString(),
      },
    });
    expect(writeRes.statusCode).toBe(403);
    expect(writeRes.json().error.code).toBe('FORBIDDEN');
  });
});
