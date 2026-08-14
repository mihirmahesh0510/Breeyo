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
  prisma,
} from '../helpers/factories.js';

/**
 * Credit notes over HTTP (BIL-07, D-19, D-21, D-22).
 *
 * No Razorpay mock: a credit note is an accounting document and touches no
 * gateway. Everything here is real against Postgres.
 *
 * The two tests worth reading are the last two:
 *
 *  * the immutability snapshot, which deep-equals the invoice's money fields
 *    and every one of its line items before and after issuance, excluding only
 *    the four fields the reducer is allowed to move. That is the executable
 *    form of D-21 (T-06-69).
 *  * the frozen-rate test, which changes the clinic's `defaultGstRate` between
 *    finalize and issuance and asserts the credit note still reconciles with
 *    the invoice. A credit note recomputed from current settings would pass
 *    every other test in this file (T-06-72).
 */

let app: FastifyInstance;

let clinicId: string;
let token: string;
let clinicianToken: string;
let otherToken: string;
let otherClinicId: string;

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
  if (keys.length > 0) await app.redis.del(...keys);

  const frontDesk = await createTestUser({ fullName: 'Front Desk' });
  const clinician = await createTestUser({ fullName: 'Clinician' });

  const clinic = await createTestClinic(frontDesk.id, { name: 'Credit Notes Clinic' });
  clinicId = clinic.id;

  // The GST registration is applied here rather than through `createTestClinic`
  // so the shared factory stays owned by plan 06-09. Without it every line
  // finalizes at zero tax and the frozen-rate assertion below would pass
  // vacuously — which is the failure mode that test exists to catch.
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      gstEnabled: true,
      gstin: '29ABCDE1234F1Z5',
      stateCode: '29',
      defaultGstRate: 18,
    },
  });

  await createTestClinicMember(frontDesk.id, clinic.id, 'FrontDesk');
  await createTestClinicMember(clinician.id, clinic.id, 'Clinician');

  token = (await createTestTokens(app, frontDesk.id, clinic.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinician.id, clinic.id)).accessToken;

  const otherOwner = await createTestUser({ fullName: 'Other Owner' });
  const otherClinic = await createTestClinic(otherOwner.id, { name: 'Other Clinic' });
  otherClinicId = otherClinic.id;
  await createTestClinicMember(otherOwner.id, otherClinic.id, 'FrontDesk');
  otherToken = (await createTestTokens(app, otherOwner.id, otherClinic.id)).accessToken;
});

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

/** An exempt consultation — veterinary healthcare carries no GST. */
const consultationLine = (unitPricePaise = 50000) => ({
  lineType: 'service',
  description: 'Consultation',
  quantity: 1,
  unitPricePaise,
  taxTreatment: 'exempt',
  gstRatePercent: 0,
});

/** A taxable medicine line at the clinic's configured slab. */
const medicineLine = (unitPricePaise = 100000, gstRatePercent = 18) => ({
  lineType: 'service',
  description: 'Amoxicillin 250mg',
  quantity: 1,
  unitPricePaise,
  hsnSacCode: '3004',
  taxTreatment: 'taxable',
  gstRatePercent,
});

async function createFinalized(
  lineItems: Record<string, unknown>[],
  t = token,
): Promise<string> {
  const draft = await request(app.server)
    .post('/api/v1/billing/invoices')
    .set(auth(t))
    .send({ source: 'manual', lineItems });
  expect(draft.status).toBe(201);

  const finalized = await request(app.server)
    .post(`/api/v1/billing/invoices/${draft.body.data.id}/finalize`)
    .set(auth(t))
    .send({});
  expect(finalized.status).toBe(200);

  return draft.body.data.id as string;
}

/** Everything about the invoice that a credit note must NOT change. */
async function snapshotInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const lineItems = await prisma.invoiceLineItem.findMany({
    where: { invoiceId },
    orderBy: { sortOrder: 'asc' },
  });

  const {
    creditedPaise: _credited,
    balancePaise: _balance,
    status: _status,
    updatedAt: _updatedAt,
    ...immutable
  } = invoice;

  return {
    immutable: JSON.parse(JSON.stringify(immutable)) as Record<string, unknown>,
    lineItems: JSON.parse(JSON.stringify(lineItems)) as Record<string, unknown>[],
    moving: {
      creditedPaise: invoice.creditedPaise,
      balancePaise: invoice.balancePaise,
      status: invoice.status,
    },
  };
}

describe('POST /billing/invoices/:invoiceId/credit-notes — issuance (D-19, D-22)', () => {
  it('issues a CN-numbered credit note for one line of a two-line invoice', async () => {
    const invoiceId = await createFinalized([consultationLine(50000), medicineLine(100000)]);
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
    const medicine = lines.find((l) => l.description.startsWith('Amoxicillin'));

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'product_returned',
        items: [
          {
            invoiceLineItemId: medicine?.id,
            creditAmountPaise: medicine?.lineTotalPaise,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.creditNoteNumber).toMatch(/^CN-\d{6}-\d{4,}$/);
    expect(response.body.data.totalPaise).toBe(medicine?.lineTotalPaise);
    expect(response.body.data.lineItems).toHaveLength(1);

    const persisted = await prisma.creditNote.findMany({
      where: { clinicId, invoiceId },
      include: { lineItems: true },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].lineItems).toHaveLength(1);
    expect(persisted[0].lineItems[0].invoiceLineItemId).toBe(medicine?.id);
  });

  it('reduces the invoice balance and raises creditedPaise', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });

    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(before.balancePaise).toBe(50000);

    await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'service_not_provided',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 20000 }],
      });

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(after.creditedPaise).toBe(20000);
    expect(after.balancePaise).toBe(30000);
  });

  it('advances the CN counter independently of the INV counter', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });

    const first = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'price_adjustment',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 10000 }],
      });
    const second = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'price_adjustment',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 10000 }],
      });

    expect(first.body.data.creditNoteNumber).toMatch(/-0001$/);
    expect(second.body.data.creditNoteNumber).toMatch(/-0002$/);

    const counters = await prisma.invoiceNumberCounter.findMany({ where: { clinicId } });
    const cn = counters.find((c) => c.docType === 'CN');
    const inv = counters.find((c) => c.docType === 'INV');
    expect(cn?.lastNumber).toBe(2);
    // One invoice was finalized, so INV is still on 1 — the counters do not
    // share a sequence.
    expect(inv?.lastNumber).toBe(1);
  });
});

describe('POST /billing/invoices/:invoiceId/credit-notes — bounds (T-06-70, T-06-71)', () => {
  it('400s a line credit larger than the original line', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'incorrect_charge',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: line.lineTotalPaise + 1 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CREDIT_EXCEEDS_LINE_TOTAL');
    expect(await prisma.creditNote.count({ where: { clinicId, invoiceId } })).toBe(0);
  });

  it('400s a second credit note that would take the invoice past its grand total', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });

    const first = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'price_adjustment',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 50000 }],
      });
    expect(first.status).toBe(201);

    const second = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'price_adjustment',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 1000 }],
      });

    expect(second.status).toBe(400);
    expect(await prisma.creditNote.count({ where: { clinicId, invoiceId } })).toBe(1);
  });

  it('404s a line item belonging to another clinic’s invoice', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const otherInvoiceId = await createFinalized([consultationLine(50000)], otherToken);
    const otherLine = await prisma.invoiceLineItem.findFirstOrThrow({
      where: { invoiceId: otherInvoiceId },
    });
    expect(otherClinicId).not.toBe(clinicId);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'incorrect_charge',
        items: [{ invoiceLineItemId: otherLine.id, creditAmountPaise: 1000 }],
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CREDIT_LINE_NOT_FOUND');
  });

  it('409s a DRAFT invoice — a draft is edited, not credited (D-21)', async () => {
    const draft = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set(auth())
      .send({ source: 'manual', lineItems: [consultationLine(50000)] });
    const line = await prisma.invoiceLineItem.findFirstOrThrow({
      where: { invoiceId: draft.body.data.id },
    });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${draft.body.data.id}/credit-notes`)
      .set(auth())
      .send({
        reason: 'incorrect_charge',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 1000 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('409s a VOIDED invoice — there is no balance left to reduce', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });

    const voided = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set(auth())
      .send({ reason: 'Duplicate invoice', restoreStock: true });
    expect(voided.status).toBe(200);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'incorrect_charge',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 1000 }],
      });

    expect(response.status).toBe(409);
  });

  it('403s a Clinician — issuing a credit note moves money state (T-06-73)', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth(clinicianToken))
      .send({
        reason: 'incorrect_charge',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 1000 }],
      });

    expect(response.status).toBe(403);
    expect(await prisma.creditNote.count({ where: { clinicId, invoiceId } })).toBe(0);
  });
});

describe('GET /billing/credit-notes/:creditNoteId and the invoice list', () => {
  it('reads a credit note back and lists it against its invoice', async () => {
    const invoiceId = await createFinalized([consultationLine(50000)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });

    const issued = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'other',
        notes: 'Owner disputed the consultation fee',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: 20000 }],
      });
    expect(issued.status).toBe(201);

    const detail = await request(app.server)
      .get(`/api/v1/billing/credit-notes/${issued.body.data.id}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.data.creditNoteNumber).toBe(issued.body.data.creditNoteNumber);
    expect(detail.body.data.lineItems).toHaveLength(1);

    const list = await request(app.server)
      .get(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    // Another clinic's credit note id reads as absent, not forbidden.
    const crossTenant = await request(app.server)
      .get(`/api/v1/billing/credit-notes/${issued.body.data.id}`)
      .set(auth(otherToken));
    expect(crossTenant.status).toBe(404);
  });
});

describe('Credit notes and the immutable invoice (T-06-69, T-06-72)', () => {
  it('leaves the invoice’s money fields and every line item byte-identical', async () => {
    const invoiceId = await createFinalized([consultationLine(50000), medicineLine(100000)]);
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
    const medicine = lines.find((l) => l.description.startsWith('Amoxicillin'));

    const before = await snapshotInvoice(invoiceId);

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'product_returned',
        items: [{ invoiceLineItemId: medicine?.id, creditAmountPaise: medicine?.lineTotalPaise }],
      });
    expect(response.status).toBe(201);

    const after = await snapshotInvoice(invoiceId);

    // Everything except creditedPaise, balancePaise, status and updatedAt.
    expect(after.immutable).toEqual(before.immutable);
    expect(after.lineItems).toEqual(before.lineItems);

    // And the four that are allowed to move, did.
    expect(after.moving.creditedPaise).toBe(medicine?.lineTotalPaise);
    expect(after.moving.balancePaise).toBe(
      before.moving.balancePaise - (medicine?.lineTotalPaise as number),
    );
  });

  it('recomputes tax from the invoice’s frozen rate, not the clinic’s current one', async () => {
    const invoiceId = await createFinalized([medicineLine(100000, 18)]);
    const line = await prisma.invoiceLineItem.findFirstOrThrow({ where: { invoiceId } });
    expect(Number(line.gstRatePercent)).toBe(18);
    expect(line.cgstPaise + line.sgstPaise).toBe(18000);

    // The GST Council notifies a new slab and the Admin updates the clinic.
    await prisma.clinic.update({ where: { id: clinicId }, data: { defaultGstRate: 5 } });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/${invoiceId}/credit-notes`)
      .set(auth())
      .send({
        reason: 'product_returned',
        items: [{ invoiceLineItemId: line.id, creditAmountPaise: line.lineTotalPaise }],
      });

    expect(response.status).toBe(201);
    // 18%, matching the invoice — not 5%, which would have produced 5000.
    expect(response.body.data.cgstPaise + response.body.data.sgstPaise).toBe(18000);
    expect(response.body.data.taxableValuePaise).toBe(100000);
    expect(response.body.data.totalPaise).toBe(line.lineTotalPaise);
    expect(response.body.data.lineItems[0].gstRatePercent).toBe(18);
  });
});
