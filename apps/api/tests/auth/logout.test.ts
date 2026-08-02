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

describe('POST /api/v1/auth/logout', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should return 200 on successful logout', async () => {
    const { accessToken, refreshToken } = await loginAndGetTokens();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { refreshToken },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.message).toBe('Logged out successfully');
  });

  it('should prevent refresh token usage after logout', async () => {
    const { accessToken, refreshToken } = await loginAndGetTokens();

    // Logout
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { refreshToken },
    });
    expect(logoutResponse.statusCode).toBe(200);

    // Try to use the revoked refresh token
    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/token/refresh',
      payload: { refreshToken },
    });

    expect(refreshResponse.statusCode).toBe(401);
  });

  it('should write LOGOUT audit event', async () => {
    const { accessToken, refreshToken, user } = await loginAndGetTokens();

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { refreshToken },
    });

    const auditLog = await prisma.authAuditLog.findFirst({
      where: { userId: user.id, event: 'LOGOUT' },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog!.event).toBe('LOGOUT');
  });

  it('should return 401 without authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: 'some-token' },
    });

    expect(response.statusCode).toBe(401);
  });
});
