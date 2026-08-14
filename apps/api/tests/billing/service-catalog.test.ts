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
  createTestServiceCatalogEntry,
  prisma,
} from '../helpers/factories.js';

/**
 * D-02 service catalog CRUD — preset and custom entries, search, soft
 * deactivation, and the D-05 permission split — over HTTP against a real
 * database.
 *
 * The catalog is reference data that finalized invoices point at, which is what
 * makes two of the behaviours below non-obvious:
 *
 *  * a preset can be repriced and deactivated but **not renamed**, because its
 *    name is the description on every draft invoice referencing it; and
 *  * deactivation is a soft delete, because `invoice_line_items.service_catalog_id`
 *    on an immutable financial record must stay resolvable.
 */

let app: FastifyInstance;

let clinicAId: string;
let clinicBId: string;
let adminToken: string;
let frontDeskToken: string;
let clinicianToken: string;

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

  const adminUser = await createTestUser({ fullName: 'Admin' });
  const frontDeskUser = await createTestUser({ fullName: 'Front Desk' });
  const clinicianUser = await createTestUser({ fullName: 'Clinician' });
  const clinicBUser = await createTestUser({ fullName: 'Clinic B Admin' });

  const clinicA = await createTestClinic(adminUser.id, { name: 'Clinic A' });
  const clinicB = await createTestClinic(clinicBUser.id, { name: 'Clinic B' });
  clinicAId = clinicA.id;
  clinicBId = clinicB.id;

  await createTestClinicMember(adminUser.id, clinicA.id, 'Admin');
  await createTestClinicMember(frontDeskUser.id, clinicA.id, 'FrontDesk');
  await createTestClinicMember(clinicianUser.id, clinicA.id, 'Clinician');
  await createTestClinicMember(clinicBUser.id, clinicB.id, 'Admin');

  adminToken = (await createTestTokens(app, adminUser.id, clinicA.id)).accessToken;
  frontDeskToken = (await createTestTokens(app, frontDeskUser.id, clinicA.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinicianUser.id, clinicA.id)).accessToken;
});

/** A preset row, as `seedServiceCatalog` would have written it. */
async function seedPreset(
  clinicId: string,
  name: string,
  sortOrder: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.serviceCatalog.create({
    data: {
      clinicId,
      name,
      category: 'consultation',
      price: 50000,
      sacCode: '999311',
      gstRateOverride: 0,
      isPreset: true,
      sortOrder,
      ...overrides,
    },
  });
}

describe('D-02 service catalog CRUD', () => {
  it('lists active entries with presets first by sortOrder, then custom entries', async () => {
    await seedPreset(clinicAId, 'General Consultation', 1);
    await seedPreset(clinicAId, 'Surgery', 2);
    await createTestServiceCatalogEntry(clinicAId, { name: 'Nail Trim' });

    const response = await request(app.server)
      .get('/api/v1/billing/services')
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(response.status).toBe(200);
    const names = response.body.data.map((s: { name: string }) => s.name);
    expect(names).toEqual(['General Consultation', 'Surgery', 'Nail Trim']);
  });

  it('excludes deactivated entries from the list', async () => {
    await seedPreset(clinicAId, 'General Consultation', 1);
    await createTestServiceCatalogEntry(clinicAId, {
      name: 'Retired Service',
      isActive: false,
    });

    const response = await request(app.server)
      .get('/api/v1/billing/services')
      .set('Authorization', `Bearer ${frontDeskToken}`);

    const names = response.body.data.map((s: { name: string }) => s.name);
    expect(names).toEqual(['General Consultation']);
  });

  it('matches a partial, differently-cased search term against the name', async () => {
    await seedPreset(clinicAId, 'General Consultation', 1);
    await seedPreset(clinicAId, 'X-Ray', 2);

    const response = await request(app.server)
      .get('/api/v1/billing/services/search?q=consult')
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('General Consultation');
  });

  it('creates a custom entry with isPreset false and a paise price', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/services')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ name: 'Nail Trim', category: 'other', price: 25000, gstRateOverride: 0 });

    expect(response.status).toBe(201);
    expect(response.body.data.isPreset).toBe(false);
    expect(response.body.data.price).toBe(25000);
    expect(response.body.data.isActive).toBe(true);
  });

  it('rejects a fractional rupee price before it reaches the service', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/services')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      // 250.50 is a rupee figure that slipped through unconverted. Money is
      // integer paise (D-31); a fraction here is always a bug or an attack.
      .send({ name: 'Nail Trim', category: 'other', price: 250.5 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a gstRateOverride of 12, a slab retired by GST 2.0', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/services')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ name: 'Pet Shampoo Service', category: 'grooming', price: 20000, gstRateOverride: 12 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("updates a preset's price but refuses to rename it", async () => {
    const preset = await seedPreset(clinicAId, 'General Consultation', 1);

    const repriced = await request(app.server)
      .patch(`/api/v1/billing/services/${preset.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ price: 75000 });

    expect(repriced.status).toBe(200);
    expect(repriced.body.data.price).toBe(75000);

    const renamed = await request(app.server)
      .patch(`/api/v1/billing/services/${preset.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ name: 'Consultation (Renamed)' });

    expect(renamed.status).toBe(400);
    expect(renamed.body.error.code).toBe('CANNOT_MODIFY_PRESET');

    // The stored name is untouched, so every draft invoice line referencing it
    // still reads the same.
    const stored = await prisma.serviceCatalog.findUnique({ where: { id: preset.id } });
    expect(stored?.name).toBe('General Consultation');
  });

  it("refuses to flip a preset's isPreset flag", async () => {
    const preset = await seedPreset(clinicAId, 'Surgery', 2);

    const response = await request(app.server)
      .patch(`/api/v1/billing/services/${preset.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ isPreset: false });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CANNOT_MODIFY_PRESET');
  });

  it('renames a custom entry freely', async () => {
    const custom = await createTestServiceCatalogEntry(clinicAId, { name: 'Nail Trim' });

    const response = await request(app.server)
      .patch(`/api/v1/billing/services/${custom.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ name: 'Nail Trim (Large Breed)' });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Nail Trim (Large Breed)');
  });

  it('deactivates by soft delete, leaving the row resolvable for finalized invoices', async () => {
    const custom = await createTestServiceCatalogEntry(clinicAId, { name: 'Nail Trim' });

    const response = await request(app.server)
      .post(`/api/v1/billing/services/${custom.id}/deactivate`)
      .set('Authorization', `Bearer ${frontDeskToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);

    // The row still exists: an InvoiceLineItem.serviceCatalogId pointing at it
    // on an immutable financial record must not dangle.
    const stored = await prisma.serviceCatalog.findUnique({ where: { id: custom.id } });
    expect(stored).not.toBeNull();
    expect(stored?.isActive).toBe(false);
  });

  it("never returns another clinic's catalog entry, by list or by direct fetch", async () => {
    const foreign = await createTestServiceCatalogEntry(clinicBId, { name: 'Clinic B Service' });

    const list = await request(app.server)
      .get('/api/v1/billing/services')
      .set('Authorization', `Bearer ${frontDeskToken}`);
    expect(list.body.data).toHaveLength(0);

    const direct = await request(app.server)
      .get(`/api/v1/billing/services/${foreign.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`);
    expect(direct.status).toBe(404);
    expect(direct.body.error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('lets a Clinician read the catalog but not write to it (D-05)', async () => {
    const custom = await createTestServiceCatalogEntry(clinicAId, { name: 'Nail Trim' });

    // VIEW_INVOICES — a vet picking services during a consultation must see them.
    const read = await request(app.server)
      .get('/api/v1/billing/services')
      .set('Authorization', `Bearer ${clinicianToken}`);
    expect(read.status).toBe(200);

    // CREATE_INVOICES — which D-05 withholds from Clinician.
    const create = await request(app.server)
      .post('/api/v1/billing/services')
      .set('Authorization', `Bearer ${clinicianToken}`)
      .send({ name: 'Unauthorized Service', category: 'other', price: 10000 });
    expect(create.status).toBe(403);

    const update = await request(app.server)
      .patch(`/api/v1/billing/services/${custom.id}`)
      .set('Authorization', `Bearer ${clinicianToken}`)
      .send({ price: 1 });
    expect(update.status).toBe(403);

    const deactivate = await request(app.server)
      .post(`/api/v1/billing/services/${custom.id}/deactivate`)
      .set('Authorization', `Bearer ${clinicianToken}`);
    expect(deactivate.status).toBe(403);
  });

  it('lets an Admin manage the catalog as well as Front Desk', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Behavioural Assessment', category: 'other', price: 40000 });

    expect(response.status).toBe(201);
  });

  it('stores a gstRateOverride of 0 so the line is exempt when it reaches an invoice', async () => {
    // Finding G1: veterinary healthcare is exempt by law, so 0 is a real,
    // meaningful stored value and must survive the round trip rather than being
    // treated as "unset" and coerced to the clinic default.
    const response = await request(app.server)
      .post('/api/v1/billing/services')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ name: 'Second Opinion', category: 'consultation', price: 45000, gstRateOverride: 0 });

    expect(response.status).toBe(201);
    expect(response.body.data.gstRateOverride).toBe(0);

    const stored = await prisma.serviceCatalog.findUnique({
      where: { id: response.body.data.id },
    });
    expect(Number(stored?.gstRateOverride)).toBe(0);
  });

  it('returns 404 when updating or deactivating an entry belonging to another clinic', async () => {
    const foreign = await createTestServiceCatalogEntry(clinicBId, { name: 'Clinic B Service' });

    const update = await request(app.server)
      .patch(`/api/v1/billing/services/${foreign.id}`)
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ price: 1 });
    expect(update.status).toBe(404);

    const deactivate = await request(app.server)
      .post(`/api/v1/billing/services/${foreign.id}/deactivate`)
      .set('Authorization', `Bearer ${frontDeskToken}`);
    expect(deactivate.status).toBe(404);

    // And clinic B's row is untouched.
    const stored = await prisma.serviceCatalog.findUnique({ where: { id: foreign.id } });
    expect(stored?.isActive).toBe(true);
    expect(stored?.price).toBe(50000);
  });
});
