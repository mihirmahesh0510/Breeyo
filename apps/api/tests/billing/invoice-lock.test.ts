import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  createTestInventoryItem,
  createTestStockBatch,
  dispenseForTest,
  prisma,
} from '../helpers/factories.js';

/**
 * BIL-03 status transitions and D-21 immutability.
 *
 * D-21's rule: a finalized invoice is a legal document and cannot be edited.
 * The only corrections are void-and-reissue or a credit note. The guard lives in
 * the repository's WHERE clause (`status: 'DRAFT'`), not only in a service-level
 * check, so an invoice that finalizes between a caller's read and its write is
 * still rejected.
 */

let app: FastifyInstance;

let clinicId: string;
let token: string;
let clinicianUserId: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const frontDeskUser = await createTestUser({ fullName: 'Front Desk' });
  const clinicianUser = await createTestUser({ fullName: 'Clinician' });
  clinicianUserId = clinicianUser.id;

  const clinic = await createTestClinic(frontDeskUser.id, { name: 'Lock Clinic' });
  clinicId = clinic.id;

  await createTestClinicMember(frontDeskUser.id, clinic.id, 'FrontDesk');
  await createTestClinicMember(clinicianUser.id, clinic.id, 'Clinician');

  token = (await createTestTokens(app, frontDeskUser.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

function serviceLine(unitPricePaise = 50000) {
  return {
    lineType: 'service',
    description: 'Consultation',
    quantity: 1,
    unitPricePaise,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
  };
}

async function createDraft(lineItems: unknown[] = [serviceLine()]) {
  const response = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth())
    .send({ source: 'manual', lineItems });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function createFinalized(lineItems: unknown[] = [serviceLine()]) {
  const invoiceId = await createDraft(lineItems);
  const finalized = await request(app.server)
    .post(`/api/v1/billing/invoices/${invoiceId}/finalize`)
    .set(auth())
    .send({});
  expect(finalized.status).toBe(200);
  return invoiceId;
}

describe('BIL-03 status transitions and D-21 immutability', () => {
  it('rejects a PATCH against a finalized invoice and leaves its line items untouched', async () => {
    const invoiceId = await createFinalized();

    const before = await prisma.invoiceLineItem.findMany({
      where: { invoiceId },
      orderBy: { sortOrder: 'asc' },
    });

    const response = await request(app.server)
      .patch(`/api/v1/billing/invoices/${invoiceId}`)
      .set(auth())
      .send({ lineItems: [serviceLine(999900)], notes: 'tampered' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVOICE_NOT_DRAFT');

    const after = await prisma.invoiceLineItem.findMany({
      where: { invoiceId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(after).toHaveLength(before.length);
    expect(after.map((l) => l.unitPricePaise)).toEqual(before.map((l) => l.unitPricePaise));
  });

  it('rejects a DELETE against a finalized invoice', async () => {
    const invoiceId = await createFinalized();

    const response = await request(app.server)
      .delete(`/api/v1/billing/invoices/${invoiceId}`)
      .set(auth())
      .send();

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVOICE_NOT_DRAFT');

    const stillThere = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(stillThere).not.toBeNull();
  });

  it('marks a finalized invoice paid, records a manual payment and clears the balance', async () => {
    const invoiceId = await createFinalized();

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash' });

    expect(response.status).toBe(200);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PAID');
    expect(invoice.balancePaise).toBe(0);

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(1);
    expect(payments[0].channel).toBe('manual');
    expect(payments[0].method).toBe('cash');
    expect(payments[0].amountPaise).toBe(invoice.grandTotalPaise);
  });

  it('treats mark-paid on an already paid invoice as a no-op rather than an error', async () => {
    const invoiceId = await createFinalized();

    const first = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash' });
    expect(first.status).toBe(200);

    // A double tap or a duplicate webhook must not write a second payment row
    // for money nobody received.
    const second = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash' });

    expect(second.status).toBe(200);

    const payments = await prisma.payment.findMany({ where: { clinicId, invoiceId } });
    expect(payments).toHaveLength(1);
  });

  it('rejects mark-paid on a DRAFT invoice', async () => {
    const invoiceId = await createDraft();

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/mark-paid`)
      .set(auth())
      .send({ method: 'cash' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('restores stock on void for a billing-time product line and refuses a second void', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Counter Item' });
    const batch = await createTestStockBatch(clinicId, item.id, { initialQty: 10 });

    const invoiceId = await createFinalized([
      {
        lineType: 'product',
        inventoryItemId: item.id,
        description: 'Counter Item',
        quantity: 3,
        unitPricePaise: 2550,
        taxTreatment: 'taxable',
        gstRatePercent: 5,
      },
    ]);

    const afterFinalize = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(afterFinalize.currentQty).toBe(7);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set(auth())
      .send({ reason: 'Billed in error', restoreStock: true });

    expect(response.status).toBe(200);
    expect(response.body.data.restoredMovementCount).toBe(1);
    // D-35: the ids of any live payment links travel back so a later plan can
    // cancel them at the gateway rather than losing them silently.
    expect(Array.isArray(response.body.data.cancelledPaymentLinkIds)).toBe(true);

    const returned = await prisma.stockMovement.findMany({
      where: { clinicId, invoiceId, type: 'returned' },
    });
    expect(returned).toHaveLength(1);
    expect(returned.reduce((sum, m) => sum + m.quantity, 0)).toBe(3);

    const restored = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(restored.currentQty).toBe(10);

    const voided = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(voided.status).toBe('VOIDED');
    expect(voided.voidRestoredStock).toBe(true);

    // A second void must not credit stock twice.
    const again = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set(auth())
      .send({ reason: 'Double void', restoreStock: true });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');

    const returnedAfter = await prisma.stockMovement.findMany({
      where: { clinicId, invoiceId, type: 'returned' },
    });
    expect(returnedAfter).toHaveLength(1);
  });

  it('never restores a drug that was administered during the consultation (D-34)', async () => {
    const owner = await createTestPetOwner(clinicId);
    const pet = await createTestPet(clinicId, owner.id);
    const consultation = await createTestConsultation(clinicId, pet.id, clinicianUserId);

    const item = await createTestInventoryItem(clinicId, { name: 'Administered Drug' });
    const batch = await createTestStockBatch(clinicId, item.id, { initialQty: 10 });

    await dispenseForTest(clinicId, item.id, 2, {
      userId: clinicianUserId,
      consultationId: consultation.id,
    });

    const draft = await request(app.server)
      .post(`/api/v1/billing/invoices/from-consultation/${consultation.id}`)
      .set(auth())
      .send({});
    expect(draft.status).toBe(201);
    const invoiceId = draft.body.data.id as string;

    const finalized = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/finalize`)
      .set(auth())
      .send({});
    expect(finalized.status).toBe(200);

    const beforeVoid = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set(auth())
      .send({ reason: 'Wrong owner billed', restoreStock: true });

    expect(response.status).toBe(200);
    // The drug went into the animal. A billing correction does not bring it
    // back, so nothing is credited and no `returned` movement is written.
    expect(response.body.data.restoredMovementCount).toBe(0);

    const afterVoid = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(afterVoid.currentQty).toBe(beforeVoid.currentQty);

    const returned = await prisma.stockMovement.findMany({
      where: { clinicId, invoiceId, type: 'returned' },
    });
    expect(returned).toHaveLength(0);
  });

  it('rejects a void that asks not to restore stock rather than silently ignoring the request', async () => {
    const invoiceId = await createFinalized();

    // `voidInvoiceSchema` accepts only `restoreStock: true` (D-34): the field
    // stays on the wire so intent is explicit in the request and the audit log,
    // but a client asking for `false` gets a clear rejection instead of having
    // its choice quietly overridden.
    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set(auth())
      .send({ reason: 'No restore please', restoreStock: false });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const movements = await prisma.stockMovement.findMany({ where: { clinicId, invoiceId } });
    expect(movements).toHaveLength(0);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).not.toBe('VOIDED');
  });
});
