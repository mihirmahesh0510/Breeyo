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
  createTestInvoice,
  createTestPayment,
} from '../helpers/factories.js';

/**
 * The D-24 billing dashboard plus RPT-01's patients-seen-today (D-33),
 * exercised over HTTP against a real database.
 *
 * ## Why this suite is mostly about a timezone
 *
 * Every "today" figure on this dashboard is bounded by the **IST** day, not the
 * UTC day, and the two do not coincide: UTC midnight is 05:30 IST, so a
 * UTC-based boundary silently drops every payment taken and every consultation
 * finalized between midnight and 05:30 IST — the whole early-clinic morning.
 * The revenue card would under-report on any busy morning and the error would
 * self-heal by lunchtime, which is the hardest possible bug to notice.
 *
 * So the seeds below are placed at instants chosen to straddle that boundary:
 * one hour after IST midnight (01:00 IST today, which is 19:30 UTC *yesterday*)
 * and one hour before it (23:00 IST yesterday, 17:30 UTC yesterday). A
 * UTC-based implementation puts the first outside "today" and passes every
 * other assertion in this file.
 */

let app: FastifyInstance;

let clinicAId: string;
let clinicBId: string;
let frontDeskToken: string;
let clinicianToken: string;
let frontDeskUserId: string;
let clinicBUserId: string;
let petAId: string;
let petA2Id: string;
let vetAId: string;
let petBId: string;
let vetBId: string;

/**
 * Midnight IST expressed as a UTC instant.
 *
 * Deliberately derived here by plain offset arithmetic rather than by importing
 * `QueueRepository.getTodayIST()`. Asserting an implementation against the very
 * helper it uses proves only that the helper is self-consistent; an independent
 * derivation is what makes the boundary assertions below meaningful.
 */
function istMidnightUtc(): Date {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const now = new Date();
  // Shift into the IST wall clock, read the calendar date off it, then shift
  // that date's midnight back to the UTC instant it corresponds to.
  const istWallClock = new Date(now.getTime() + IST_OFFSET_MS);
  const midnightIstAsUtcWallClock = Date.UTC(
    istWallClock.getUTCFullYear(),
    istWallClock.getUTCMonth(),
    istWallClock.getUTCDate(),
  );
  return new Date(midnightIstAsUtcWallClock - IST_OFFSET_MS);
}

const HOUR_MS = 60 * 60 * 1000;

/** 01:00 IST today — 19:30 UTC yesterday. Inside the IST day. */
function oneAmIst(): Date {
  return new Date(istMidnightUtc().getTime() + HOUR_MS);
}

/** 23:00 IST yesterday — 17:30 UTC yesterday. Outside the IST day. */
function elevenPmIstYesterday(): Date {
  return new Date(istMidnightUtc().getTime() - HOUR_MS);
}

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  // PermissionService caches resolved permission sets in Redis under `perms:*`.
  // A set cached by an earlier suite would mask the gate being asserted here.
  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const frontDeskUser = await createTestUser({ fullName: 'Front Desk' });
  const clinicianUser = await createTestUser({ fullName: 'Clinician' });
  const clinicBUser = await createTestUser({ fullName: 'Clinic B Admin' });

  frontDeskUserId = frontDeskUser.id;
  clinicBUserId = clinicBUser.id;
  vetAId = clinicianUser.id;
  vetBId = clinicBUser.id;

  const clinicA = await createTestClinic(frontDeskUser.id, { name: 'Clinic A' });
  const clinicB = await createTestClinic(clinicBUser.id, { name: 'Clinic B' });
  clinicAId = clinicA.id;
  clinicBId = clinicB.id;

  await createTestClinicMember(frontDeskUser.id, clinicA.id, 'FrontDesk');
  await createTestClinicMember(clinicianUser.id, clinicA.id, 'Clinician');
  await createTestClinicMember(clinicBUser.id, clinicB.id, 'Admin');

  frontDeskToken = (await createTestTokens(app, frontDeskUser.id, clinicA.id)).accessToken;
  clinicianToken = (await createTestTokens(app, clinicianUser.id, clinicA.id)).accessToken;

  const ownerA = await createTestPetOwner(clinicA.id);
  const ownerB = await createTestPetOwner(clinicB.id);
  petAId = (await createTestPet(clinicA.id, ownerA.id, { name: 'Bruno' })).id;
  petA2Id = (await createTestPet(clinicA.id, ownerA.id, { name: 'Simba' })).id;
  petBId = (await createTestPet(clinicB.id, ownerB.id, { name: 'Rocky' })).id;
});

async function getSummary(token: string) {
  return request(app.server)
    .get('/api/v1/billing/dashboard')
    .set('Authorization', `Bearer ${token}`);
}

describe('RPT-01 / D-24 billing dashboard', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app.server).get('/api/v1/billing/dashboard');

    expect(response.status).toBe(401);
  });

  it('returns all five metrics as zeros for a clinic with no billing data', async () => {
    const response = await getSummary(frontDeskToken);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      todayRevenuePaise: 0,
      unpaidTotalPaise: 0,
      overdueCount: 0,
      recentPaymentsCount: 0,
      patientsSeenToday: 0,
    });
  });

  it('is readable by any role holding VIEW_INVOICES, including a Clinician', async () => {
    const response = await getSummary(clinicianToken);

    expect(response.status).toBe(200);
    expect(response.body.data.patientsSeenToday).toBe(0);
  });

  it("counts a payment captured at 01:00 IST today in today's revenue", async () => {
    const invoice = await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'PAID',
      grandTotalPaise: 120000,
    });
    await createTestPayment(clinicAId, invoice.id, {
      amountPaise: 120000,
      status: 'captured',
      paidAt: oneAmIst(),
    });

    const response = await getSummary(frontDeskToken);

    expect(response.status).toBe(200);
    // 19:30 UTC *yesterday*. A UTC-bounded "today" excludes this and reports 0.
    expect(response.body.data.todayRevenuePaise).toBe(120000);
    expect(response.body.data.recentPaymentsCount).toBe(1);
  });

  it("excludes a payment captured at 23:00 IST yesterday from today's revenue", async () => {
    const invoice = await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'PAID',
      grandTotalPaise: 90000,
    });
    await createTestPayment(clinicAId, invoice.id, {
      amountPaise: 90000,
      status: 'captured',
      paidAt: elevenPmIstYesterday(),
    });

    const response = await getSummary(frontDeskToken);

    expect(response.body.data.todayRevenuePaise).toBe(0);
    expect(response.body.data.recentPaymentsCount).toBe(0);
  });

  it("counts only captured payments, never pending or failed ones, in today's revenue", async () => {
    const invoice = await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'PARTIALLY_PAID',
      grandTotalPaise: 300000,
    });
    await createTestPayment(clinicAId, invoice.id, {
      amountPaise: 100000,
      status: 'captured',
      paidAt: new Date(),
    });
    await createTestPayment(clinicAId, invoice.id, {
      amountPaise: 200000,
      status: 'pending',
      paidAt: null,
      razorpayPaymentLinkId: 'plink_pending_1',
    });

    const response = await getSummary(frontDeskToken);

    expect(response.body.data.todayRevenuePaise).toBe(100000);
    expect(response.body.data.recentPaymentsCount).toBe(1);
  });

  it('sums the unpaid total over UNPAID, PARTIALLY_PAID and OVERDUE, excluding DRAFT and VOIDED', async () => {
    await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'UNPAID',
      balancePaise: 50000,
    });
    await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'PARTIALLY_PAID',
      balancePaise: 25000,
    });
    await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'OVERDUE',
      balancePaise: 10000,
    });
    // Neither of these is money owed: a draft has not been issued and a void
    // has been withdrawn. Counting either would overstate what the clinic is
    // waiting to collect.
    await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'DRAFT',
      balancePaise: 999999,
    });
    await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'VOIDED',
      balancePaise: 888888,
    });

    const response = await getSummary(frontDeskToken);

    expect(response.body.data.unpaidTotalPaise).toBe(85000);
    expect(response.body.data.overdueCount).toBe(1);
  });

  it('does not multiply the unpaid total by the number of payments on an invoice', async () => {
    // The naive `invoices LEFT JOIN payments` aggregate double-counts
    // `balance_paise` once per payment row. A split payment (D-10) is two rows
    // against one invoice, so this invoice would report 3x its balance.
    const invoice = await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'PARTIALLY_PAID',
      grandTotalPaise: 100000,
      balancePaise: 40000,
    });
    await createTestPayment(clinicAId, invoice.id, {
      amountPaise: 20000,
      status: 'captured',
      paidAt: new Date(),
      razorpayPaymentLinkId: 'plink_split_a',
    });
    await createTestPayment(clinicAId, invoice.id, {
      amountPaise: 20000,
      status: 'captured',
      paidAt: new Date(),
      razorpayPaymentLinkId: 'plink_split_b',
    });
    await createTestPayment(clinicAId, invoice.id, {
      amountPaise: 20000,
      status: 'captured',
      paidAt: new Date(),
      razorpayPaymentLinkId: 'plink_split_c',
    });

    const response = await getSummary(frontDeskToken);

    expect(response.body.data.unpaidTotalPaise).toBe(40000);
    expect(response.body.data.todayRevenuePaise).toBe(60000);
    expect(response.body.data.recentPaymentsCount).toBe(3);
  });

  it('counts distinct pets over consultations finalized inside the IST day (RPT-01)', async () => {
    // Two consultations for the same pet today count once.
    await createTestConsultation(clinicAId, petAId, vetAId, {
      status: 'finalized',
      finalizedAt: oneAmIst(),
    });
    await createTestConsultation(clinicAId, petAId, vetAId, {
      status: 'finalized',
      finalizedAt: new Date(),
    });
    // A second pet adds one.
    await createTestConsultation(clinicAId, petA2Id, vetAId, {
      status: 'finalized',
      finalizedAt: new Date(),
    });

    const response = await getSummary(frontDeskToken);

    expect(response.body.data.patientsSeenToday).toBe(2);
  });

  it('excludes yesterday-evening and still-draft consultations from patients seen today', async () => {
    await createTestConsultation(clinicAId, petAId, vetAId, {
      status: 'finalized',
      finalizedAt: elevenPmIstYesterday(),
    });
    // Started but not finalized: the vet is mid-consultation, not "seen".
    await createTestConsultation(clinicAId, petA2Id, vetAId, {
      status: 'draft',
      finalizedAt: null,
    });

    const response = await getSummary(frontDeskToken);

    expect(response.body.data.patientsSeenToday).toBe(0);
  });

  it("never includes another clinic's payments, invoices or consultations", async () => {
    const invoiceB = await createTestInvoice(clinicBId, clinicBUserId, {
      status: 'OVERDUE',
      grandTotalPaise: 777000,
      balancePaise: 777000,
    });
    await createTestPayment(clinicBId, invoiceB.id, {
      amountPaise: 777000,
      status: 'captured',
      paidAt: new Date(),
    });
    await createTestConsultation(clinicBId, petBId, vetBId, {
      status: 'finalized',
      finalizedAt: new Date(),
    });

    const response = await getSummary(frontDeskToken);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      todayRevenuePaise: 0,
      unpaidTotalPaise: 0,
      overdueCount: 0,
      recentPaymentsCount: 0,
      patientsSeenToday: 0,
    });
  });

  it('surfaces a count of invoices flagged as billing exceptions (D-35, D-36)', async () => {
    // Without a count here, a flagged invoice is discoverable only by someone
    // who already knows to look for it: nothing else in the app surfaces
    // `exception_flag`, and a flagged invoice blocks further status changes.
    await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'PAID',
      grandTotalPaise: 50000,
    });
    const flagged = await createTestInvoice(clinicAId, frontDeskUserId, {
      status: 'VOIDED',
      grandTotalPaise: 50000,
    });
    const { prisma } = await import('../helpers/factories.js');
    await prisma.invoice.update({
      where: { id: flagged.id },
      data: { exceptionFlag: 'payment_after_void', exceptionDetectedAt: new Date() },
    });

    const response = await getSummary(frontDeskToken);

    expect(response.body.data.billingExceptionCount).toBe(1);
  });
});
