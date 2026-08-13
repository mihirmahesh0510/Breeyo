import { PrismaClient } from '@prisma/client';
import type { RoleName } from '@breeyo/types';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export { prisma };

export async function createTestUser(
  overrides: Partial<{
    email: string;
    phone: string;
    fullName: string;
    password: string;
    isEmailVerified: boolean;
    isActive: boolean;
  }> = {},
) {
  const password = overrides.password || 'TestPassword123!';
  const passwordHash = await argon2.hash(password);

  return prisma.user.create({
    data: {
      email: overrides.email || `test-${randomUUID().slice(0, 8)}@test.com`,
      phone: overrides.phone || `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`,
      fullName: overrides.fullName || 'Test User',
      passwordHash,
      isEmailVerified: overrides.isEmailVerified ?? true,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createTestClinic(
  ownerId: string,
  overrides: Partial<{
    name: string;
    address: string;
    contactPhone: string;
  }> = {},
) {
  return prisma.clinic.create({
    data: {
      name: overrides.name || `Test Clinic ${randomUUID().slice(0, 6)}`,
      address: overrides.address || '123 Test Street, Mumbai 400001',
      contactPhone: overrides.contactPhone || `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`,
      ownerId,
    },
  });
}

export async function createTestClinicMember(
  userId: string,
  clinicId: string,
  roleName: RoleName = 'Admin',
) {
  const member = await prisma.clinicMember.create({
    data: {
      userId,
      clinicId,
      isActive: true,
    },
  });

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (role) {
    await prisma.clinicMemberRole.create({
      data: {
        clinicMemberId: member.id,
        roleId: role.id,
      },
    });
  }

  return member;
}

// ─── Phase 3/4 factories (added by Phase 6 plan 06-00 for D-30 isolation tests)

export async function createTestPetOwner(
  clinicId: string,
  overrides: Partial<{
    mobile: string;
    name: string;
    email: string;
    address: string;
    altPhone: string;
  }> = {},
) {
  return prisma.petOwner.create({
    data: {
      clinicId,
      // [clinicId, mobile] is unique -- keep the random suffix
      mobile: overrides.mobile || `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`,
      name: overrides.name || `Test Owner ${randomUUID().slice(0, 6)}`,
      email: overrides.email,
      address: overrides.address,
      altPhone: overrides.altPhone,
    },
  });
}

export async function createTestPet(
  clinicId: string,
  ownerId: string,
  overrides: Partial<{
    name: string;
    species: 'DOG' | 'CAT' | 'BIRD' | 'RABBIT' | 'FISH' | 'REPTILE' | 'OTHER';
    breed: string;
    weight: number;
  }> = {},
) {
  return prisma.pet.create({
    data: {
      clinicId,
      ownerId,
      name: overrides.name || `Test Pet ${randomUUID().slice(0, 6)}`,
      species: overrides.species || 'DOG',
      breed: overrides.breed,
      weight: overrides.weight,
    },
  });
}

export async function createTestConsultation(
  clinicId: string,
  petId: string,
  vetId: string,
  overrides: Partial<{
    visitType: string;
    status: string;
    assessment: string;
  }> = {},
) {
  return prisma.consultation.create({
    data: {
      clinicId,
      petId,
      vetId,
      visitType: overrides.visitType || 'general',
      status: overrides.status || 'draft',
      assessment: overrides.assessment,
    },
  });
}

export async function createTestServiceCatalogEntry(
  clinicId: string,
  overrides: Partial<{
    name: string;
    category: string;
    price: number;
    sacCode: string;
    gstRateOverride: number;
    isActive: boolean;
  }> = {},
) {
  return prisma.serviceCatalog.create({
    data: {
      clinicId,
      name: overrides.name || `Test Service ${randomUUID().slice(0, 6)}`,
      category: overrides.category || 'other',
      // price in paise
      price: overrides.price ?? 50000,
      sacCode: overrides.sacCode || '998351',
      gstRateOverride: overrides.gstRateOverride ?? 0,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createTestPrescription(
  consultationId: string,
  overrides: Partial<{
    drugName: string;
    formulation: string;
    strength: string;
    dosage: string;
    route: string;
    frequency: string;
    duration: string;
  }> = {},
) {
  return prisma.prescription.create({
    data: {
      consultationId,
      drugName: overrides.drugName || `Test Drug ${randomUUID().slice(0, 6)}`,
      formulation: overrides.formulation || 'tablet',
      strength: overrides.strength || '500mg',
      dosage: overrides.dosage || '1 tablet',
      route: overrides.route || 'oral',
      frequency: overrides.frequency || 'BID',
      duration: overrides.duration || '5 days',
    },
  });
}

export async function createTestTokens(
  app: any,
  userId: string,
  clinicId: string,
) {
  const accessToken = app.jwt.sign(
    { sub: userId, clinicId, type: 'access' },
    { expiresIn: '15m' },
  );

  const refreshToken = app.jwt.sign(
    {
      sub: userId,
      clinicId,
      type: 'refresh',
      familyId: randomUUID(),
      tokenId: randomUUID(),
    },
    { expiresIn: '7d' },
  );

  return { accessToken, refreshToken };
}

export async function cleanupTestData() {
  // Delete in reverse dependency order inside an interactive transaction
  // to avoid FK violations from parallel test file execution
  await prisma.$transaction(async (tx) => {
    await tx.authAuditLog.deleteMany();
    await tx.notification.deleteMany();
    await tx.deviceToken.deleteMany();
    await tx.refreshToken.deleteMany();
    await tx.userPermissionOverride.deleteMany();
    await tx.clinicMemberRole.deleteMany();
    await tx.clinicMember.deleteMany();

    // Phase 3/4 tables (patient, queue, EMR & clinical records) — these were
    // added after this helper was written, and must be cleared before
    // clinic/pet rows or `tx.clinic.deleteMany()` below fails on FK
    // violations (e.g. `pet_owners_clinic_id_fkey`) once any test in the run
    // has created patient/queue/EMR data.
    await tx.consultationAttachment.deleteMany();
    await tx.prescription.deleteMany();
    await tx.vitals.deleteMany();
    await tx.vaccinationRecord.deleteMany();
    await tx.dewormingRecord.deleteMany();
    await tx.consultationDraft.deleteMany();
    await tx.consultationLock.deleteMany();
    await tx.consultation.deleteMany();
    await tx.queueEntry.deleteMany();
    await tx.consentRecord.deleteMany();
    await tx.serviceCatalog.deleteMany();
    await tx.pet.deleteMany();
    await tx.petOwner.deleteMany();

    await tx.clinic.deleteMany();
    await tx.user.deleteMany();
  });
}
