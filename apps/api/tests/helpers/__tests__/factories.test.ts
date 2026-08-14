import { describe, it, expect, afterAll } from 'vitest';
import {
  prisma,
  createTestUser,
  createTestClinic,
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  createTestVaccinationRecord,
  createTestDewormingRecord,
  createTestWhatsAppThread,
  createTestWhatsAppMessage,
  createTestWhatsAppReminderTask,
  createTestWhatsAppBookingRequest,
  createTestWhatsAppSlotHold,
  createTestWhatsAppClinicConfig,
  cleanupTestData,
} from '../factories.js';

describe('Phase 7 test data factories (WHA-01/02/03/05)', () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it('createTestPetOwner creates a PetOwner with a unique +91 mobile', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);

    expect(owner.id).toBeDefined();
    expect(owner.mobile.startsWith('+91')).toBe(true);
    expect(owner.clinicId).toBe(clinic.id);
  });

  it('createTestPet creates a Pet linked to its owner', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, owner.id);

    expect(pet.ownerId).toBe(owner.id);
    expect(pet.clinicId).toBe(clinic.id);
  });

  it('createTestConsultation sets followUpDate from the override (WHA-01 / D-01)', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, owner.id);
    const followUpDate = new Date('2026-09-01T18:30:00.000Z');

    const consultation = await createTestConsultation(clinic.id, pet.id, user.id, {
      followUpDate,
    });

    expect(consultation.followUpDate?.toISOString()).toBe(followUpDate.toISOString());
  });

  it('createTestVaccinationRecord sets nextDueDate from the override (WHA-01 / D-02)', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, owner.id);
    const nextDueDate = new Date('2026-09-05T18:30:00.000Z');

    const record = await createTestVaccinationRecord(clinic.id, pet.id, {
      vaccineName: 'Rabies',
      administeredAt: new Date('2026-08-01T00:00:00Z'),
      nextDueDate,
    });

    expect(record.vaccineName).toBe('Rabies');
    expect(record.nextDueDate?.toISOString()).toBe(nextDueDate.toISOString());
  });

  it('createTestDewormingRecord sets nextDueDate from the override', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, owner.id);
    const nextDueDate = new Date('2026-09-10T18:30:00.000Z');

    const record = await createTestDewormingRecord(clinic.id, pet.id, {
      administeredAt: new Date('2026-08-10T00:00:00Z'),
      nextDueDate,
    });

    expect(record.nextDueDate?.toISOString()).toBe(nextDueDate.toISOString());
  });

  it('createTestWhatsAppThread creates a thread with a "+"-prefixed waPhone', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);

    const thread = await createTestWhatsAppThread(clinic.id, owner.id);

    expect(thread.waPhone.startsWith('+')).toBe(true);
    expect(thread.clinicId).toBe(clinic.id);
    expect(thread.ownerId).toBe(owner.id);
  });

  it('createTestWhatsAppClinicConfig defaults to SIMULATOR/NORMAL/autoReplyEnabled true/autoReplyDelaySeconds 10 (D-14, D-16)', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);

    const config = await createTestWhatsAppClinicConfig(clinic.id);

    expect(config.provider).toBe('SIMULATOR');
    expect(config.deliveryMode).toBe('NORMAL');
    expect(config.autoReplyEnabled).toBe(true);
    expect(config.autoReplyDelaySeconds).toBe(10);
  });

  it('allows two vaccination records for the same pet/vaccine with different administeredAt (append-only history, 07-11)', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, owner.id);

    const first = await createTestVaccinationRecord(clinic.id, pet.id, {
      vaccineName: 'Rabies',
      administeredAt: new Date('2025-08-01T00:00:00Z'),
    });
    const second = await createTestVaccinationRecord(clinic.id, pet.id, {
      vaccineName: 'Rabies',
      administeredAt: new Date('2026-08-01T00:00:00Z'),
    });

    expect(first.id).not.toBe(second.id);
  });

  it('cleanupTestData empties every table in a full Phase 7 fixture graph with no FK error', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, owner.id);
    const consultation = await createTestConsultation(clinic.id, pet.id, user.id, {
      followUpDate: new Date(),
    });
    await createTestVaccinationRecord(clinic.id, pet.id, { consultationId: consultation.id });
    const thread = await createTestWhatsAppThread(clinic.id, owner.id);
    await createTestWhatsAppMessage(clinic.id, thread.id);
    await createTestWhatsAppReminderTask(clinic.id, owner.id, pet.id, {
      sourceId: consultation.id,
    });
    const booking = await createTestWhatsAppBookingRequest(clinic.id, thread.id, owner.id, pet.id);
    await createTestWhatsAppSlotHold(clinic.id, booking.id);
    await createTestWhatsAppClinicConfig(clinic.id);

    await cleanupTestData();

    expect(await prisma.whatsAppSlotHold.count()).toBe(0);
    expect(await prisma.whatsAppBookingRequest.count()).toBe(0);
    expect(await prisma.whatsAppReminderTask.count()).toBe(0);
    expect(await prisma.whatsAppMessage.count()).toBe(0);
    expect(await prisma.whatsAppThread.count()).toBe(0);
    expect(await prisma.whatsAppClinicConfig.count()).toBe(0);
    expect(await prisma.vaccinationRecord.count()).toBe(0);
    expect(await prisma.consultation.count()).toBe(0);
    expect(await prisma.pet.count()).toBe(0);
    expect(await prisma.petOwner.count()).toBe(0);
    expect(await prisma.clinic.count()).toBe(0);
  });

  it('cleanupTestData is idempotent', async () => {
    await cleanupTestData();
    await expect(cleanupTestData()).resolves.not.toThrow();
  });
});
