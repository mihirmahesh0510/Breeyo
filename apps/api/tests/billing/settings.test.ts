import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { VETERINARY_SAC } from '@breeyo/types';
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
import { encryptSecret } from '../../src/lib/crypto.js';
import { getRazorpayForClinic } from '../../src/modules/billing/razorpay.client.js';

/**
 * D-29 billing settings — the highest-sensitivity read surface in Phase 6.
 *
 * A live Razorpay `key_secret` is authority to move money out of a clinic's
 * account. `06-UI-SPEC.md` puts an input for it on the Billing Settings screen,
 * so the value is transmitted to and stored by this API, and every assertion
 * below exists to pin one of the four ways that goes wrong:
 *
 *  1. the secret comes back out of the API (T-06-75);
 *  2. it reaches the audit log (T-06-76);
 *  3. a non-Admin writes it (T-06-77); or
 *  4. a form that never received it silently clears it (T-06-79).
 *
 * The `razorpayWebhookToken` is treated with the same care. It is not a display
 * convenience: Razorpay sends no tenant identifier, so the token IS the
 * tenant-routing key for `POST /webhooks/razorpay/:webhookToken`. It is a
 * capability, and it is returned only to an Admin of the owning clinic.
 */

const PLAINTEXT_SECRET = 'rzp_test_secret_value_do_not_leak';
const CIPHERTEXT_PREFIX = 'v1.';
const VALID_GSTIN = '27AAPFU0939F1ZV';

let app: FastifyInstance;

let clinicAId: string;
let clinicBId: string;
let adminToken: string;
let frontDeskToken: string;
let clinicianToken: string;
let clinicBAdminToken: string;

beforeAll(async () => {
  app = await buildTestApp();
  // The settings service builds the webhook URL an Admin pastes into their
  // Razorpay dashboard from this base.
  process.env.PUBLIC_API_URL = 'https://api.breeyo.test';
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
  clinicBAdminToken = (await createTestTokens(app, clinicBUser.id, clinicB.id)).accessToken;
});

function getSettings(token: string) {
  return request(app.server)
    .get('/api/v1/billing/settings')
    .set('Authorization', `Bearer ${token}`);
}

function putSettings(token: string, body: Record<string, unknown>) {
  return request(app.server)
    .put('/api/v1/billing/settings')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('D-29 billing settings', () => {
  it('rejects an unauthenticated read', async () => {
    const response = await request(app.server).get('/api/v1/billing/settings');

    expect(response.status).toBe(401);
  });

  it('is Admin-only: Front Desk and Clinician are refused read and write', async () => {
    // Front Desk holds CREATE_INVOICES and MANAGE_PAYMENTS but not
    // MANAGE_CLINIC_SETTINGS. Configuring the gateway credentials is an owner
    // action, not a counter action (T-06-77).
    expect((await getSettings(frontDeskToken)).status).toBe(403);
    expect((await getSettings(clinicianToken)).status).toBe(403);
    expect((await putSettings(frontDeskToken, { defaultDueDays: 7 })).status).toBe(403);
    expect((await putSettings(clinicianToken, { defaultDueDays: 7 })).status).toBe(403);
  });

  it('returns presence booleans and never a secret, encrypted or decrypted', async () => {
    await prisma.clinic.update({
      where: { id: clinicAId },
      data: {
        razorpayKeyId: 'rzp_test_keyid',
        razorpayKeySecretEnc: encryptSecret(PLAINTEXT_SECRET),
        razorpayWebhookSecretEnc: encryptSecret('whsec_value'),
      },
    });

    const response = await getSettings(adminToken);

    expect(response.status).toBe(200);
    expect(response.body.data.hasRazorpayKeySecret).toBe(true);
    expect(response.body.data.hasRazorpayWebhookSecret).toBe(true);
    expect(response.body.data.razorpayKeyId).toBe('rzp_test_keyid');

    // The whole body, not just the fields we thought to name: a ciphertext
    // column selected by accident anywhere in the chain shows up here.
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(PLAINTEXT_SECRET);
    expect(serialized).not.toContain(CIPHERTEXT_PREFIX);
    expect(serialized).not.toContain('whsec_value');
    expect(response.body.data.razorpayKeySecret).toBeUndefined();
    expect(response.body.data.razorpayKeySecretEnc).toBeUndefined();
    expect(response.body.data.razorpayWebhookSecretEnc).toBeUndefined();
  });

  it('flags a clinic that has not configured its Razorpay webhook', async () => {
    const response = await getSettings(adminToken);

    expect(response.status).toBe(200);
    // BIL-06 is silently broken for such a clinic: Razorpay has nowhere to
    // deliver to, and nothing else in the product would show a symptom.
    expect(response.body.data.webhookConfigured).toBe(false);
    expect(response.body.data.webhookUrl).toBeNull();
    expect(response.body.data.razorpayWebhookToken).toBeNull();
  });

  it('returns the full per-clinic webhook URL once a credential has been saved', async () => {
    await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
      razorpayWebhookSecret: 'whsec_value',
    });

    const response = await getSettings(adminToken);

    expect(response.body.data.webhookConfigured).toBe(true);
    const token = response.body.data.razorpayWebhookToken;
    expect(typeof token).toBe('string');
    expect(response.body.data.webhookUrl).toBe(
      `https://api.breeyo.test/api/v1/webhooks/razorpay/${token}`,
    );
  });

  it("never exposes another clinic's webhook token", async () => {
    await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
    });
    const clinicA = await prisma.clinic.findUnique({ where: { id: clinicAId } });
    expect(clinicA?.razorpayWebhookToken).toBeTruthy();

    // Clinic B's Admin reads their own settings and must see nothing of A's.
    const response = await getSettings(clinicBAdminToken);

    expect(response.status).toBe(200);
    expect(response.body.data.razorpayWebhookToken).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain(clinicA!.razorpayWebhookToken!);
  });

  it('refuses to enable GST without a GSTIN', async () => {
    const response = await putSettings(adminToken, { gstEnabled: true });

    expect(response.status).toBe(400);
    // Section 122: collecting tax without a registration is an offence.
    expect(response.body.error.message).toContain(
      'GST cannot be enabled without a valid GSTIN',
    );
  });

  it('derives the state code from the GSTIN when none is supplied', async () => {
    const response = await putSettings(adminToken, {
      gstEnabled: true,
      gstin: VALID_GSTIN,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.stateCode).toBe('27');
    expect(response.body.data.gstEnabled).toBe(true);
  });

  it('rejects a defaultGstRate outside the current slabs', async () => {
    const response = await putSettings(adminToken, { defaultGstRate: 12 });

    expect(response.status).toBe(400);
  });

  it('stores a submitted secret as ciphertext and never as plaintext', async () => {
    const response = await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
    });

    expect(response.status).toBe(200);

    const stored = await prisma.clinic.findUnique({ where: { id: clinicAId } });
    expect(stored?.razorpayKeySecretEnc?.startsWith(CIPHERTEXT_PREFIX)).toBe(true);
    expect(stored?.razorpayKeySecretEnc).not.toContain(PLAINTEXT_SECRET);

    // And the write response is presence-only, exactly like the read.
    expect(response.body.data.hasRazorpayKeySecret).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(PLAINTEXT_SECRET);
    expect(JSON.stringify(response.body)).not.toContain(CIPHERTEXT_PREFIX);
  });

  it('leaves a stored secret byte-identical when the field is absent from the submission', async () => {
    await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
    });
    const before = await prisma.clinic.findUnique({ where: { id: clinicAId } });

    // The mobile form cannot echo back a secret it never received, so a save of
    // any other field submits no secret at all. Treating that as "clear it"
    // would break every clinic's payments the first time an Admin edits their
    // invoice footer text (T-06-79).
    const response = await putSettings(adminToken, { invoiceFooterText: 'Thank you!' });

    expect(response.status).toBe(200);
    const after = await prisma.clinic.findUnique({ where: { id: clinicAId } });
    expect(after?.razorpayKeySecretEnc).toBe(before?.razorpayKeySecretEnc);
    expect(after?.invoiceFooterText).toBe('Thank you!');
  });

  it('invalidates the cached Razorpay SDK instance when only the secret rotates', async () => {
    await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
    });
    const first = await prisma.clinic.findUnique({ where: { id: clinicAId } });

    // Populate the module-level cache the payment path reads from.
    const cachedBefore = getRazorpayForClinic({
      id: clinicAId,
      razorpayKeyId: first!.razorpayKeyId,
      razorpayKeySecretEnc: first!.razorpayKeySecretEnc,
      razorpayTestMode: first!.razorpayTestMode,
    });
    expect(
      getRazorpayForClinic({
        id: clinicAId,
        razorpayKeyId: first!.razorpayKeyId,
        razorpayKeySecretEnc: first!.razorpayKeySecretEnc,
        razorpayTestMode: first!.razorpayTestMode,
      }),
    ).toBe(cachedBefore);

    // T-06-54: the merchant regenerates the SECRET and keeps the same key id.
    // The cache's fingerprint is the key id, so nothing about this rotation is
    // visible to it — without an explicit invalidation the cached instance goes
    // on signing with the revoked secret until the process restarts.
    await putSettings(adminToken, { razorpayKeySecret: 'rzp_test_rotated_secret' });
    const second = await prisma.clinic.findUnique({ where: { id: clinicAId } });
    expect(second!.razorpayKeyId).toBe(first!.razorpayKeyId);
    expect(second!.razorpayKeySecretEnc).not.toBe(first!.razorpayKeySecretEnc);

    const cachedAfter = getRazorpayForClinic({
      id: clinicAId,
      razorpayKeyId: second!.razorpayKeyId,
      razorpayKeySecretEnc: second!.razorpayKeySecretEnc,
      razorpayTestMode: second!.razorpayTestMode,
    });
    expect(cachedAfter).not.toBe(cachedBefore);
  });

  it('audits a credential change with changed-field booleans and no values', async () => {
    await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
      razorpayWebhookSecret: 'whsec_value',
    });

    const rows = await prisma.billingAuditLog.findMany({
      where: { clinicId: clinicAId, event: 'RAZORPAY_CREDENTIALS_UPDATED' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({
      keyIdChanged: true,
      keySecretChanged: true,
      webhookSecretChanged: true,
    });

    // Audit rows are long-lived by design, which makes them the worst possible
    // place for a credential to land (T-06-76, ASVS V7).
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(PLAINTEXT_SECRET);
    expect(serialized).not.toContain('whsec_value');
    expect(serialized).not.toContain(CIPHERTEXT_PREFIX);
  });

  it('audits a non-credential settings change separately', async () => {
    await putSettings(adminToken, { defaultDueDays: 14, invoiceFooterText: 'Terms apply' });

    const credentialRows = await prisma.billingAuditLog.findMany({
      where: { clinicId: clinicAId, event: 'RAZORPAY_CREDENTIALS_UPDATED' },
    });
    const settingsRows = await prisma.billingAuditLog.findMany({
      where: { clinicId: clinicAId, event: 'BILLING_SETTINGS_UPDATED' },
    });

    // No credential moved, so no credential event.
    expect(credentialRows).toHaveLength(0);
    expect(settingsRows).toHaveLength(1);
  });

  it('generates a high-entropy webhook token once and does not regenerate it', async () => {
    await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
    });
    const first = await prisma.clinic.findUnique({ where: { id: clinicAId } });
    const token = first!.razorpayWebhookToken!;

    // 32 random bytes in base64url is 43 characters. A guessable path token
    // would let an attacker aim forged deliveries at a specific clinic
    // (T-06-80); the HMAC still stops them, but the token must not be the weak
    // link.
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    // Rotating it silently would break a working webhook the Admin already
    // pasted into their Razorpay dashboard.
    await putSettings(adminToken, { razorpayKeySecret: 'rzp_test_rotated_secret' });
    const second = await prisma.clinic.findUnique({ where: { id: clinicAId } });
    expect(second!.razorpayWebhookToken).toBe(token);
  });

  it('rotates the webhook token only when explicitly asked', async () => {
    await putSettings(adminToken, {
      razorpayKeyId: 'rzp_test_keyid',
      razorpayKeySecret: PLAINTEXT_SECRET,
    });
    const before = await prisma.clinic.findUnique({ where: { id: clinicAId } });

    const response = await request(app.server)
      .post('/api/v1/billing/settings/webhook-token/rotate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(200);
    const after = await prisma.clinic.findUnique({ where: { id: clinicAId } });
    expect(after!.razorpayWebhookToken).not.toBe(before!.razorpayWebhookToken);
    expect(response.body.data.razorpayWebhookToken).toBe(after!.razorpayWebhookToken);
    // The Admin has to go and re-paste the new URL, so say so.
    expect(response.body.data.webhookUrl).toContain(after!.razorpayWebhookToken!);
  });

  it('refuses a webhook token rotation from a non-Admin', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/settings/webhook-token/rotate')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({});

    expect(response.status).toBe(403);
  });
});

/**
 * A1, resolved 2026-08-14 — the opt-in SAC correction.
 *
 * Clinics seeded before 2026-08-14 carry the `9993xx` SAC family on their
 * clinical service-catalog rows; the seed now writes `998351`. Nothing about
 * that is a tax defect — the engine reads `gstRateOverride` and `taxTreatment`
 * and never the SAC string — but the code is printed on a legal document, so
 * existing clinics are offered a correction.
 *
 * **The correction is opt-in, and these tests exist mainly to pin that.** A
 * clinic's catalog rows are its own data and an accountant may already have set
 * those codes by hand to match their filings. A migration that ran on deploy,
 * on login, or as a side effect of opening the settings screen would overwrite
 * that judgement invisibly. So the rewrite happens on one explicit Admin action
 * and on no other code path.
 */
describe('A1 opt-in SAC code correction', () => {
  const LEGACY_CONSULT = '999311';
  const LEGACY_SURGERY = '999313';
  const GROOMING_SAC = '998612';

  function updateSacCodes(token: string) {
    return request(app.server)
      .post('/api/v1/billing/settings/sac-codes/update')
      .set('Authorization', `Bearer ${token}`)
      .send({});
  }

  /** A clinic as the pre-2026-08-14 seed would have left it. */
  async function seedLegacyCatalog(clinicId: string) {
    await createTestServiceCatalogEntry(clinicId, {
      name: 'General Consultation',
      category: 'consultation',
      sacCode: LEGACY_CONSULT,
      gstRateOverride: 0,
    });
    await createTestServiceCatalogEntry(clinicId, {
      name: 'Minor Surgery',
      category: 'surgery',
      sacCode: LEGACY_SURGERY,
      gstRateOverride: 0,
    });
    await createTestServiceCatalogEntry(clinicId, {
      name: 'Grooming - Basic',
      category: 'grooming',
      sacCode: GROOMING_SAC,
      gstRateOverride: 18,
    });
  }

  function sacCodesFor(clinicId: string) {
    return prisma.serviceCatalog
      .findMany({ where: { clinicId }, orderBy: { name: 'asc' } })
      .then((rows) => rows.map((r) => `${r.name}=${r.sacCode}`));
  }

  it('reports how many rows still carry a legacy code, without changing any', async () => {
    await seedLegacyCatalog(clinicAId);

    const response = await getSettings(adminToken);

    expect(response.status).toBe(200);
    // Two clinical rows. The grooming row is not counted: 998612 is not a
    // correctable code (see below).
    expect(response.body.data.legacySacCodeCount).toBe(2);

    // Reading the settings screen must not be a migration trigger.
    expect(await sacCodesFor(clinicAId)).toEqual([
      `General Consultation=${LEGACY_CONSULT}`,
      `Grooming - Basic=${GROOMING_SAC}`,
      `Minor Surgery=${LEGACY_SURGERY}`,
    ]);
  });

  it('reports zero for a clinic seeded after the fix', async () => {
    await createTestServiceCatalogEntry(clinicAId, {
      name: 'General Consultation',
      sacCode: VETERINARY_SAC,
    });

    const response = await getSettings(adminToken);

    expect(response.body.data.legacySacCodeCount).toBe(0);
  });

  it('rewrites only the correctable clinical codes when explicitly invoked', async () => {
    await seedLegacyCatalog(clinicAId);

    const response = await updateSacCodes(adminToken);

    expect(response.status).toBe(200);
    expect(response.body.data.updated).toBe(2);
    expect(response.body.data.sacCode).toBe(VETERINARY_SAC);

    expect(await sacCodesFor(clinicAId)).toEqual([
      `General Consultation=${VETERINARY_SAC}`,
      // Grooming is not veterinary healthcare and Entry 46 does not reach it.
      // Its line is taxed at 18%, so stamping the nil-rated veterinary SAC on
      // it would be a worse document than the one being corrected.
      `Grooming - Basic=${GROOMING_SAC}`,
      `Minor Surgery=${VETERINARY_SAC}`,
    ]);
  });

  it('leaves a code an accountant already corrected by hand alone', async () => {
    // Neither the legacy family nor the target. Whatever this clinic's
    // accountant decided, the action must not have an opinion about it.
    await createTestServiceCatalogEntry(clinicAId, {
      name: 'Physiotherapy',
      sacCode: '999319',
    });
    await createTestServiceCatalogEntry(clinicAId, {
      name: 'General Consultation',
      sacCode: LEGACY_CONSULT,
    });

    const response = await updateSacCodes(adminToken);

    expect(response.body.data.updated).toBe(1);
    expect(await sacCodesFor(clinicAId)).toEqual([
      `General Consultation=${VETERINARY_SAC}`,
      'Physiotherapy=999319',
    ]);
  });

  it('is idempotent: a second invocation changes nothing', async () => {
    await seedLegacyCatalog(clinicAId);

    expect((await updateSacCodes(adminToken)).body.data.updated).toBe(2);

    const second = await updateSacCodes(adminToken);

    expect(second.status).toBe(200);
    expect(second.body.data.updated).toBe(0);
    expect(second.body.data.legacySacCodeCount).toBe(0);
  });

  it("never touches another clinic's catalog", async () => {
    await seedLegacyCatalog(clinicAId);
    await seedLegacyCatalog(clinicBId);

    await updateSacCodes(adminToken);

    // Clinic B never asked. This is the whole point of the decision: a clinic
    // that does not invoke the action keeps its data exactly as it was.
    expect(await sacCodesFor(clinicBId)).toEqual([
      `General Consultation=${LEGACY_CONSULT}`,
      `Grooming - Basic=${GROOMING_SAC}`,
      `Minor Surgery=${LEGACY_SURGERY}`,
    ]);
  });

  it('is Admin-only', async () => {
    await seedLegacyCatalog(clinicAId);

    expect((await updateSacCodes(frontDeskToken)).status).toBe(403);
    expect((await updateSacCodes(clinicianToken)).status).toBe(403);

    // Refused means refused: no partial write behind the 403.
    expect(await sacCodesFor(clinicAId)).toEqual([
      `General Consultation=${LEGACY_CONSULT}`,
      `Grooming - Basic=${GROOMING_SAC}`,
      `Minor Surgery=${LEGACY_SURGERY}`,
    ]);
  });

  it('rejects an unauthenticated invocation', async () => {
    const response = await request(app.server)
      .post('/api/v1/billing/settings/sac-codes/update')
      .send({});

    expect(response.status).toBe(401);
  });

  it('audits the correction with a count and no row contents', async () => {
    await seedLegacyCatalog(clinicAId);

    await updateSacCodes(adminToken);

    const rows = await prisma.billingAuditLog.findMany({
      where: { clinicId: clinicAId, event: 'SERVICE_SAC_CODES_UPDATED' },
    });

    // A rewrite of what is printed on a legal document is exactly the kind of
    // change that must be attributable six years later (Section 36 / D-32).
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({
      updated: 2,
      sacCode: VETERINARY_SAC,
    });
  });

  it('writes no audit row when there was nothing to correct', async () => {
    await createTestServiceCatalogEntry(clinicAId, { sacCode: VETERINARY_SAC });

    const response = await updateSacCodes(adminToken);

    expect(response.body.data.updated).toBe(0);
    const rows = await prisma.billingAuditLog.findMany({
      where: { clinicId: clinicAId, event: 'SERVICE_SAC_CODES_UPDATED' },
    });
    expect(rows).toHaveLength(0);
  });
});
