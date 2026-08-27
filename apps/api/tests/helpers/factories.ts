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
    /**
     * D-29 Razorpay credentials. Pass `razorpayKeySecretEnc` as an
     * `encryptSecret(...)` envelope, never plaintext — the payment suite
     * decrypts it for real so that the credential path is exercised rather than
     * bypassed, and a plaintext value would fail the envelope check in
     * `lib/crypto.ts` exactly as a corrupted row would in production.
     */
    razorpayKeyId: string;
    razorpayKeySecretEnc: string;
    razorpayWebhookSecretEnc: string;
    razorpayWebhookToken: string;
  }> = {},
) {
  return prisma.clinic.create({
    data: {
      name: overrides.name || `Test Clinic ${randomUUID().slice(0, 6)}`,
      address: overrides.address || '123 Test Street, Mumbai 400001',
      contactPhone: overrides.contactPhone || `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`,
      ownerId,
      ...(overrides.razorpayKeyId ? { razorpayKeyId: overrides.razorpayKeyId } : {}),
      ...(overrides.razorpayKeySecretEnc
        ? { razorpayKeySecretEnc: overrides.razorpayKeySecretEnc }
        : {}),
      ...(overrides.razorpayWebhookSecretEnc
        ? { razorpayWebhookSecretEnc: overrides.razorpayWebhookSecretEnc }
        : {}),
      ...(overrides.razorpayWebhookToken
        ? { razorpayWebhookToken: overrides.razorpayWebhookToken }
        : {}),
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
    /**
     * RPT-01 (D-33): the dashboard counts distinct pets over consultations
     * whose `finalizedAt` falls inside the IST day, so a suite exercising the
     * timezone boundary has to be able to place this instant deliberately.
     * Defaults to null, matching the `draft` default status above — a draft
     * consultation has not been finalized and must not carry a timestamp
     * claiming it was.
     */
    finalizedAt: Date | null;
    /**
     * WHA-01 / D-01: the follow-up reminder sweep reads this straight off the
     * consultation row (Phase 4 D-09), so Phase 7 fixtures need to be able to
     * set it directly rather than only through the finalize-consultation flow.
     */
    followUpDate: Date | null;
    followUpReason: string;
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
      finalizedAt: overrides.finalizedAt ?? null,
      followUpDate: overrides.followUpDate,
      followUpReason: overrides.followUpReason,
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

export async function createTestVaccinationRecord(
  clinicId: string,
  petId: string,
  overrides: Partial<{
    consultationId: string;
    vaccineName: string;
    batchNumber: string;
    manufacturer: string;
    expiryDate: Date;
    administeredAt: Date;
    administeredBy: string;
    /** WHA-01 / D-02 source: the reminder sweep reads this to schedule the
     * fixed 3-days-before + on-due-date two-touch pattern. */
    nextDueDate: Date | null;
  }> = {},
) {
  return prisma.vaccinationRecord.create({
    data: {
      clinicId,
      petId,
      consultationId: overrides.consultationId,
      vaccineName: overrides.vaccineName || `Test Vaccine ${randomUUID().slice(0, 6)}`,
      batchNumber: overrides.batchNumber,
      manufacturer: overrides.manufacturer,
      expiryDate: overrides.expiryDate,
      administeredAt: overrides.administeredAt || new Date(),
      // `administered_by` has no FK constraint at the DB level (schema.prisma
      // models it as a bare UUID column, not a relation) -- a random UUID is
      // fine when the caller doesn't need it to resolve to a real user.
      administeredBy: overrides.administeredBy || randomUUID(),
      nextDueDate: overrides.nextDueDate,
    },
  });
}

export async function createTestDewormingRecord(
  clinicId: string,
  petId: string,
  overrides: Partial<{
    consultationId: string;
    drugName: string;
    administeredAt: Date;
    administeredBy: string;
    /** WHA-01 / D-02 source, same shape as VaccinationRecord.nextDueDate. */
    nextDueDate: Date | null;
  }> = {},
) {
  return prisma.dewormingRecord.create({
    data: {
      clinicId,
      petId,
      consultationId: overrides.consultationId,
      drugName: overrides.drugName || `Test Dewormer ${randomUUID().slice(0, 6)}`,
      administeredAt: overrides.administeredAt || new Date(),
      administeredBy: overrides.administeredBy || randomUUID(),
      nextDueDate: overrides.nextDueDate,
    },
  });
}

// ─── Phase 7 WhatsApp communication factories (plan 07-04) ──────────────
//
// WHA-01/02/03/05. `clinicId` is always the first argument, matching every
// other factory in this file; owner/pet/thread ids follow the same order the
// underlying Prisma model's foreign keys appear in schema.prisma.

export async function createTestWhatsAppThread(
  clinicId: string,
  ownerId: string,
  overrides: Partial<{
    waPhone: string;
    resolvedWaId: string;
    numberStatus: 'VALID' | 'INVALID';
    needsAction: boolean;
    needsActionReason: string;
    lastMessageAt: Date;
    lastMessagePreview: string;
    lastContextType: 'NONE' | 'INVOICE' | 'PET' | 'REMINDER' | 'BOOKING' | 'DOCUMENT';
    serviceWindowExpiresAt: Date;
  }> = {},
) {
  return prisma.whatsAppThread.create({
    data: {
      clinicId,
      ownerId,
      // [clinicId, waPhone] is unique -- keep the random suffix.
      waPhone: overrides.waPhone || `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`,
      resolvedWaId: overrides.resolvedWaId,
      numberStatus: overrides.numberStatus || 'VALID',
      needsAction: overrides.needsAction ?? false,
      needsActionReason: overrides.needsActionReason,
      lastMessageAt: overrides.lastMessageAt,
      lastMessagePreview: overrides.lastMessagePreview,
      lastContextType: overrides.lastContextType || 'NONE',
      serviceWindowExpiresAt: overrides.serviceWindowExpiresAt,
    },
  });
}

export async function createTestWhatsAppMessage(
  clinicId: string,
  threadId: string,
  overrides: Partial<{
    direction: 'OUTBOUND' | 'INBOUND';
    channel: 'SIMULATOR' | 'CLOUD_API';
    providerMessageId: string;
    templateKey: string;
    templateCategory: string;
    body: string;
    status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'REPLIED';
    contextType: 'NONE' | 'INVOICE' | 'PET' | 'REMINDER' | 'BOOKING' | 'DOCUMENT';
    contextId: string;
    sentByUserId: string;
    reminderTaskId: string;
    bookingRequestId: string;
  }> = {},
) {
  return prisma.whatsAppMessage.create({
    data: {
      clinicId,
      threadId,
      direction: overrides.direction || 'OUTBOUND',
      channel: overrides.channel || 'SIMULATOR',
      providerMessageId: overrides.providerMessageId,
      templateKey: overrides.templateKey,
      templateCategory: overrides.templateCategory,
      body: overrides.body || 'Test message body',
      // Defaults to QUEUED (WHA-05 Pattern 2): a send persists the row before
      // any dispatch, so a fixture that skipped straight to SENT would hide
      // bugs in that ordering.
      status: overrides.status || 'QUEUED',
      contextType: overrides.contextType || 'NONE',
      contextId: overrides.contextId,
      sentByUserId: overrides.sentByUserId,
      reminderTaskId: overrides.reminderTaskId,
      bookingRequestId: overrides.bookingRequestId,
    },
  });
}

export async function createTestWhatsAppReminderTask(
  clinicId: string,
  ownerId: string,
  petId: string,
  overrides: Partial<{
    kind: 'FOLLOW_UP' | 'VACCINE_DUE' | 'DEWORMING_DUE';
    touch: 'ADVANCE' | 'ON_DATE';
    sourceType: string;
    sourceId: string;
    sourceLabel: string;
    dueDate: Date;
    scheduledFor: Date;
    state: 'PENDING' | 'SENT' | 'REPLIED' | 'CAPPED_NEEDS_ACTION' | 'CANCELLED';
    attemptCount: number;
  }> = {},
) {
  const dueDate = overrides.dueDate || new Date();
  return prisma.whatsAppReminderTask.create({
    data: {
      clinicId,
      ownerId,
      petId,
      kind: overrides.kind || 'FOLLOW_UP',
      touch: overrides.touch || 'ADVANCE',
      sourceType: overrides.sourceType || 'CONSULTATION',
      sourceId: overrides.sourceId || randomUUID(),
      sourceLabel: overrides.sourceLabel,
      dueDate,
      scheduledFor: overrides.scheduledFor || dueDate,
      state: overrides.state || 'PENDING',
      attemptCount: overrides.attemptCount ?? 0,
    },
  });
}

export async function createTestWhatsAppBookingRequest(
  clinicId: string,
  threadId: string,
  ownerId: string,
  petId: string,
  overrides: Partial<{
    reference: string;
    state: 'AWAITING_SLOT_CHOICE' | 'CONFIRMED' | 'CANCELLED' | 'MOVED' | 'EXPIRED';
    slotDate: Date;
    slotStartMinutes: number;
    slotDurationMinutes: number;
    confirmedAt: Date;
    cancelledAt: Date;
    cancelReason: string;
    actedByUserId: string;
  }> = {},
) {
  return prisma.whatsAppBookingRequest.create({
    data: {
      clinicId,
      threadId,
      ownerId,
      petId, // D-21: booking flow always carries a petId
      reference: overrides.reference || `BK-TEST-${randomUUID().slice(0, 8)}`,
      state: overrides.state || 'AWAITING_SLOT_CHOICE',
      slotDate: overrides.slotDate,
      slotStartMinutes: overrides.slotStartMinutes,
      slotDurationMinutes: overrides.slotDurationMinutes,
      confirmedAt: overrides.confirmedAt,
      cancelledAt: overrides.cancelledAt,
      cancelReason: overrides.cancelReason,
      actedByUserId: overrides.actedByUserId,
    },
  });
}

/**
 * D-07/D-08: a confirmed booking's slot hold is what makes the slot
 * unavailable to other WhatsApp booking requests for that clinic/day.
 */
export async function createTestWhatsAppSlotHold(
  clinicId: string,
  bookingRequestId: string,
  overrides: Partial<{
    slotDate: Date;
    slotStartMinutes: number;
  }> = {},
) {
  return prisma.whatsAppSlotHold.create({
    data: {
      clinicId,
      bookingRequestId,
      slotDate: overrides.slotDate || new Date(),
      slotStartMinutes: overrides.slotStartMinutes ?? 540, // 09:00 IST default
    },
  });
}

export async function createTestWhatsAppClinicConfig(
  clinicId: string,
  overrides: Partial<{
    provider: 'SIMULATOR' | 'CLOUD_API';
    deliveryMode: 'NORMAL' | 'DELAYED' | 'FAIL' | 'INVALID_NUMBER';
    autoReplyEnabled: boolean;
    autoReplyDelaySeconds: number;
    allowFreeformOutsideWindow: boolean;
    slotDurationMinutes: number;
    escalationMaxAttempts: number;
    escalationIntervalDays: number;
  }> = {},
) {
  return prisma.whatsAppClinicConfig.create({
    data: {
      clinicId,
      // D-14/D-16 Beta defaults: simulator, normal delivery, auto-reply on
      // with a 10s delay so demo threads feel alive without staff input.
      provider: overrides.provider || 'SIMULATOR',
      deliveryMode: overrides.deliveryMode || 'NORMAL',
      autoReplyEnabled: overrides.autoReplyEnabled ?? true,
      autoReplyDelaySeconds: overrides.autoReplyDelaySeconds ?? 10,
      allowFreeformOutsideWindow: overrides.allowFreeformOutsideWindow ?? false,
      slotDurationMinutes: overrides.slotDurationMinutes ?? 30,
      escalationMaxAttempts: overrides.escalationMaxAttempts ?? 2,
      escalationIntervalDays: overrides.escalationIntervalDays ?? 3,
    },
  });
}

// ─── Phase 5 inventory factories (added by plan 06-08) ──────────────────
//
// Phase 5 shipped no test factories of its own, so these were added here rather
// than defining a second set elsewhere. `sellingPrice` and `unitPrice` are
// RUPEES (Decimal(10,2)) — Phase 5's unit — not paise. The single conversion to
// paise is `toPaise` inside the billing service (D-31).

export async function createTestInventoryItem(
  clinicId: string,
  overrides: Partial<{
    name: string;
    category: string;
    unit: string;
    /** RUPEES, matching Phase 5's Decimal(10,2) column. */
    sellingPrice: number;
    hsnSacCode: string;
    gstRate: number;
    currentStock: number;
  }> = {},
) {
  return prisma.inventoryItem.create({
    data: {
      clinicId,
      name: overrides.name || `Test Item ${randomUUID().slice(0, 6)}`,
      category: overrides.category || 'medicine',
      unit: overrides.unit || 'tablets',
      sellingPrice: overrides.sellingPrice ?? 25.5,
      hsnSacCode: overrides.hsnSacCode ?? '3004',
      gstRate: overrides.gstRate ?? 5,
      currentStock: overrides.currentStock ?? 0,
    },
  });
}

/**
 * A receivable batch. `currentQty` defaults equal to `initialQty` because a
 * freshly received batch has had nothing taken from it yet; a fixture that
 * silently disagreed would make every later before/after stock assertion
 * meaningless.
 *
 * `expiryDate` defaults a year out. Pass a past date to build the
 * expired-batch-is-not-drawn-from fixture — note `isExpired` must be set too
 * only if the intent is Phase 5's flagged-expired state; the FIFO query also
 * excludes any batch whose `expiryDate` is in the past regardless of the flag.
 */
export async function createTestStockBatch(
  clinicId: string,
  itemId: string,
  overrides: Partial<{
    initialQty: number;
    currentQty: number;
    expiryDate: Date | null;
    isExpired: boolean;
    lotNumber: string;
    receivedAt: Date;
    purchasePrice: number;
  }> = {},
) {
  const initialQty = overrides.initialQty ?? 10;
  const batch = await prisma.stockBatch.create({
    data: {
      clinicId,
      itemId,
      lotNumber: overrides.lotNumber || `LOT-${randomUUID().slice(0, 6)}`,
      initialQty,
      currentQty: overrides.currentQty ?? initialQty,
      expiryDate:
        overrides.expiryDate === undefined
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : overrides.expiryDate,
      isExpired: overrides.isExpired ?? false,
      receivedAt: overrides.receivedAt ?? new Date(),
      purchasePrice: overrides.purchasePrice ?? 10,
    },
  });

  // Keep the item's denormalised running total consistent with the batches it
  // owns, exactly as Phase 5's receive flow does.
  await prisma.inventoryItem.update({
    where: { id: itemId },
    data: { currentStock: { increment: batch.currentQty } },
  });

  return batch;
}

/**
 * Reproduces Phase 5's POST-DISPENSE state by running Phase 5's own
 * `FifoDispenseService`, not by hand-writing rows.
 *
 * This matters for the double-deduction tests in `finalize-stock.test.ts`. A
 * fixture that inserted the `dispensed` movement WITHOUT decrementing the batch
 * would leave the batch sitting on exactly the number a buggy second deduction
 * produces, and the bug would be invisible. Delegating to the real service means
 * the fixture cannot drift from real Phase 5 behaviour at all.
 *
 * Returns the movement rows the dispense produced (one per batch touched), so a
 * caller can assert on `stockMovementId` provenance directly.
 */
export async function dispenseForTest(
  clinicId: string,
  itemId: string,
  quantity: number,
  opts: {
    userId: string;
    userName?: string;
    consultationId?: string | null;
    ownerId?: string | null;
    overrideBatchId?: string;
  },
) {
  const { createTenantClient } = await import('../../src/lib/prisma-rls.js');
  const { FifoDispenseService } = await import(
    '../../src/modules/inventory/fifo-dispense.service.js'
  );
  const { StockMovementService } = await import(
    '../../src/modules/inventory/stock-movement.service.js'
  );

  const db = createTenantClient(clinicId);
  const service = new FifoDispenseService(db, new StockMovementService(db));

  return service.dispense(clinicId, itemId, opts.userId, opts.userName ?? 'Test Vet', {
    quantity,
    consultationId: opts.consultationId ?? null,
    ownerId: opts.ownerId ?? null,
    overrideBatchId: opts.overrideBatchId,
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

// ─── Phase 8 scheduling factories (plan 08-03) ──────────────────────────
//
// SCH-01, SCH-02. clinicId is always the first argument, matching every
// other factory in this file; further required FKs follow the order the
// underlying Prisma model's foreign keys appear in schema.prisma, then a
// trailing overrides = {} object.

export async function createTestVetAvailabilityTemplate(
  clinicId: string,
  vetId: string,
  overrides: Partial<{
    weekday: number;
    isClosed: boolean;
    openMinutes: number | null;
    closeMinutes: number | null;
  }> = {},
) {
  return prisma.vetAvailabilityTemplate.create({
    data: {
      clinicId,
      vetId,
      weekday: overrides.weekday ?? 1,
      isClosed: overrides.isClosed ?? false,
      // 9:00-18:00, matching getDefaultHours() in
      // apps/mobile/src/lib/wizard-utils.ts.
      openMinutes: overrides.openMinutes === undefined ? 540 : overrides.openMinutes,
      closeMinutes: overrides.closeMinutes === undefined ? 1080 : overrides.closeMinutes,
    },
  });
}

/**
 * Creates all seven weekday rows for a vet in one call: Sunday closed,
 * Monday-Saturday open 540-1080 (9:00-18:00), mirroring the mobile setup
 * wizard's `getDefaultHours()`. Most availability tests need a whole week,
 * not one day.
 */
export async function createTestVetAvailabilityWeek(
  clinicId: string,
  vetId: string,
  overrides: Partial<{
    openMinutes: number;
    closeMinutes: number;
  }> = {},
) {
  const openMinutes = overrides.openMinutes ?? 540;
  const closeMinutes = overrides.closeMinutes ?? 1080;

  const rows = [];
  for (let weekday = 0; weekday <= 6; weekday++) {
    const isSunday = weekday === 0;
    rows.push(
      await createTestVetAvailabilityTemplate(clinicId, vetId, {
        weekday,
        isClosed: isSunday,
        openMinutes: isSunday ? null : openMinutes,
        closeMinutes: isSunday ? null : closeMinutes,
      }),
    );
  }
  return rows;
}

export async function createTestAvailabilityOverride(
  clinicId: string,
  vetId: string,
  date: Date,
  overrides: Partial<{
    isClosed: boolean;
    openMinutes: number | null;
    closeMinutes: number | null;
    reason: string;
  }> = {},
) {
  return prisma.availabilityOverride.create({
    data: {
      clinicId,
      vetId,
      date,
      isClosed: overrides.isClosed ?? true,
      openMinutes: overrides.openMinutes ?? null,
      closeMinutes: overrides.closeMinutes ?? null,
      reason: overrides.reason,
    },
  });
}

export async function createTestBlockedPeriod(
  clinicId: string,
  vetId: string,
  date: Date,
  createdById: string,
  overrides: Partial<{
    startMinutes: number;
    endMinutes: number;
    reason: 'LUNCH' | 'BREAK' | 'PERSONAL' | 'OFF_SITE' | 'MEETING' | 'OTHER';
    reasonText: string;
  }> = {},
) {
  return prisma.blockedPeriod.create({
    data: {
      clinicId,
      vetId,
      date,
      startMinutes: overrides.startMinutes ?? 780,
      endMinutes: overrides.endMinutes ?? 840,
      reason: overrides.reason || 'LUNCH',
      reasonText: overrides.reasonText,
      createdById,
    },
  });
}

/** Next whole hour, so a default `scheduledFor` never collides with "now". */
function nextWholeHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export async function createTestAppointment(
  clinicId: string,
  vetId: string,
  ownerId: string,
  petIds: string[],
  createdById: string,
  overrides: Partial<{
    status: 'SCHEDULED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    source: 'STAFF' | 'WHATSAPP';
    durationMinutes: number;
    scheduledFor: Date;
    serviceCatalogId: string | null;
    notes: string;
  }> = {},
) {
  return prisma.appointment.create({
    data: {
      clinicId,
      vetId,
      ownerId,
      createdById,
      status: overrides.status || 'SCHEDULED',
      source: overrides.source || 'STAFF',
      durationMinutes: overrides.durationMinutes ?? 15,
      scheduledFor: overrides.scheduledFor || nextWholeHour(),
      serviceCatalogId: overrides.serviceCatalogId ?? null,
      notes: overrides.notes,
      // D-21: petIds is an array so multi-pet is the default-supported
      // shape, not an afterthought.
      pets: { create: petIds.map((petId) => ({ clinicId, petId })) },
    },
    include: { pets: true },
  });
}

/** D-02: a ServiceCatalog row with an explicit durationMinutes, so
 * duration-resolution tests have a fixture. */
export async function createTestServiceForBooking(
  clinicId: string,
  overrides: Partial<{
    name: string;
    price: number;
    durationMinutes: number;
  }> = {},
) {
  return prisma.serviceCatalog.create({
    data: {
      clinicId,
      name: overrides.name || 'Vaccination',
      price: overrides.price ?? 50000,
      durationMinutes: overrides.durationMinutes ?? 15,
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

    // Phase 7 WhatsApp tables (plan 07-04) must go BEFORE the Phase 3/4 block
    // below: WhatsAppMessage/ReminderTask/BookingRequest/SlotHold reference
    // threads, pets and owners, so leaving them behind makes
    // `tx.pet.deleteMany()` / `tx.petOwner.deleteMany()` fail on an FK
    // violation once any WhatsApp fixture exists.
    await tx.whatsAppMessageStatusEvent.deleteMany();
    await tx.whatsAppMessage.deleteMany();
    await tx.whatsAppSlotHold.deleteMany();
    await tx.whatsAppBookingRequest.deleteMany();
    await tx.whatsAppReminderTask.deleteMany();
    await tx.whatsAppThread.deleteMany();
    await tx.whatsAppOwnerPreference.deleteMany();
    await tx.whatsAppClinicConfig.deleteMany();

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

    // Phase 8 scheduling tables (plan 08-03) must go BEFORE queueEntry, pet,
    // petOwner, serviceCatalog and clinic below: appointment_pets references
    // appointments/pets/queue_entries, appointments references pet_owners
    // and service_catalog with ON DELETE RESTRICT, and
    // vet_availability_templates/availability_overrides/blocked_periods
    // reference clinics/users with ON DELETE RESTRICT. Leaving any of these
    // behind repeats exactly the Phase 3/4 failure mode documented below.
    await tx.appointmentPet.deleteMany();
    await tx.appointment.deleteMany();
    await tx.blockedPeriod.deleteMany();
    await tx.availabilityOverride.deleteMany();
    await tx.vetAvailabilityTemplate.deleteMany();

    // Phase 9 web-dashboard/owner-portal tables (plan 09-01) carry no
    // `@relation` to Clinic/User/PetOwner (deliberately -- Prisma has no FK
    // constraint to violate here), so nothing else ever deletes these rows.
    // Left uncleaned, repeated runs collide on OwnerPortalMagicLink's unique
    // `tokenHash` once two runs happen to reuse the same raw test token.
    // Order relative to Clinic/PetOwner below doesn't matter for FK safety,
    // but checkout/session rows conceptually reference magic links, so they
    // go first for readability.
    await tx.ownerPortalCheckoutSession.deleteMany();
    await tx.ownerPortalSessionState.deleteMany();
    await tx.ownerPortalMagicLink.deleteMany();
    await tx.userDashboardPreference.deleteMany();
    await tx.clinicBrowserAccessPolicy.deleteMany();

    // Phase 10 offline-sync tables (plan 10-01) only carry a `clinic`
    // relation (no FK on userId/deviceId), but that relation alone is enough
    // to block `tx.clinic.deleteMany()` below with a FK violation once any
    // test exercises a real HTTP replay endpoint (buildTestApp() + supertest)
    // against the real DB instead of a mocked Prisma delegate -- which none
    // of Plan 10-01 to 10-05's own service-level tests ever did, so this gap
    // was invisible until Plan 10-06's end-to-end integration suite started
    // hitting `/sync/replay`, `/queue/sync/replay`, `/consultations/sync/replay`,
    // and `/inventory/sync/replay` for real. Found and fixed here per D-28.
    await tx.deviceSyncCursor.deleteMany();
    await tx.syncFailureTask.deleteMany();
    await tx.syncConflictRecord.deleteMany();
    await tx.syncReplayReceipt.deleteMany();

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
