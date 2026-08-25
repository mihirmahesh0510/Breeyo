import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { ReplayPriority } from '@breeyo/types';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestInventoryItem,
  createTestStockBatch,
  prisma,
} from '../helpers/factories.js';

/**
 * Plan 10-06 Task 1 (PLT-03, roadmap Phase 10 success criteria, D-25/D-26):
 * the mandatory walk-in -> consultation -> dispense -> invoice -> payment
 * golden path, proven with THREE of its five steps genuinely captured
 * offline and reconciled through their real `/sync/replay` endpoints
 * (check-in via Plan 10-02, the consultation note via Plan 10-03, the
 * dispense via Plan 10-04) -- not just performed online end to end. Invoice
 * generation and payment collection are deliberately performed ONLINE,
 * matching Phase 6's D-41 (billing/payment stay blocked offline; Phase 10's
 * offline action boundaries D-01 to D-04 do not extend to billing) --
 * `walkin-to-payment` is the name of the overall clinic journey, not a claim
 * that every one of its steps is offline-capable.
 *
 * "Consistency across mobile and web visibility" is proven by reading the
 * final state back through BOTH the mobile queue/invoice endpoints and the
 * Plan 09-04 web workbench/board endpoints and asserting they agree.
 */

let app: FastifyInstance;

let clinicId: string;
let vetUserId: string;
let token: string;

const DEVICE_ID = 'front-desk-tablet-golden-path';

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

  const vet = await createTestUser({ fullName: 'Dr Golden Path' });
  vetUserId = vet.id;

  const clinic = await createTestClinic(vet.id, { name: 'Golden Path Clinic' });
  clinicId = clinic.id;
  // Admin so this one caller can register, check in, consult, dispense,
  // finalize invoices and collect payment -- the underlying permission
  // boundaries between these roles are already covered by Phase 3/4/5/6's
  // own suites; this test is about cross-module reconciliation, not RBAC.
  await createTestClinicMember(vet.id, clinic.id, 'Admin');
  token = (await createTestTokens(app, vet.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

function envelope(overrides: {
  operationId?: string;
  domain: string;
  entityType: string;
  entityId: string;
  priority: ReplayPriority;
  payload: unknown;
}) {
  return {
    deviceId: DEVICE_ID,
    operationId: overrides.operationId ?? randomUUID(),
    clinicId: 'ignored-by-server',
    userId: 'ignored-by-server',
    domain: overrides.domain,
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    priority: overrides.priority,
    createdAt: new Date().toISOString(),
    payload: overrides.payload,
  };
}

describe('Golden path: walk-in -> consultation -> dispense -> invoice -> payment (offline-then-reconnect for the offline-capable steps)', () => {
  it('completes end to end and is consistent across mobile and web visibility after reconnect', async () => {
    // ---- Registration (online -- a brand-new owner/pet lookup needs
    // connectivity per Plan 10-02's own documented scope boundary). ----
    const registerRes = await request(app.server)
      .post('/api/v1/patients/register')
      .set(auth())
      .send({
        owner: { mobile: `${6000000000 + Math.floor(Math.random() * 3999999999)}`, name: 'Golden Path Owner' },
        pet: { name: 'Bruno', species: 'DOG' },
      });
    expect(registerRes.status).toBe(201);
    const { owner, pet } = registerRes.body.data;

    // ---- Step 1: walk-in check-in, captured OFFLINE (Plan 10-02) and
    // replayed on reconnect. ----
    const checkInOp = envelope({
      domain: 'queue',
      entityType: 'QUEUE_CHECK_IN',
      priority: ReplayPriority.QUEUE_HIGH,
      entityId: pet.id,
      payload: { petId: pet.id, visitReason: 'Limping on left hind leg', checkedInAt: new Date().toISOString() },
    });
    const checkInReplay = await request(app.server)
      .post('/api/v1/queue/sync/replay')
      .set(auth())
      .send({ deviceId: DEVICE_ID, operations: [checkInOp] });
    expect(checkInReplay.status).toBe(200);
    expect(checkInReplay.body.data.acknowledgedOperationIds).toEqual([checkInOp.operationId]);

    const queueEntry = await prisma.queueEntry.findFirstOrThrow({ where: { clinicId, petId: pet.id } });
    expect(queueEntry.status).toBe('WAITING');

    // ---- Step 2: consultation. Creation requires connectivity (Plan
    // 10-03's own documented scope boundary), but the SOAP note itself is
    // captured OFFLINE and replayed. ----
    const createConsultationRes = await request(app.server)
      .post('/api/v1/consultations')
      .set(auth())
      .send({ petId: pet.id, queueEntryId: queueEntry.id, visitType: 'general' });
    expect(createConsultationRes.status).toBe(201);
    const consultationId = createConsultationRes.body.data.id as string;

    const draftOp = envelope({
      domain: 'emr',
      entityType: 'CONSULTATION_DRAFT_SAVE',
      priority: ReplayPriority.CLINICAL_MEDIUM,
      entityId: consultationId,
      payload: {
        baseline: {},
        draft: {
          assessment: 'Mild soft-tissue strain, no fracture on palpation',
          plan: { freeText: 'NSAID course, recheck in 5 days if no improvement' },
        },
      },
    });
    const draftReplay = await request(app.server)
      .post('/api/v1/consultations/sync/replay')
      .set(auth())
      .send({ deviceId: DEVICE_ID, operations: [draftOp] });
    expect(draftReplay.status).toBe(200);
    expect(draftReplay.body.data.conflictIds).toEqual([]);

    const draftAfterReplay = await request(app.server)
      .get(`/api/v1/consultations/${consultationId}/draft`)
      .set(auth());
    expect(draftAfterReplay.body.data.assessment).toBe('Mild soft-tissue strain, no fracture on palpation');

    // ---- Step 3: dispense, captured OFFLINE (Plan 10-04) and replayed,
    // linked to this consultation so invoice generation can pick it up. ----
    const item = await createTestInventoryItem(clinicId, { name: 'Meloxicam 1.5mg/ml', sellingPrice: 350 });
    await createTestStockBatch(clinicId, item.id, { initialQty: 20 });

    const dispenseOp = envelope({
      domain: 'inventory',
      entityType: 'STOCK_DISPENSE',
      priority: ReplayPriority.INVENTORY_MEDIUM,
      entityId: item.id,
      payload: { quantity: 3, consultationId, ownerId: owner.id },
    });
    const dispenseReplay = await request(app.server)
      .post('/api/v1/inventory/sync/replay')
      .set(auth())
      .send({ deviceId: DEVICE_ID, operations: [dispenseOp] });
    expect(dispenseReplay.status).toBe(200);
    expect(dispenseReplay.body.data.acknowledgedOperationIds).toEqual([dispenseOp.operationId]);
    expect(dispenseReplay.body.data.reviewTaskIds).toEqual([]);

    const itemAfterDispense = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(itemAfterDispense?.currentStock).toBe(17);

    // ---- Step 4: end the consultation (ONLINE -- reconnect has happened by
    // now). This is also where `EmrService.finalize` best-effort auto-seeds
    // the draft invoice (D-03), pulling in the dispensed line item. ----
    const finalizeConsultationRes = await request(app.server)
      .post(`/api/v1/consultations/${consultationId}/finalize`)
      .set(auth())
      .send({});
    expect(finalizeConsultationRes.status).toBe(200);

    const draftInvoice = await prisma.invoice.findFirstOrThrow({ where: { clinicId, consultationId } });
    expect(draftInvoice.status).toBe('DRAFT');

    const invoiceLineItems = await prisma.invoiceLineItem.findMany({ where: { clinicId, invoiceId: draftInvoice.id } });
    expect(invoiceLineItems.length).toBeGreaterThan(0);
    expect(invoiceLineItems.some((line) => line.inventoryItemId === item.id)).toBe(true);

    // ---- Step 5: invoice finalize + payment (ONLINE -- Phase 6 D-41: this
    // step never happens offline in the real app). ----
    const finalizeInvoiceRes = await request(app.server)
      .post(`/api/v1/billing/invoices/${draftInvoice.id}/finalize`)
      .set(auth())
      .send({});
    expect(finalizeInvoiceRes.status).toBe(200);
    expect(finalizeInvoiceRes.body.data.invoiceNumber).toBeTruthy();

    const grandTotalPaise = finalizeInvoiceRes.body.data.grandTotalPaise as number;
    expect(grandTotalPaise).toBeGreaterThan(0);

    const paymentRes = await request(app.server)
      .post(`/api/v1/billing/invoices/${draftInvoice.id}/payments`)
      .set(auth())
      .send({ mode: 'single', method: 'cash', amountPaise: grandTotalPaise });
    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.data.invoice.status).toBe('PAID');
    expect(paymentRes.body.data.invoice.balancePaise).toBe(0);

    // ---- Replay-safe completion: `EmrService.finalize` (Step 4 above)
    // already auto-completed this linked queue entry to DONE (D-04's own
    // consultation-finalize hook) -- confirmed directly rather than
    // re-driving a manual transition that would now be a no-op-turned-error
    // (DONE has no further valid transitions). This is itself part of the
    // golden path's cross-module consistency: finishing the clinical
    // record is what closes out the operational queue entry, with no
    // separate front-desk action required.

    // ---- Consistency across mobile and web visibility. ----
    const mobileInvoiceRes = await request(app.server).get(`/api/v1/billing/invoices/${draftInvoice.id}`).set(auth());
    expect(mobileInvoiceRes.body.data.status).toBe('PAID');
    expect(mobileInvoiceRes.body.data.balancePaise).toBe(0);

    const webWorkbenchRes = await request(app.server).get('/api/v1/billing/web/workbench').set(auth());
    expect(webWorkbenchRes.status).toBe(200);
    expect(webWorkbenchRes.body.data.unpaid.some((row: { id: string }) => row.id === draftInvoice.id)).toBe(false);
    const recentPayment = webWorkbenchRes.body.data.recentPayments.find(
      (row: { invoiceId: string }) => row.invoiceId === draftInvoice.id,
    );
    expect(recentPayment).toBeTruthy();
    expect(recentPayment.amountPaise).toBe(grandTotalPaise);

    const mobileQueueRes = await request(app.server).get('/api/v1/queue').set(auth());
    const mobileDone = [...mobileQueueRes.body.data.done].some((entry: { id: string }) => entry.id === queueEntry.id);
    expect(mobileDone).toBe(true);

    const webQueueBoardRes = await request(app.server).get('/api/v1/queue/web/board').set(auth());
    expect(webQueueBoardRes.status).toBe(200);
    const webDone = [...webQueueBoardRes.body.data.done].some((entry: { id: string }) => entry.id === queueEntry.id);
    expect(webDone).toBe(true);

    const finalQueueEntry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: queueEntry.id } });
    expect(finalQueueEntry.status).toBe('DONE');
  });
});
