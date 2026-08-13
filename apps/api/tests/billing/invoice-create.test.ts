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
  createTestServiceCatalogEntry,
  createTestInventoryItem,
  createTestStockBatch,
  dispenseForTest,
  prisma,
} from '../helpers/factories.js';
import { toPaise } from '../../src/modules/billing/money.js';

/**
 * BIL-01 (invoice creation and quantity sourcing) and the D-05 authorization
 * split, exercised over HTTP against a real database.
 *
 * Transport note: this suite uses `supertest` against `app.server`, which is
 * CLAUDE.md's documented convention, rather than the `app.inject` idiom the
 * older `tenant-isolation.test.ts` uses (06-PATTERNS.md Warning 5). Both work
 * against a `buildTestApp()` instance; supertest is used here because it is the
 * convention of record.
 */

let app: FastifyInstance;

// The two-clinic fixture. Clinic A is the caller throughout; clinic B exists
// only so cross-tenant reads have something real to fail to reach.
let clinicAId: string;
let clinicBId: string;
let frontDeskToken: string;
let clinicianToken: string;
let clinicBToken: string;
let frontDeskUserId: string;
let clinicianUserId: string;
let clinicBUserId: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  // The D-05 seed change removes CREATE_INVOICES from Clinician. PermissionService
  // caches resolved permissions in Redis under `perms:*`, so without this flush a
  // cached pre-change permission set would mask the very thing being asserted.
  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const frontDeskUser = await createTestUser({ fullName: 'Front Desk' });
  const clinicianUser = await createTestUser({ fullName: 'Clinician' });
  const clinicBUser = await createTestUser({ fullName: 'Clinic B Admin' });

  frontDeskUserId = frontDeskUser.id;
  clinicianUserId = clinicianUser.id;
  clinicBUserId = clinicBUser.id;

  const clinicA = await createTestClinic(frontDeskUser.id, { name: 'Clinic A' });
  const clinicB = await createTestClinic(clinicBUser.id, { name: 'Clinic B' });
  clinicAId = clinicA.id;
  clinicBId = clinicB.id;

  await createTestClinicMember(frontDeskUser.id, clinicA.id, 'FrontDesk');
  await createTestClinicMember(clinicianUser.id, clinicA.id, 'Clinician');
  await createTestClinicMember(clinicBUser.id, clinicB.id, 'Admin');

  frontDeskToken = (await createTestTokens(app, frontDeskUser.id, clinicA.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinicianUser.id, clinicA.id)).accessToken;
  clinicBToken = (await createTestTokens(app, clinicBUser.id, clinicB.id)).accessToken;
});

/** A minimal valid service line. 0% is a real slab — vet care is GST-exempt. */
function serviceLine(overrides: Record<string, unknown> = {}) {
  return {
    lineType: 'service',
    description: 'Consultation',
    quantity: 1,
    unitPricePaise: 50000,
    taxTreatment: 'exempt',
    gstRatePercent: 0,
    ...overrides,
  };
}

describe('BIL-01 invoice creation over HTTP', () => {
  it('rejects an unauthenticated request before any permission check runs', async () => {
    const response = await request(app.server).get('/api/v1/billing/invoices');

    expect(response.status).toBe(401);
  });

  it('rejects a create whose body carries no line items', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ source: 'manual' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a DRAFT invoice from a valid body', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ source: 'manual', lineItems: [serviceLine()] });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.status).toBe('DRAFT');
    // D-15: a number is only allocated at finalize, never on a draft.
    expect(response.body.data.invoiceNumber).toBeNull();
  });

  it('returns 404 for an invoice id that does not exist in the caller clinic', async () => {
    const response = await request(app.server)
      .get('/api/v1/billing/invoices/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INVOICE_NOT_FOUND');
  });

  it('parses a valid list query and rejects an unknown status filter', async () => {
    const ok = await request(app.server)
      .get('/api/v1/billing/invoices?status=overdue&sort=due_date&limit=5')
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.data.items)).toBe(true);

    const bad = await request(app.server)
      .get('/api/v1/billing/invoices?status=bogus')
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('denies a Clinician interactive invoice creation but still allows them to view invoices (D-05)', async () => {
    const denied = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${clinicianToken}`)
      .send({ source: 'manual', lineItems: [serviceLine()] });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    // VIEW_INVOICES is deliberately retained: a vet must still be able to see
    // the invoice for a patient they treated.
    const allowed = await request(app.server)
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${clinicianToken}`);

    expect(allowed.status).toBe(200);
  });

  it('sources a dispensed line quantity and price from the stock movement, not from the clinical record', async () => {
    const owner = await createTestPetOwner(clinicAId);
    const pet = await createTestPet(clinicAId, owner.id);
    const consultation = await createTestConsultation(clinicAId, pet.id, clinicianUserId);

    // ₹25.50 a tablet; Phase 5 stores rupees, Phase 6 stores paise.
    const item = await createTestInventoryItem(clinicAId, { sellingPrice: 25.5 });
    await createTestStockBatch(clinicAId, item.id, { initialQty: 10 });

    await dispenseForTest(clinicAId, item.id, 3, {
      userId: clinicianUserId,
      consultationId: consultation.id,
    });

    const response = await request(app.server)
      .post(`/api/v1/billing/invoices/from-consultation/${consultation.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({});

    expect(response.status).toBe(201);

    const lines = await prisma.invoiceLineItem.findMany({
      where: { invoiceId: response.body.data.id },
    });

    expect(lines).toHaveLength(1);
    // The movement carries the quantity; the prescription has no quantity column
    // at all, so sourcing from it would silently make every line 1.
    expect(lines[0].quantity).toBe(3);
    expect(lines[0].unitPricePaise).toBe(toPaise(25.5));
    expect(lines[0].lineType).toBe('product');
    // The deduct/skip discriminator must be stamped at draft time.
    expect(lines[0].stockMovementId).not.toBeNull();
  });

  it('is idempotent when the from-consultation endpoint is called twice', async () => {
    const owner = await createTestPetOwner(clinicAId);
    const pet = await createTestPet(clinicAId, owner.id);
    const consultation = await createTestConsultation(clinicAId, pet.id, clinicianUserId);

    const item = await createTestInventoryItem(clinicAId, { sellingPrice: 12 });
    await createTestStockBatch(clinicAId, item.id, { initialQty: 10 });
    await dispenseForTest(clinicAId, item.id, 2, {
      userId: clinicianUserId,
      consultationId: consultation.id,
    });

    const first = await request(app.server)
      .post(`/api/v1/billing/invoices/from-consultation/${consultation.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({});
    const second = await request(app.server)
      .post(`/api/v1/billing/invoices/from-consultation/${consultation.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({});

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    const drafts = await prisma.invoice.findMany({
      where: { clinicId: clinicAId, consultationId: consultation.id, status: 'DRAFT' },
    });
    expect(drafts).toHaveLength(1);
  });

  it('carries a service catalog entry SAC code and GST override onto the resulting line', async () => {
    const catalogEntry = await createTestServiceCatalogEntry(clinicAId, {
      name: 'Dental Scaling',
      price: 120000,
      sacCode: '999319',
      gstRateOverride: 18,
    });

    const response = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({
        source: 'manual',
        lineItems: [
          serviceLine({
            serviceCatalogId: catalogEntry.id,
            description: catalogEntry.name,
            unitPricePaise: catalogEntry.price,
            hsnSacCode: catalogEntry.sacCode,
            taxTreatment: 'taxable',
            gstRatePercent: Number(catalogEntry.gstRateOverride),
          }),
        ],
      });

    expect(response.status).toBe(201);

    const lines = await prisma.invoiceLineItem.findMany({
      where: { invoiceId: response.body.data.id },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].serviceCatalogId).toBe(catalogEntry.id);
    expect(lines[0].hsnSacCode).toBe('999319');
    expect(Number(lines[0].gstRatePercent)).toBe(18);
  });

  it('never exposes an invoice created in clinic B to a clinic A session', async () => {
    const created = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${clinicBToken}`)
      .send({ source: 'manual', lineItems: [serviceLine()] });

    expect(created.status).toBe(201);
    const clinicBInvoiceId = created.body.data.id;

    const list = await request(app.server)
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data.items.map((i: { id: string }) => i.id)).not.toContain(clinicBInvoiceId);

    // A guessed or leaked id must read as absent, not as forbidden — a 403 would
    // confirm the invoice exists.
    const direct = await request(app.server)
      .get(`/api/v1/billing/invoices/${clinicBInvoiceId}`)
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(direct.status).toBe(404);
    expect(direct.body.error.code).toBe('INVOICE_NOT_FOUND');
  });
});
