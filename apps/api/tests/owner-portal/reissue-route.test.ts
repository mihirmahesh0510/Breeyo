// Integration test for `POST /api/v1/owner-portal/:token/reissue` (OWN-04,
// D-67, D-82). Fills a Wave-0 gap noted in 09-VALIDATION.md: prior coverage
// for this route was unit-level only (mocked `PortalReissueService`/
// `MagicLinkService`). This exercises the real route end to end against the
// database and specifically guards the fix landed during plan 09-06's
// review: the route takes NO request body — the raw `:token` alone is
// sufficient once hash-validated, exactly like every other portal route. An
// earlier version required a client-supplied `expiredMagicLinkId` in the
// body that the EXPIRED session response could never legitimately carry,
// which made self-service reissue impossible on a link opened for the very
// first time after it had already expired.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestPetOwner,
  createTestPet,
  prisma,
} from '../helpers/factories.js';
import { hashMagicLinkToken } from '../../src/lib/magic-link-hash.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

async function createExpiredLink(clinicId: string, ownerId: string, petId: string, rawToken: string) {
  const issuedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
  const expiresAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // expired 1 day ago
  return prisma.ownerPortalMagicLink.create({
    data: {
      clinicId,
      ownerId,
      tokenHash: hashMagicLinkToken(rawToken),
      defaultTab: 'OVERVIEW',
      allowedPetIdsJson: [petId],
      allowedInvoiceIdsJson: [],
      issuedAt,
      expiresAt,
    },
  });
}

describe('POST /api/v1/owner-portal/:token/reissue — no request body required', () => {
  it('reissues a fresh link with no body and no Content-Type header (the real apps/web `apiClient` call shape)', async () => {
    const owner = await createTestUser();
    const clinic = await createTestClinic(owner.id);
    const petOwner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, petOwner.id);
    const rawToken = 'reissue-no-header-raw-token';
    await createExpiredLink(clinic.id, petOwner.id, pet.id, rawToken);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/owner-portal/${rawToken}/reissue`,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('REISSUED');
  });

  it('still 400s as NOT_EXPIRED for a currently-valid (non-expired) token, independent of any body', async () => {
    const owner = await createTestUser();
    const clinic = await createTestClinic(owner.id);
    const petOwner = await createTestPetOwner(clinic.id);
    const pet = await createTestPet(clinic.id, petOwner.id);
    const rawToken = 'reissue-not-expired-raw-token';
    const issuedAt = new Date();
    await prisma.ownerPortalMagicLink.create({
      data: {
        clinicId: clinic.id,
        ownerId: petOwner.id,
        tokenHash: hashMagicLinkToken(rawToken),
        defaultTab: 'OVERVIEW',
        allowedPetIdsJson: [pet.id],
        allowedInvoiceIdsJson: [],
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await app.inject({ method: 'POST', url: `/api/v1/owner-portal/${rawToken}/reissue` });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).status).toBe('NOT_EXPIRED');
  });

  it('403s as INVALID for a token that matches no link at all, independent of any body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/owner-portal/tampered-nonexistent-token/reissue`,
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).status).toBe('INVALID');
  });
});
