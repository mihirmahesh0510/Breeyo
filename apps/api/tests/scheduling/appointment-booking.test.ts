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
  createTestBlockedPeriod,
} from '../helpers/factories.js';
import { getTodayIST, addDaysIST, weekdayIST, minutesToIstDate, istDateOnly } from '../../src/lib/ist-date.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  const secondPet = await createTestPet(clinic.id, owner.id, { name: 'Second Pet' });
  await createTestVetAvailabilityWeek(clinic.id, user.id);
  const service = await createTestServiceForBooking(clinic.id, { durationMinutes: 30 });
  return { user, clinic, accessToken, owner, pet, secondPet, service };
}

/** A future weekday slot (skips Sunday, closed by the default week fixture),
 * `daysAhead` IST calendar days out, at `minutesOfDay` past IST midnight. */
function futureSlot(daysAhead: number, minutesOfDay = 600): Date {
  let day = addDaysIST(getTodayIST(), daysAhead);
  while (weekdayIST(day) === 0) {
    day = addDaysIST(day, 1);
  }
  return minutesToIstDate(day, minutesOfDay);
}

/** A future Sunday -- the default fixture week's one closed day. */
function futureSunday(): Date {
  let day = addDaysIST(getTodayIST(), 1);
  while (weekdayIST(day) !== 0) {
    day = addDaysIST(day, 1);
  }
  return minutesToIstDate(day, 600);
}

function bookingBody(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: '',
    petIds: [],
    vetId: '',
    serviceCatalogId: '',
    scheduledFor: '',
    ...overrides,
  };
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
});

describe('Scheduling appointment booking (SCH-01)', () => {
  it('a valid booking returns 201 with the appointment and an empty warnings array', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const res = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [pet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: futureSlot(1, 600).toISOString(),
      }),
    );

    expect(res.statusCode).toBe(201);
    const { appointments, warnings } = res.json().data;
    expect(appointments).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('the persisted durationMinutes equals the service catalog\'s value', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const res = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [pet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: futureSlot(1, 600).toISOString(),
      }),
    );

    expect(res.statusCode).toBe(201);
    expect(res.json().data.appointments[0].durationMinutes).toBe(service.durationMinutes);
  });

  it('a booking 91 days out returns 400 BOOKING_HORIZON_EXCEEDED', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const res = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [pet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: futureSlot(91, 600).toISOString(),
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BOOKING_HORIZON_EXCEEDED');
  });

  it('a booking on a closed day returns 400 VET_NOT_AVAILABLE', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const res = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [pet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: futureSunday().toISOString(),
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VET_NOT_AVAILABLE');
  });

  it('a booking inside a blocked period returns 400 SLOT_BLOCKED', async () => {
    const { accessToken, clinic, owner, pet, user, service } = await setupTestContext();

    const slot = futureSlot(1, 600);
    // `createTestBlockedPeriod` writes the `date` column verbatim (unlike
    // the real POST endpoint, which normalizes through `istDateOnly` inside
    // `AvailabilityRepository.createBlockedPeriod`) -- pass an already
    // date-only value so the fixture matches what a real write would store,
    // or the day-scoped query in `getBlockedPeriods` never finds it.
    await createTestBlockedPeriod(clinic.id, user.id, istDateOnly(slot), user.id, {
      startMinutes: 540,
      endMinutes: 660,
      reason: 'LUNCH',
    });

    const res = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [pet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: slot.toISOString(),
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('SLOT_BLOCKED');
  });

  it('a second booking in the same slot returns 409 SLOT_DOUBLE_BOOKED', async () => {
    const { accessToken, owner, pet, secondPet, user, service } = await setupTestContext();
    const slot = futureSlot(1, 600);

    const first = await book(
      accessToken,
      bookingBody({ ownerId: owner.id, petIds: [pet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: slot.toISOString() }),
    );
    expect(first.statusCode).toBe(201);

    const second = await book(
      accessToken,
      bookingBody({ ownerId: owner.id, petIds: [secondPet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: slot.toISOString() }),
    );

    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('SLOT_DOUBLE_BOOKED');
  });

  it('the same request with allowDoubleBook: true returns 201 with a DOUBLE_BOOKED warning', async () => {
    const { accessToken, owner, pet, secondPet, user, service } = await setupTestContext();
    const slot = futureSlot(1, 600);

    const first = await book(
      accessToken,
      bookingBody({ ownerId: owner.id, petIds: [pet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: slot.toISOString() }),
    );
    expect(first.statusCode).toBe(201);

    const second = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [secondPet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: slot.toISOString(),
        allowDoubleBook: true,
      }),
    );

    expect(second.statusCode).toBe(201);
    const { warnings } = second.json().data;
    expect(warnings.some((w: { code: string }) => w.code === 'DOUBLE_BOOKED')).toBe(true);
  });

  it('a two-pet booking creates one appointment with two pet rows', async () => {
    const { accessToken, owner, pet, secondPet, user, service } = await setupTestContext();

    const res = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [pet.id, secondPet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: futureSlot(1, 600).toISOString(),
      }),
    );

    expect(res.statusCode).toBe(201);
    const { appointments } = res.json().data;
    expect(appointments).toHaveLength(1);
    expect(appointments[0].pets).toHaveLength(2);
  });

  it('a { WEEKLY, 4 } recurrence returns four linked appointments', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const res = await book(
      accessToken,
      bookingBody({
        ownerId: owner.id,
        petIds: [pet.id],
        vetId: user.id,
        serviceCatalogId: service.id,
        scheduledFor: futureSlot(1, 600).toISOString(),
        recurrence: { interval: 'WEEKLY', occurrences: 4 },
      }),
    );

    expect(res.statusCode).toBe(201);
    const { appointments } = res.json().data;
    expect(appointments).toHaveLength(4);
    const seriesId = appointments[0].recurringSeriesId;
    expect(seriesId).toBeTruthy();
    expect(appointments.every((a: { recurringSeriesId: string }) => a.recurringSeriesId === seriesId)).toBe(true);
  });

  it('PATCH /status with CHECKED_IN succeeds and COMPLETED from SCHEDULED returns 400 INVALID_TRANSITION', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const created = await book(
      accessToken,
      bookingBody({ ownerId: owner.id, petIds: [pet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: futureSlot(1, 600).toISOString() }),
    );
    const appointmentId = created.json().data.appointments[0].id;

    const checkedIn = await app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduling/appointments/${appointmentId}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'CHECKED_IN' },
    });
    expect(checkedIn.statusCode).toBe(200);
    expect(checkedIn.json().data.status).toBe('CHECKED_IN');

    // A fresh SCHEDULED appointment cannot jump straight to COMPLETED.
    const secondBooking = await book(
      accessToken,
      bookingBody({ ownerId: owner.id, petIds: [pet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: futureSlot(2, 600).toISOString() }),
    );
    const secondId = secondBooking.json().data.appointments[0].id;

    const invalidTransition = await app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduling/appointments/${secondId}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'COMPLETED' },
    });
    expect(invalidTransition.statusCode).toBe(400);
    expect(invalidTransition.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('a cancel returns 200 and the appointment reads back CANCELLED', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const created = await book(
      accessToken,
      bookingBody({ ownerId: owner.id, petIds: [pet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: futureSlot(1, 600).toISOString() }),
    );
    const appointmentId = created.json().data.appointments[0].id;

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/scheduling/appointments/${appointmentId}/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reason: 'Owner requested' },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().data.appointment.status).toBe('CANCELLED');

    const readBack = await app.inject({
      method: 'GET',
      url: `/api/v1/scheduling/appointments/${appointmentId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(readBack.json().data.status).toBe('CANCELLED');
  });

  it('a reschedule moves the appointment to the new slot', async () => {
    const { accessToken, owner, pet, user, service } = await setupTestContext();

    const created = await book(
      accessToken,
      bookingBody({ ownerId: owner.id, petIds: [pet.id], vetId: user.id, serviceCatalogId: service.id, scheduledFor: futureSlot(1, 600).toISOString() }),
    );
    const appointmentId = created.json().data.appointments[0].id;
    const newSlot = futureSlot(2, 660);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduling/appointments/${appointmentId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { scheduledFor: newSlot.toISOString() },
    });

    expect(res.statusCode).toBe(200);
    expect(new Date(res.json().data.appointment.scheduledFor).getTime()).toBe(newSlot.getTime());
  });
});
