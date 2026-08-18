import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestPetOwner,
  createTestPet,
  createTestVetAvailabilityTemplate,
  createTestAvailabilityOverride,
  createTestBlockedPeriod,
  createTestAppointment,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

/**
 * A full clinic context: owning user (doubles as the vet/creator in these
 * DB-shape tests, which don't exercise RBAC), a pet owner, and one pet.
 */
async function setupClinicContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  return { user, clinic, owner, pet };
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

describe('Scheduling schema shape (08-03, SCH-01, SCH-02)', () => {
  it('scheduling tables exist and are clinic-scoped', async () => {
    const tables = [
      'appointments',
      'appointment_pets',
      'vet_availability_templates',
      'availability_overrides',
      'blocked_periods',
    ];

    for (const table of tables) {
      const rows = await prisma.$queryRaw<Array<{ data_type: string }>>`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'clinic_id'
      `;
      expect(rows, `${table}.clinic_id should exist`).toHaveLength(1);
      expect(rows[0].data_type).toBe('uuid');
    }
  });

  it('appointment duration is an integer snapshot (D-02)', async () => {
    const [apptCol] = await prisma.$queryRaw<
      Array<{ data_type: string; is_nullable: string }>
    >`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'appointments' AND column_name = 'duration_minutes'
    `;
    expect(apptCol.data_type).toBe('integer');
    expect(apptCol.is_nullable).toBe('NO');

    const [svcCol] = await prisma.$queryRaw<
      Array<{ data_type: string; column_default: string | null }>
    >`
      SELECT data_type, column_default FROM information_schema.columns
      WHERE table_name = 'service_catalog' AND column_name = 'duration_minutes'
    `;
    expect(svcCol.data_type).toBe('integer');
    expect(svcCol.column_default).not.toBeNull();
  });

  it('queue_priority_at is non-null (D-08, D-10)', async () => {
    const [col] = await prisma.$queryRaw<
      Array<{ data_type: string; is_nullable: string }>
    >`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'queue_entries' AND column_name = 'queue_priority_at'
    `;
    expect(col.data_type).toBe('timestamp without time zone');
    expect(col.is_nullable).toBe('NO');
  });

  it('EXPECTED is a live enum value (D-08)', async () => {
    const { clinic, pet } = await setupClinicContext();

    const entry = await prisma.queueEntry.create({
      data: {
        clinicId: clinic.id,
        petId: pet.id,
        checkedInBy: randomUUID(),
        status: 'EXPECTED',
        position: 1,
        queuePriorityAt: new Date(),
      },
    });
    expect(entry.status).toBe('EXPECTED');

    const found = await prisma.queueEntry.findUnique({ where: { id: entry.id } });
    expect(found?.status).toBe('EXPECTED');
  });

  it('one appointment can carry multiple pets (D-21)', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();
    const pet2 = await createTestPet(clinic.id, owner.id);

    const appointment = await createTestAppointment(
      clinic.id,
      user.id,
      owner.id,
      [pet.id, pet2.id],
      user.id,
    );

    expect(appointment.pets).toHaveLength(2);

    const rows = await prisma.appointmentPet.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(rows).toHaveLength(2);

    // @@unique([appointmentId, petId]): the same pair rejects on a second insert.
    await expect(
      prisma.appointmentPet.create({
        data: { clinicId: clinic.id, appointmentId: appointment.id, petId: pet.id },
      }),
    ).rejects.toThrow();
  });

  it('availability template is unique per vet-weekday (D-04)', async () => {
    const { clinic, user } = await setupClinicContext();
    const otherVet = await createTestUser();

    await createTestVetAvailabilityTemplate(clinic.id, user.id, { weekday: 2 });

    await expect(
      createTestVetAvailabilityTemplate(clinic.id, user.id, { weekday: 2 }),
    ).rejects.toThrow();

    // Same weekday, different vet: no conflict.
    await expect(
      createTestVetAvailabilityTemplate(clinic.id, otherVet.id, { weekday: 2 }),
    ).resolves.toBeDefined();
  });

  it('availability override is unique per vet-date (D-01)', async () => {
    const { clinic, user } = await setupClinicContext();
    const date = new Date('2026-09-01');

    await createTestAvailabilityOverride(clinic.id, user.id, date);

    await expect(
      createTestAvailabilityOverride(clinic.id, user.id, date),
    ).rejects.toThrow();
  });

  it('cross-tenant appointment read returns nothing (T-08-07)', async () => {
    const clinicA = await setupClinicContext();
    const clinicB = await setupClinicContext();

    await createTestAppointment(
      clinicB.clinic.id,
      clinicB.user.id,
      clinicB.owner.id,
      [clinicB.pet.id],
      clinicB.user.id,
    );

    const found = await prisma.appointment.findMany({
      where: { clinicId: clinicA.clinic.id },
    });
    expect(found).toHaveLength(0);
  });

  it('cleanup leaves no scheduling rows', async () => {
    const { clinic, owner, pet, user } = await setupClinicContext();

    await createTestVetAvailabilityTemplate(clinic.id, user.id);
    await createTestAvailabilityOverride(clinic.id, user.id, new Date('2026-09-05'));
    await createTestBlockedPeriod(clinic.id, user.id, new Date('2026-09-05'), user.id);
    await createTestAppointment(clinic.id, user.id, owner.id, [pet.id], user.id);

    await cleanupTestData();

    const [appointments, appointmentPets, templates, overrides, blocked] = await Promise.all([
      prisma.appointment.count(),
      prisma.appointmentPet.count(),
      prisma.vetAvailabilityTemplate.count(),
      prisma.availabilityOverride.count(),
      prisma.blockedPeriod.count(),
    ]);

    expect(appointments).toBe(0);
    expect(appointmentPets).toBe(0);
    expect(templates).toBe(0);
    expect(overrides).toBe(0);
    expect(blocked).toBe(0);
  });
});
