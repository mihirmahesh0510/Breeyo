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
 * BIL-02: stock validation and deduction at finalize, proven against a real
 * database.
 *
 * ## The assertion style that matters here
 *
 * Every batch-quantity check compares against a value RECORDED at a known point
 * rather than against a hard-coded number. Asserting an absolute figure would
 * still pass if a deduction happened during fixture setup instead of at
 * finalize, which is precisely the bug the `does not deduct` test exists to
 * catch. The local variables are therefore named for the remaining quantity
 * being tracked; Phase 5's column itself is `StockBatch.currentQty`.
 *
 * ## Why the dispense fixture runs Phase 5's own service
 *
 * `dispenseForTest` delegates to `FifoDispenseService`, so the post-dispense
 * state is whatever Phase 5 actually produces: batch decremented AND a
 * `dispensed` movement inserted. A fixture that inserted only the movement would
 * leave the batch sitting on exactly the number a buggy second deduction
 * produces, making the double-deduction bug invisible.
 */

let app: FastifyInstance;

let clinicId: string;
let frontDeskToken: string;
let frontDeskUserId: string;
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
  frontDeskUserId = frontDeskUser.id;
  clinicianUserId = clinicianUser.id;

  const clinic = await createTestClinic(frontDeskUser.id, { name: 'Finalize Clinic' });
  clinicId = clinic.id;

  await createTestClinicMember(frontDeskUser.id, clinic.id, 'FrontDesk');
  await createTestClinicMember(clinicianUser.id, clinic.id, 'Clinician');

  frontDeskToken = (await createTestTokens(app, frontDeskUser.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${frontDeskToken}` });

/** A product line the invoice must deduct for itself (no stock provenance). */
function manualProductLine(
  itemId: string,
  description: string,
  quantity: number,
  unitPricePaise = 2550,
) {
  return {
    lineType: 'product',
    inventoryItemId: itemId,
    description,
    quantity,
    unitPricePaise,
    taxTreatment: 'taxable',
    gstRatePercent: 5,
  };
}

async function createDraft(lineItems: unknown[], extra: Record<string, unknown> = {}) {
  const response = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth())
    .send({ source: 'manual', lineItems, ...extra });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

const finalize = (invoiceId: string) =>
  request(app.server)
    .post(`/api/v1/billing/invoices/${invoiceId}/finalize`)
    .set(auth())
    .send({});

const readBatchQuantityRemaining = async (batchId: string) => {
  const batch = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } });
  return batch.currentQty;
};

describe('BIL-02 stock validation at finalize', () => {
  it('rejects a finalize that outruns available stock and mutates nothing', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Amoxicillin' });
    const batch = await createTestStockBatch(clinicId, item.id, { initialQty: 4 });

    const quantityRemainingBefore = await readBatchQuantityRemaining(batch.id);
    const invoiceId = await createDraft([manualProductLine(item.id, 'Amoxicillin', 10)]);

    const response = await finalize(invoiceId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(response.body.error.details.shortfalls).toHaveLength(1);
    expect(response.body.error.details.shortfalls[0].description).toBe('Amoxicillin');
    expect(response.body.error.details.shortfalls[0].requested).toBe(10);
    expect(response.body.error.details.shortfalls[0].available).toBe(4);

    // Nothing moved: the shortfall is detected under row locks before any write.
    expect(await readBatchQuantityRemaining(batch.id)).toBe(quantityRemainingBefore);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('DRAFT');
    // D-15/Rule 46(b): a rolled-back finalize must not consume a number.
    expect(invoice.invoiceNumber).toBeNull();
  });

  it('names every short item in one INSUFFICIENT_STOCK response rather than one per round trip', async () => {
    const itemA = await createTestInventoryItem(clinicId, { name: 'Meloxicam' });
    const itemB = await createTestInventoryItem(clinicId, { name: 'Cefpodoxime' });
    await createTestStockBatch(clinicId, itemA.id, { initialQty: 1 });
    await createTestStockBatch(clinicId, itemB.id, { initialQty: 2 });

    const invoiceId = await createDraft([
      manualProductLine(itemA.id, 'Meloxicam', 5),
      manualProductLine(itemB.id, 'Cefpodoxime', 7),
    ]);

    const response = await finalize(invoiceId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(response.body.error.details.shortfalls).toHaveLength(2);

    const byDescription = Object.fromEntries(
      response.body.error.details.shortfalls.map(
        (s: { description: string; requested: number; available: number }) => [s.description, s],
      ),
    );
    expect(byDescription.Meloxicam.available).toBe(1);
    expect(byDescription.Meloxicam.requested).toBe(5);
    expect(byDescription.Cefpodoxime.available).toBe(2);
    expect(byDescription.Cefpodoxime.requested).toBe(7);
  });

  it('numbers, freezes and stamps in one transaction on a successful finalize', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Ivermectin' });
    const batch = await createTestStockBatch(clinicId, item.id, { initialQty: 20 });

    const quantityRemainingBefore = await readBatchQuantityRemaining(batch.id);
    const invoiceId = await createDraft([manualProductLine(item.id, 'Ivermectin', 4)]);

    const response = await finalize(invoiceId);
    expect(response.status).toBe(200);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).not.toBe('DRAFT');
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}-\d{4,}$/);
    expect(invoice.finalizedAt).not.toBeNull();

    // A manually added line has no prior movement, so finalize both deducts and
    // creates the movement, stamped with this invoice.
    expect(await readBatchQuantityRemaining(batch.id)).toBe(quantityRemainingBefore - 4);

    const movements = await prisma.stockMovement.findMany({
      where: { clinicId, invoiceId, type: 'dispensed' },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].invoiceId).toBe(invoiceId);

    // BIL-07: the tax snapshot is frozen onto every line at finalize.
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.gstRatePercent).not.toBeNull();
    }

    const auditRows = await prisma.billingAuditLog.findMany({
      where: { clinicId, invoiceId, event: 'INVOICE_FINALIZED' },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('never draws from an expired batch even when it holds enough on its own', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Expired Tonic' });
    const expiredBatch = await createTestStockBatch(clinicId, item.id, {
      initialQty: 50,
      expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      isExpired: true,
    });

    const quantityRemainingBefore = await readBatchQuantityRemaining(expiredBatch.id);
    const invoiceId = await createDraft([manualProductLine(item.id, 'Expired Tonic', 3)]);

    const response = await finalize(invoiceId);

    // The only stock on hand is expired, so it counts as zero available.
    expect(response.status).toBe(409);
    expect(response.body.error.details.shortfalls[0].available).toBe(0);
    expect(await readBatchQuantityRemaining(expiredBatch.id)).toBe(quantityRemainingBefore);
  });

  it('resolves two concurrent finalizes for the last unit of a batch to exactly one success', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Last Vial' });
    const batch = await createTestStockBatch(clinicId, item.id, { initialQty: 1 });

    // Two independent drafts, each claiming the single remaining unit.
    const firstInvoiceId = await createDraft([manualProductLine(item.id, 'Last Vial', 1)]);
    const secondInvoiceId = await createDraft([manualProductLine(item.id, 'Last Vial', 1)]);

    // `fileParallelism: false` means the competition has to be created inside
    // one test. Which request wins is a race by design, so the assertion is on
    // the pair of outcomes, never on which id succeeded.
    const [first, second] = await Promise.allSettled([
      finalize(firstInvoiceId),
      finalize(secondInvoiceId),
    ]);

    const statuses = [first, second].map((r) =>
      r.status === 'fulfilled' ? r.value.status : 500,
    );

    expect(statuses.filter((s) => s >= 200 && s < 300)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    // Overselling would show up here as a negative remaining quantity.
    const quantityRemainingAfter = await readBatchQuantityRemaining(batch.id);
    expect(quantityRemainingAfter).toBe(0);
    expect(quantityRemainingAfter).toBeGreaterThanOrEqual(0);

    const finalized = await prisma.invoice.findMany({
      where: { clinicId, id: { in: [firstInvoiceId, secondInvoiceId] }, invoiceNumber: { not: null } },
    });
    expect(finalized).toHaveLength(1);
  });

  it('does not deduct stock again for a line that was already dispensed during the consultation', async () => {
    const owner = await createTestPetOwner(clinicId);
    const pet = await createTestPet(clinicId, owner.id);
    const consultation = await createTestConsultation(clinicId, pet.id, clinicianUserId);

    const item = await createTestInventoryItem(clinicId, { name: 'Consultation Drug' });
    const batch = await createTestStockBatch(clinicId, item.id, { initialQty: 10 });

    // Phase 5's real dispense: decrements the batch AND writes the movement.
    await dispenseForTest(clinicId, item.id, 2, {
      userId: clinicianUserId,
      consultationId: consultation.id,
    });

    // Recorded AFTER the dispense. Comparing against this value — rather than
    // against an absolute number — is what makes a second deduction detectable:
    // an absolute assertion would still pass if the only deduction had happened
    // here in setup.
    const quantityRemainingAfterDispense = await readBatchQuantityRemaining(batch.id);
    expect(quantityRemainingAfterDispense).toBe(8);

    const draft = await request(app.server)
      .post(`/api/v1/billing/invoices/from-consultation/${consultation.id}`)
      .set(auth())
      .send({});
    expect(draft.status).toBe(201);
    const invoiceId = draft.body.data.id as string;

    // The line must carry the movement id — that is the deduct/skip
    // discriminator, and leaving it to chance would void the whole test.
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
    expect(lines).toHaveLength(1);
    expect(lines[0].stockMovementId).not.toBeNull();

    const response = await finalize(invoiceId);
    expect(response.status).toBe(200);

    // The invoice stamps the movement; it does not move stock.
    expect(await readBatchQuantityRemaining(batch.id)).toBe(quantityRemainingAfterDispense);

    const dispensedMovements = await prisma.stockMovement.findMany({
      where: { clinicId, batchId: batch.id, type: 'dispensed' },
    });
    expect(dispensedMovements).toHaveLength(1);
    expect(dispensedMovements[0].invoiceId).toBe(invoiceId);
  });

  it('deducts only the manually added line on a mixed provenance invoice', async () => {
    const owner = await createTestPetOwner(clinicId);
    const pet = await createTestPet(clinicId, owner.id);
    const consultation = await createTestConsultation(clinicId, pet.id, clinicianUserId);

    const dispensedItem = await createTestInventoryItem(clinicId, { name: 'Dispensed Drug' });
    const dispensedBatch = await createTestStockBatch(clinicId, dispensedItem.id, {
      initialQty: 10,
    });
    const manualItem = await createTestInventoryItem(clinicId, { name: 'Counter Item' });
    const manualBatch = await createTestStockBatch(clinicId, manualItem.id, { initialQty: 10 });

    await dispenseForTest(clinicId, dispensedItem.id, 2, {
      userId: clinicianUserId,
      consultationId: consultation.id,
    });

    const dispensedQuantityRemainingAfterDispense =
      await readBatchQuantityRemaining(dispensedBatch.id);
    const manualQuantityRemainingBefore = await readBatchQuantityRemaining(manualBatch.id);

    // `consultationId` pulls the uninvoiced dispensed movement onto the invoice
    // alongside the hand-added line, so one invoice carries both provenances.
    const invoiceId = await createDraft(
      [manualProductLine(manualItem.id, 'Counter Item', 3)],
      { consultationId: consultation.id, petId: pet.id, ownerId: owner.id },
    );

    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
    expect(lines).toHaveLength(2);
    expect(lines.filter((l) => l.stockMovementId !== null)).toHaveLength(1);
    expect(lines.filter((l) => l.stockMovementId === null)).toHaveLength(1);

    const response = await finalize(invoiceId);
    expect(response.status).toBe(200);

    // This is the assertion a blanket "skip the whole invoice if any line has a
    // stockMovementId" implementation fails: the filter must be per line.
    expect(await readBatchQuantityRemaining(dispensedBatch.id)).toBe(
      dispensedQuantityRemainingAfterDispense,
    );
    expect(await readBatchQuantityRemaining(manualBatch.id)).toBe(
      manualQuantityRemainingBefore - 3,
    );
  });
});
