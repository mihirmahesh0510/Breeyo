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
  createTestInventoryItem,
  createTestStockBatch,
  prisma,
} from '../helpers/factories.js';

/**
 * D-04 Quick Sale: the counter-sale path. One request creates and finalizes an
 * invoice with no consultation attached.
 *
 * ## The mirror image of the consultation path
 *
 * On the consultation path the stock has already moved — Phase 5 decremented
 * the batch when the clinician dispensed — so every product line carries a
 * `stockMovementId` and finalize only stamps it. Here nothing has moved before
 * the request arrives: every line is a fresh deduction, `reserveAndDeduct` runs
 * over the whole line set, and the lines keep `stockMovementId: null`.
 *
 * That null is load-bearing in both directions. It is what lets the deduction
 * happen at all (a non-null value trips plan 06-07's
 * `STOCK_PLAN_CONTRACT_VIOLATION` guard), and it is what makes a later void
 * restore the goods — `restoreToStock` skips movements referenced by a line's
 * `stockMovementId`, treating them as consultation-dispensed and therefore
 * consumed. A Quick Sale that stamped its own movement ids back onto its lines
 * would silently stop restoring counter-sale stock on void, contradicting D-34.
 * The final test in this file pins that down.
 *
 * ## GST fixture arithmetic
 *
 * Amounts are chosen so the engine's invoice-level rounding is a no-op and the
 * assertion reads as plain 5%: ₹40.00 x 2 = 8000 paise taxable, 5% = 400 paise,
 * split 200 CGST / 200 SGST, both already whole rupees.
 */

let app: FastifyInstance;

let clinicId: string;
let frontDeskToken: string;
let clinicianToken: string;
let ownerId: string;

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
  const clinicianUser = await createTestUser({ fullName: 'Dr Clinician' });

  const clinic = await createTestClinic(frontDeskUser.id, { name: 'Counter Clinic' });
  clinicId = clinic.id;

  // A registered clinic in Maharashtra, so an intra-state counter sale produces
  // CGST + SGST rather than the unregistered zero-tax path.
  await prisma.clinic.update({
    where: { id: clinicId },
    data: { gstEnabled: true, gstin: '27AAAPA1234A1Z5', stateCode: '27' },
  });

  await createTestClinicMember(frontDeskUser.id, clinic.id, 'FrontDesk');
  await createTestClinicMember(clinicianUser.id, clinic.id, 'Clinician');

  frontDeskToken = (await createTestTokens(app, frontDeskUser.id, clinic.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinicianUser.id, clinic.id)).accessToken;

  ownerId = (await createTestPetOwner(clinicId)).id;
});

const auth = () => ({ Authorization: `Bearer ${frontDeskToken}` });

const quickSale = (body: unknown, token = frontDeskToken) =>
  request(app.server)
    .post('/api/v1/billing/quick-sale')
    .set({ Authorization: `Bearer ${token}` })
    .send(body);

/** A counter item with stock on hand. Prices are RUPEES, as Phase 5 stores them. */
async function counterItem(
  name: string,
  opts: { sellingPrice?: number; gstRate?: number; qty?: number } = {},
) {
  const item = await createTestInventoryItem(clinicId, {
    name,
    sellingPrice: opts.sellingPrice ?? 40,
    gstRate: opts.gstRate ?? 5,
  });
  const batch = await createTestStockBatch(clinicId, item.id, {
    initialQty: opts.qty ?? 20,
  });
  return { item, batch };
}

const readBatchQuantityRemaining = async (batchId: string) => {
  const batch = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } });
  return batch.currentQty;
};

const quickSaleInvoiceCount = () =>
  prisma.invoice.count({ where: { clinicId, source: 'quick_sale' } });

describe('D-04 Quick Sale', () => {
  it('creates and finalizes a counter-sale invoice in one request', async () => {
    const { item: food } = await counterItem('Pet Food 5kg');
    const { item: supplement } = await counterItem('Joint Supplement');

    const response = await quickSale({
      ownerId,
      items: [
        { inventoryItemId: food.id, quantity: 2 },
        { inventoryItemId: supplement.id, quantity: 1 },
      ],
    });

    expect(response.status).toBe(201);

    const invoiceId = response.body.data.id as string;
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    expect(invoice.source).toBe('quick_sale');
    // A counter sale has no clinical encounter behind it.
    expect(invoice.consultationId).toBeNull();
    expect(invoice.ownerId).toBe(ownerId);
    // Created AND finalized: the number is assigned and the draft state is gone.
    expect(invoice.status).not.toBe('DRAFT');
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}-\d{4,}$/);
    expect(invoice.finalizedAt).not.toBeNull();

    const lines = await prisma.invoiceLineItem.findMany({
      where: { invoiceId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.lineType === 'product')).toBe(true);
  });

  it('prices lines from the current selling price, converted at the single money boundary', async () => {
    // ₹123.45 exercises the paise conversion rather than a round rupee figure.
    const { item } = await counterItem('Dental Chew', { sellingPrice: 123.45 });

    const response = await quickSale({ items: [{ inventoryItemId: item.id, quantity: 3 }] });
    expect(response.status).toBe(201);

    const lines = await prisma.invoiceLineItem.findMany({
      where: { invoiceId: response.body.data.id },
    });
    expect(lines).toHaveLength(1);
    // Unlike the consultation path there is no dispense-time snapshot to read:
    // the dispense happens as part of this request, so the current price is the
    // only price there is.
    expect(lines[0].unitPricePaise).toBe(12345);
    expect(lines[0].quantity).toBe(3);
  });

  it('taxes counter goods rather than exempting them, and types the document accordingly', async () => {
    const { item } = await counterItem('Pet Food 5kg', { sellingPrice: 40, gstRate: 5 });

    const response = await quickSale({
      ownerId,
      items: [{ inventoryItemId: item.id, quantity: 2 }],
    });
    expect(response.status).toBe(201);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });

    expect(invoice.taxableValuePaise).toBe(8000);
    // Intra-state: the tax splits across the two domestic heads, never IGST.
    expect(invoice.cgstPaise + invoice.sgstPaise).toBe(400);
    expect(invoice.igstPaise).toBe(0);
    expect(invoice.grandTotalPaise).toBe(8400);
    // Finding G1: pet food is outside the veterinary healthcare exemption, so
    // every line is taxable and the document is a plain tax invoice.
    expect(invoice.documentType).toBe('tax_invoice');

    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } });
    expect(lines[0].taxTreatment).toBe('taxable');
    expect(Number(lines[0].gstRatePercent)).toBe(5);
  });

  it('rejects a sale that outruns stock and leaves no phantom invoice behind', async () => {
    const { item, batch } = await counterItem('Scarce Supplement', { qty: 3 });

    const countBefore = await quickSaleInvoiceCount();
    const quantityRemainingBefore = await readBatchQuantityRemaining(batch.id);

    const response = await quickSale({ items: [{ inventoryItemId: item.id, quantity: 10 }] });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(response.body.error.details.shortfalls).toHaveLength(1);
    expect(response.body.error.details.shortfalls[0].requested).toBe(10);
    expect(response.body.error.details.shortfalls[0].available).toBe(3);

    // The single-transaction requirement exists for exactly this: a draft left
    // behind by a failed one-tap sale would surface in the Billing tab as a
    // phantom the front desk has to explain.
    expect(await quickSaleInvoiceCount()).toBe(countBefore);
    expect(await readBatchQuantityRemaining(batch.id)).toBe(quantityRemainingBefore);
  });

  it('resolves two concurrent sales of the last unit to exactly one success', async () => {
    const { item, batch } = await counterItem('Last Collar', { qty: 1 });

    // `fileParallelism: false`, so the contention has to be created inside one
    // test. Which request wins is a race by design; the assertion is on the pair.
    const [first, second] = await Promise.allSettled([
      quickSale({ items: [{ inventoryItemId: item.id, quantity: 1 }] }),
      quickSale({ items: [{ inventoryItemId: item.id, quantity: 1 }] }),
    ]);

    const statuses = [first, second].map((r) => (r.status === 'fulfilled' ? r.value.status : 500));

    expect(statuses.filter((s) => s >= 200 && s < 300)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    // Overselling would show up here as a negative remaining quantity.
    const quantityRemainingAfter = await readBatchQuantityRemaining(batch.id);
    expect(quantityRemainingAfter).toBe(0);
    expect(quantityRemainingAfter).toBeGreaterThanOrEqual(0);

    expect(await quickSaleInvoiceCount()).toBe(1);
  });

  it('attributes the stock movements to the invoice and the owner, with no consultation', async () => {
    const { item } = await counterItem('Flea Collar');

    const response = await quickSale({
      ownerId,
      items: [{ inventoryItemId: item.id, quantity: 2 }],
    });
    expect(response.status).toBe(201);
    const invoiceId = response.body.data.id as string;

    const movements = await prisma.stockMovement.findMany({ where: { clinicId, invoiceId } });
    expect(movements).toHaveLength(1);

    const movement = movements[0];
    expect(movement.type).toBe('dispensed');
    expect(movement.invoiceId).toBe(invoiceId);
    // D-52/D-60: a counter sale is attributable to an owner so a later return
    // can be reconciled against it, but it belongs to no consultation.
    expect(movement.consultationId).toBeNull();
    expect(movement.ownerId).toBe(ownerId);
    expect(movement.quantity).toBe(-2);
  });

  it('accepts a walk-in cash sale with no registered owner', async () => {
    const { item, batch } = await counterItem('Chew Toy');
    const quantityRemainingBefore = await readBatchQuantityRemaining(batch.id);

    const response = await quickSale({ items: [{ inventoryItemId: item.id, quantity: 1 }] });
    expect(response.status).toBe(201);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(invoice.ownerId).toBeNull();
    expect(invoice.status).not.toBe('DRAFT');

    expect(await readBatchQuantityRemaining(batch.id)).toBe(quantityRemainingBefore - 1);

    const movements = await prisma.stockMovement.findMany({
      where: { clinicId, invoiceId: invoice.id },
    });
    expect(movements[0].ownerId).toBeNull();
  });

  it('refuses a caller without CREATE_INVOICES (D-05)', async () => {
    const { item } = await counterItem('Shampoo');

    // A Clinician holds EDIT_EMR but no billing authority. Quick Sale is a
    // user-initiated invoice creation, so unlike the D-03 hook it IS gated.
    const response = await quickSale(
      { items: [{ inventoryItemId: item.id, quantity: 1 }] },
      clinicianToken,
    );

    expect(response.status).toBe(403);
    expect(await quickSaleInvoiceCount()).toBe(0);
  });

  it('rejects an inventory item belonging to another clinic as not found', async () => {
    const otherUser = await createTestUser({ fullName: 'Other Owner' });
    const otherClinic = await createTestClinic(otherUser.id, { name: 'Other Clinic' });
    const foreignItem = await createTestInventoryItem(otherClinic.id, { name: 'Foreign Item' });
    await createTestStockBatch(otherClinic.id, foreignItem.id, { initialQty: 50 });

    const response = await quickSale({
      items: [{ inventoryItemId: foreignItem.id, quantity: 1 }],
    });

    // 404 rather than 403: a 403 would confirm the item exists elsewhere.
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INVENTORY_ITEM_NOT_FOUND');
    expect(await quickSaleInvoiceCount()).toBe(0);
  });

  it('is payable through the standard payment endpoint with no special-casing', async () => {
    const { item } = await counterItem('Pet Food 5kg', { sellingPrice: 40, gstRate: 5 });

    const sale = await quickSale({
      ownerId,
      items: [{ inventoryItemId: item.id, quantity: 2 }],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.data.id as string;

    const payment = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', channel: 'manual', amountPaise: 8400 });

    expect(payment.status).toBeGreaterThanOrEqual(200);
    expect(payment.status).toBeLessThan(300);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PAID');
    expect(invoice.amountPaidPaise).toBe(8400);
    expect(invoice.balancePaise).toBe(0);
  });

  it('restores counter-sale stock when the invoice is voided (D-34)', async () => {
    const { item, batch } = await counterItem('Returnable Toy');
    const quantityRemainingBefore = await readBatchQuantityRemaining(batch.id);

    const sale = await quickSale({
      ownerId,
      items: [{ inventoryItemId: item.id, quantity: 4 }],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.data.id as string;

    expect(await readBatchQuantityRemaining(batch.id)).toBe(quantityRemainingBefore - 4);

    // Every Quick Sale line must keep `stockMovementId` null. Stamping the
    // movement this sale created back onto its own line would make
    // `restoreToStock` classify it as consultation-dispensed and skip it, and
    // the void below would silently restore nothing.
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
    expect(lines).toHaveLength(1);
    expect(lines[0].stockMovementId).toBeNull();

    const voided = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set(auth())
      .send({ reason: 'Customer changed their mind', restoreStock: true });

    expect(voided.status).toBe(200);
    expect(voided.body.data.restoredMovementCount).toBe(1);

    // D-34: a counter item was never administered to an animal, so voiding the
    // sale puts it back on the shelf.
    expect(await readBatchQuantityRemaining(batch.id)).toBe(quantityRemainingBefore);
  });
});
