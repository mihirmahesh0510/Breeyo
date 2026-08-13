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

// ─── Phase 6 billing factories (plan 06-03) ─────────────────────────────
//
// Money defaults are in PAISE (D-31), matching the columns. 50000 paise = ₹500.

export async function createTestInvoice(
  clinicId: string,
  createdById: string,
  overrides: Partial<{
    invoiceNumber: string;
    status: string;
    source: string;
    consultationId: string;
    petId: string;
    ownerId: string;
    notes: string;
    dueDate: Date;
    subtotalPaise: number;
    taxableValuePaise: number;
    grandTotalPaise: number;
    amountPaidPaise: number;
    balancePaise: number;
  }> = {},
) {
  return prisma.invoice.create({
    data: {
      clinicId,
      createdById,
      // Null while DRAFT (D-15): a number is only assigned at finalize.
      invoiceNumber: overrides.invoiceNumber,
      status: overrides.status || 'DRAFT',
      source: overrides.source || 'manual',
      consultationId: overrides.consultationId,
      petId: overrides.petId,
      ownerId: overrides.ownerId,
      notes: overrides.notes,
      dueDate: overrides.dueDate,
      subtotalPaise: overrides.subtotalPaise ?? 0,
      taxableValuePaise: overrides.taxableValuePaise ?? 0,
      grandTotalPaise: overrides.grandTotalPaise ?? 0,
      amountPaidPaise: overrides.amountPaidPaise ?? 0,
      balancePaise: overrides.balancePaise ?? 0,
    },
  });
}

export async function createTestInvoiceLineItem(
  clinicId: string,
  invoiceId: string,
  overrides: Partial<{
    lineType: string;
    description: string;
    sortOrder: number;
    quantity: number;
    unitPricePaise: number;
    taxTreatment: string;
    gstRatePercent: number;
    hsnSacCode: string;
    serviceCatalogId: string;
    inventoryItemId: string;
    stockMovementId: string;
    taxableValuePaise: number;
    lineTotalPaise: number;
  }> = {},
) {
  return prisma.invoiceLineItem.create({
    data: {
      clinicId,
      invoiceId,
      lineType: overrides.lineType || 'service',
      description:
        overrides.description || `Test Line ${randomUUID().slice(0, 6)}`,
      sortOrder: overrides.sortOrder ?? 0,
      quantity: overrides.quantity ?? 1,
      unitPricePaise: overrides.unitPricePaise ?? 50000,
      // Exempt by default: veterinary healthcare is GST-exempt by law
      // (Notification 12/2017-CT(R) Entry 46), so a taxable default would
      // quietly bake an incorrect tax charge into every fixture.
      taxTreatment: overrides.taxTreatment || 'exempt',
      gstRatePercent: overrides.gstRatePercent ?? 0,
      hsnSacCode: overrides.hsnSacCode,
      serviceCatalogId: overrides.serviceCatalogId,
      inventoryItemId: overrides.inventoryItemId,
      stockMovementId: overrides.stockMovementId,
      taxableValuePaise: overrides.taxableValuePaise ?? 0,
      lineTotalPaise: overrides.lineTotalPaise ?? 0,
    },
  });
}

export async function createTestPayment(
  clinicId: string,
  invoiceId: string,
  overrides: Partial<{
    method: string;
    channel: string;
    status: string;
    amountPaise: number;
    paidAt: Date | null;
    razorpayPaymentLinkId: string;
    razorpayPaymentId: string;
    expiresAt: Date;
    recordedById: string;
  }> = {},
) {
  return prisma.payment.create({
    data: {
      clinicId,
      invoiceId,
      method: overrides.method || 'cash',
      channel: overrides.channel || 'manual',
      status: overrides.status || 'captured',
      amountPaise: overrides.amountPaise ?? 50000,
      paidAt: overrides.paidAt === undefined ? new Date() : overrides.paidAt,
      razorpayPaymentLinkId: overrides.razorpayPaymentLinkId,
      razorpayPaymentId: overrides.razorpayPaymentId,
      expiresAt: overrides.expiresAt,
      recordedById: overrides.recordedById,
    },
  });
}

export async function createTestRefund(
  clinicId: string,
  invoiceId: string,
  createdById: string,
  overrides: Partial<{
    method: string;
    status: string;
    amountPaise: number;
    paymentId: string;
    razorpayRefundId: string;
    reason: string;
    processedAt: Date;
  }> = {},
) {
  return prisma.refund.create({
    data: {
      clinicId,
      invoiceId,
      createdById,
      method: overrides.method || 'cash',
      status: overrides.status || 'pending',
      amountPaise: overrides.amountPaise ?? 50000,
      paymentId: overrides.paymentId,
      razorpayRefundId: overrides.razorpayRefundId,
      reason: overrides.reason || 'Test refund',
      processedAt: overrides.processedAt,
    },
  });
}

export async function createTestCreditNote(
  clinicId: string,
  invoiceId: string,
  issuedById: string,
  overrides: Partial<{
    creditNoteNumber: string;
    reason: string;
    notes: string;
    subtotalPaise: number;
    taxableValuePaise: number;
    totalPaise: number;
    issuedAt: Date;
  }> = {},
) {
  return prisma.creditNote.create({
    data: {
      clinicId,
      invoiceId,
      issuedById,
      creditNoteNumber:
        overrides.creditNoteNumber || `CN-TEST-${randomUUID().slice(0, 6)}`,
      reason: overrides.reason || 'Test credit note',
      notes: overrides.notes,
      subtotalPaise: overrides.subtotalPaise ?? 0,
      taxableValuePaise: overrides.taxableValuePaise ?? 0,
      totalPaise: overrides.totalPaise ?? 0,
      issuedAt: overrides.issuedAt,
    },
  });
}

export async function createTestWebhookEvent(
  clinicId: string,
  overrides: Partial<{
    eventId: string;
    eventType: string;
    rawPayload: string;
    signatureVerified: boolean;
    processedAt: Date;
  }> = {},
) {
  return prisma.webhookEvent.create({
    data: {
      clinicId,
      // The x-razorpay-event-id header; UNIQUE, which is what makes duplicate
      // delivery a no-op.
      eventId: overrides.eventId || randomUUID(),
      eventType: overrides.eventType || 'payment_link.paid',
      rawPayload: overrides.rawPayload || '{}',
      signatureVerified: overrides.signatureVerified ?? true,
      processedAt: overrides.processedAt,
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
    // Phase 6 billing tables must go FIRST: invoices reference pets, pet_owners,
    // consultations and users with ON DELETE RESTRICT, so leaving them behind
    // makes every Phase 3/4 deletion below fail on an FK violation.
    await tx.creditNoteLineItem.deleteMany();
    await tx.creditNote.deleteMany();
    await tx.paymentReceipt.deleteMany();
    await tx.refund.deleteMany();
    await tx.payment.deleteMany();
    await tx.invoiceLineItem.deleteMany();
    await tx.invoice.deleteMany();
    await tx.invoiceNumberCounter.deleteMany();
    await tx.webhookEvent.deleteMany();
    await tx.billingAuditLog.deleteMany();

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

    // Phase 5 tables (inventory & pharmacy). Same reason as the Phase 3/4 block
    // above: these landed after this helper was written, and `clinic.deleteMany()`
    // fails on `inventory_items_clinic_id_fkey` once any test creates stock.
    await tx.stockMovement.deleteMany();
    await tx.stockBatch.deleteMany();
    await tx.inventoryBarcode.deleteMany();
    await tx.inventoryItem.deleteMany();
    await tx.clinicInventoryCategory.deleteMany();
    await tx.clinicInventoryUnit.deleteMany();

    await tx.clinic.deleteMany();
    await tx.user.deleteMany();
  });
}
