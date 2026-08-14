import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import { InvoiceService } from '../../src/modules/billing/invoice.service.js';
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
 * D-03: ending a consultation seeds the draft invoice the front desk collects
 * against. This suite complements `invoice-create.test.ts`, which covers the
 * *gated* `POST /billing/invoices/from-consultation/:consultationId` surface
 * that the D-06 Front Desk picker uses. What is proven here is the other
 * surface onto the same service method: the server-initiated hook inside
 * `EmrService.finalize`, which has no HTTP route and no permission check.
 *
 * Three properties carry the phase and each has a test that fails loudly if it
 * regresses:
 *
 *  1. **Ungated.** The trigger is a Clinician, and D-05 removes
 *     `CREATE_INVOICES` from that role. A draft must still appear.
 *  2. **Non-blocking.** A billing failure must never prevent a vet from closing
 *     a medical record. Proven by injecting a rejecting `InvoiceService` rather
 *     than by silencing the logger — the point is that the clinical path
 *     completes, not that nothing was printed.
 *  3. **Provenance preserved.** Every product line carries the
 *     `stockMovementId` of the Phase 5 movement it came from, which is what
 *     tells plan 06-07's finalize to stamp rather than deduct. A null there
 *     silently double-decrements stock the clinician already dispensed.
 */

let app: FastifyInstance;

let clinicId: string;
let clinicianToken: string;
let clinicianUserId: string;
let frontDeskUserId: string;
let ownerId: string;
let petId: string;

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

  const clinicianUser = await createTestUser({ fullName: 'Dr Clinician' });
  const frontDeskUser = await createTestUser({ fullName: 'Front Desk' });
  clinicianUserId = clinicianUser.id;
  frontDeskUserId = frontDeskUser.id;

  const clinic = await createTestClinic(frontDeskUser.id, { name: 'Hook Clinic' });
  clinicId = clinic.id;

  await createTestClinicMember(clinicianUser.id, clinic.id, 'Clinician');
  await createTestClinicMember(frontDeskUser.id, clinic.id, 'FrontDesk');

  clinicianToken = (await createTestTokens(app, clinicianUser.id, clinic.id)).accessToken;

  const owner = await createTestPetOwner(clinicId);
  ownerId = owner.id;
  const pet = await createTestPet(clinicId, owner.id);
  petId = pet.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const auth = () => ({ Authorization: `Bearer ${clinicianToken}` });

const finalizeConsultation = (consultationId: string) =>
  request(app.server)
    .post(`/api/v1/consultations/${consultationId}/finalize`)
    .set(auth())
    .send({});

/** A consultation attached to a WAITING queue entry, as the real flow has. */
async function consultationWithQueueEntry() {
  const queueEntry = await prisma.queueEntry.create({
    data: {
      clinicId,
      petId,
      checkedInBy: frontDeskUserId,
      treatingVetId: clinicianUserId,
      status: 'WAITING',
      position: 1,
    },
  });

  const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);
  await prisma.consultation.update({
    where: { id: consultation.id },
    data: { queueEntryId: queueEntry.id },
  });

  return { consultation, queueEntry };
}

/** Phase 5's real dispense, so the movement and the batch decrement both exist. */
async function dispenseDuringConsultation(
  consultationId: string,
  name: string,
  quantity: number,
) {
  const item = await createTestInventoryItem(clinicId, { name });
  await createTestStockBatch(clinicId, item.id, { initialQty: 20 });
  await dispenseForTest(clinicId, item.id, quantity, {
    userId: clinicianUserId,
    consultationId,
  });
  return item;
}

const draftsFor = (consultationId: string) =>
  prisma.invoice.findMany({ where: { clinicId, consultationId, status: 'DRAFT' } });

describe('D-03 End-Consultation draft invoice hook', () => {
  it('creates exactly one draft carrying every dispensed item as a product line', async () => {
    const { consultation } = await consultationWithQueueEntry();
    await dispenseDuringConsultation(consultation.id, 'Amoxicillin', 2);
    await dispenseDuringConsultation(consultation.id, 'Meloxicam', 3);

    const response = await finalizeConsultation(consultation.id);
    expect(response.status).toBe(200);

    const drafts = await draftsFor(consultation.id);
    expect(drafts).toHaveLength(1);

    const draft = drafts[0];
    expect(draft.source).toBe('consultation');
    expect(draft.consultationId).toBe(consultation.id);
    expect(draft.petId).toBe(petId);
    // D-27: the invoice is addressed to the pet's owner, not to the vet.
    expect(draft.ownerId).toBe(ownerId);

    const lines = await prisma.invoiceLineItem.findMany({
      where: { invoiceId: draft.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.lineType === 'product')).toBe(true);
    expect(lines.map((line) => line.description).sort()).toEqual([
      'Amoxicillin',
      'Meloxicam',
    ]);
    // Quantities come from the StockMovement, the only model that carries one.
    expect(lines.map((line) => line.quantity).sort()).toEqual([2, 3]);
  });

  it('stamps every product line with the stock movement it was sourced from', async () => {
    const { consultation } = await consultationWithQueueEntry();
    await dispenseDuringConsultation(consultation.id, 'Ivermectin', 1);

    expect((await finalizeConsultation(consultation.id)).status).toBe(200);

    const [draft] = await draftsFor(consultation.id);
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: draft.id } });

    expect(lines).toHaveLength(1);
    // The deduct/skip discriminator plan 06-07's finalize keys off. A null here
    // would make finalize deduct stock the clinician has already handed over.
    for (const line of lines) {
      expect(line.stockMovementId).not.toBeNull();
    }

    const movement = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: lines[0].stockMovementId! },
    });
    expect(movement.type).toBe('dispensed');
    expect(movement.consultationId).toBe(consultation.id);
  });

  it('creates an empty draft when the consultation dispensed nothing', async () => {
    const { consultation } = await consultationWithQueueEntry();

    expect((await finalizeConsultation(consultation.id)).status).toBe(200);

    const drafts = await draftsFor(consultation.id);
    // D-01/D-06: the front desk still needs something to hang service lines on,
    // so "no dispensed items" means an empty draft, not no draft at all.
    expect(drafts).toHaveLength(1);

    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: drafts[0].id } });
    expect(lines).toHaveLength(0);
  });

  it('leaves exactly one draft when End Consultation is pressed twice', async () => {
    const { consultation } = await consultationWithQueueEntry();
    await dispenseDuringConsultation(consultation.id, 'Cefpodoxime', 1);

    const first = await finalizeConsultation(consultation.id);
    expect(first.status).toBe(200);

    // The retry-after-timeout case. The second finalize is rejected as already
    // finalized, and critically does NOT seed a second draft.
    const second = await finalizeConsultation(consultation.id);
    expect(second.status).toBe(409);

    expect(await draftsFor(consultation.id)).toHaveLength(1);
  });

  it('is idempotent at the service level, so a concurrent retry cannot double-seed', async () => {
    const { consultation } = await consultationWithQueueEntry();
    await dispenseDuringConsultation(consultation.id, 'Doxycycline', 2);

    // Straight at the service method, bypassing the already-finalized guard, so
    // this exercises the partial unique index and the P2002 catch rather than
    // the consultation status check.
    const { createTenantClient } = await import('../../src/lib/prisma-rls.js');
    const { InvoiceRepository } = await import('../../src/modules/billing/invoice.repository.js');
    const { StockValidatorService } = await import(
      '../../src/modules/billing/stock-validator.service.js'
    );
    const { StockMovementService } = await import(
      '../../src/modules/inventory/stock-movement.service.js'
    );

    const db = createTenantClient(clinicId);
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    const service = new InvoiceService(
      new InvoiceRepository(db, stockValidator),
      stockValidator,
      db,
    );
    const actor = { userId: clinicianUserId, userName: 'Dr Clinician' };

    const first = await service.createDraftFromConsultation(clinicId, consultation.id, actor);
    const second = await service.createDraftFromConsultation(clinicId, consultation.id, actor);

    expect(second.id).toBe(first.id);
    expect(await draftsFor(consultation.id)).toHaveLength(1);
  });

  it('creates the draft for a Clinician who does not hold CREATE_INVOICES (D-03 vs D-05)', async () => {
    // The gate the hook must not be subject to. Proving the role genuinely
    // lacks it — rather than assuming the seed is right — is what makes the
    // success below meaningful.
    const denied = await request(app.server)
      .post('/api/v1/billing/invoices')
      .set(auth())
      .send({ source: 'manual', lineItems: [] });
    expect(denied.status).toBe(403);

    const { consultation } = await consultationWithQueueEntry();
    await dispenseDuringConsultation(consultation.id, 'Praziquantel', 1);

    expect((await finalizeConsultation(consultation.id)).status).toBe(200);

    // Same actor, same request, no permission — and the draft exists anyway,
    // because the hook is a server-initiated service call with no HTTP surface.
    expect(await draftsFor(consultation.id)).toHaveLength(1);
  });

  it('finalizes the consultation anyway when draft creation throws (T-06-84)', async () => {
    const { consultation, queueEntry } = await consultationWithQueueEntry();
    await dispenseDuringConsultation(consultation.id, 'Ketamine', 1);

    // Injected at the service, not at the logger. The assertion is that the
    // clinical path completed, which a logger mock would not prove.
    const spy = vi
      .spyOn(InvoiceService.prototype, 'createDraftFromConsultation')
      .mockRejectedValue(new Error('boom'));

    const response = await finalizeConsultation(consultation.id);

    expect(spy).toHaveBeenCalled();
    // A billing failure must never block a vet closing a medical record.
    expect(response.status).toBe(200);

    const finalized = await prisma.consultation.findUniqueOrThrow({
      where: { id: consultation.id },
    });
    expect(finalized.status).toBe('finalized');
    expect(finalized.finalizedAt).not.toBeNull();

    const queue = await prisma.queueEntry.findUniqueOrThrow({ where: { id: queueEntry.id } });
    expect(queue.status).toBe('DONE');

    const audit = await prisma.authAuditLog.findMany({
      where: { clinicId, event: 'CONSULTATION_FINALIZED' },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);

    // The failure is surfaced through the logger only — no draft was left behind.
    expect(await draftsFor(consultation.id)).toHaveLength(0);
  });

  it('marks the queue entry DONE and writes the audit row alongside the draft', async () => {
    const { consultation, queueEntry } = await consultationWithQueueEntry();
    await dispenseDuringConsultation(consultation.id, 'Tramadol', 1);

    expect((await finalizeConsultation(consultation.id)).status).toBe(200);

    const queue = await prisma.queueEntry.findUniqueOrThrow({ where: { id: queueEntry.id } });
    expect(queue.status).toBe('DONE');
    expect(queue.completedAt).not.toBeNull();

    const audit = await prisma.authAuditLog.findMany({
      where: { clinicId, event: 'CONSULTATION_FINALIZED' },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);

    expect(await draftsFor(consultation.id)).toHaveLength(1);
  });

  it('seeds the draft after the queue update and before the consultation audit write', async () => {
    // A structural assertion, because the ordering is not observable from the
    // outside once the request has returned. It matters twice over: after the
    // queue update means no draft can exist for a consultation that failed to
    // finalize, and before the audit write keeps finalize one logical operation.
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src/modules/emr/emr.service.ts'),
      'utf8',
    );

    // Just the body of `finalize`, stopping before the private helpers that
    // follow it — otherwise their doc comments land inside the window and the
    // ordering assertion below measures the wrong thing.
    const finalizeBody = source.slice(
      source.indexOf('async finalize('),
      source.indexOf('private async seedDraftInvoice('),
    );

    const queueUpdateAt = finalizeBody.indexOf('updateQueueEntryStatus');
    const hookAt = finalizeBody.indexOf('this.seedDraftInvoice(');
    const auditAt = finalizeBody.indexOf('writeAuditLog');

    expect(queueUpdateAt).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(-1);
    expect(auditAt).toBeGreaterThan(-1);

    expect(hookAt).toBeGreaterThan(queueUpdateAt);
    expect(hookAt).toBeLessThan(auditAt);

    // The hook is extracted into a private method, matching how the D-28
    // dosage-override side effect is already structured, so the ordering above
    // only means something if that method is in fact the billing call.
    const helperBody = source.slice(source.indexOf('private async seedDraftInvoice('));
    expect(helperBody).toContain('this.invoiceService.createDraftFromConsultation(');

    // Exactly one call site — the draft must be seeded once per finalize.
    expect(
      source.match(/this\.invoiceService\?*\.createDraftFromConsultation\(/g) ?? [],
    ).toHaveLength(1);

    // The hook must stay ungated: a permission check anywhere in the EMR
    // service would 403 the exact role D-03 depends on.
    expect(source).not.toContain('requirePermission');
  });
});
