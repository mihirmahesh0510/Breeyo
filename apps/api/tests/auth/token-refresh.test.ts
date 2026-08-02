import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

const TEST_PASSWORD = 'SecureP@ss123';

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

async function loginAndGetTokens() {
  const user = await createTestUser({
    isEmailVerified: true,
    password: TEST_PASSWORD,
  });
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: user.email, password: TEST_PASSWORD },
  });

  const loginData = loginResponse.json().data;
  return { user, clinic, ...loginData };
}

describe('POST /api/v1/auth/token/refresh', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should return new token pair with valid refresh token', async () => {
    const { refreshToken } = await loginAndGetTokens();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.expiresIn).toBe(900);
    // New refresh token should be different from the original
    expect(body.data.refreshToken).not.toBe(refreshToken);
  });

  it('should return 401 for expired refresh token', async () => {
    const user = await createTestUser({
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });
    const clinic = await createTestClinic(user.id);
    await createTestClinicMember(user.id, clinic.id);

    // Create an expired refresh token directly in the database
    const crypto = await import('node:crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        familyId: crypto.randomUUID(),
        clinicId: clinic.id,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken: rawToken },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('SESSION_EXPIRED');
  });

  it('should return 401 for revoked refresh token', async () => {
    const { refreshToken } = await loginAndGetTokens();

    // Use the token once (should revoke the original)
    const firstRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken },
    });
    expect(firstRefresh.statusCode).toBe(200);

    // Try using the original token again (it's now revoked = token replay)
    const secondRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken },
    });

    expect(secondRefresh.statusCode).toBe(401);
    const body = secondRefresh.json();
    expect(body.error.code).toBe('TOKEN_REUSE_DETECTED');
  });

  it('should invalidate entire family on token replay', async () => {
    const { refreshToken } = await loginAndGetTokens();

    // Refresh once to get a new token (original is now revoked)
    const firstRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken },
    });
    expect(firstRefresh.statusCode).toBe(200);
    const newRefreshToken = firstRefresh.json().data.refreshToken;

    // Replay the original (old) token -- this should trigger family revocation
    const replayResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken },
    });
    expect(replayResponse.statusCode).toBe(401);
    expect(replayResponse.json().error.code).toBe('TOKEN_REUSE_DETECTED');

    // The new token should also be invalidated (entire family revoked)
    const thirdRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken: newRefreshToken },
    });
    expect(thirdRefresh.statusCode).toBe(401);
  });

  it('should support a chain of 3 consecutive refreshes', async () => {
    const { refreshToken } = await loginAndGetTokens();

    let currentRefreshToken = refreshToken;

    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/token/refresh',
        payload: { refreshToken: currentRefreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();

      // Use the new refresh token for next iteration
      currentRefreshToken = body.data.refreshToken;
    }
  });
});
