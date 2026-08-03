import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as argon2 from 'argon2';
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

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

const TEST_PASSWORD = 'SecureP@ss123';

async function createVerifiedUserWithClinic(overrides: Record<string, unknown> = {}) {
  const user = await createTestUser({
    isEmailVerified: true,
    password: TEST_PASSWORD,
    ...overrides,
  });
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  return { user, clinic };
}

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should return 200 with tokens and user/clinic data on valid login', async () => {
    const { user, clinic } = await createVerifiedUserWithClinic();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.expiresIn).toBe(900);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.email).toBe(user.email);
    expect(body.data.user.fullName).toBe(user.fullName);
    expect(body.data.clinic.id).toBe(clinic.id);
    expect(body.data.clinic.name).toBe(clinic.name);
  });

  it('should return 401 with INVALID_CREDENTIALS on wrong password', async () => {
    const { user } = await createVerifiedUserWithClinic();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'WrongPassword123!' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 401 with INVALID_CREDENTIALS for non-existent user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nonexistent@example.com', password: 'SomePass123!' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 401 with EMAIL_NOT_VERIFIED for unverified email', async () => {
    const user = await createTestUser({
      isEmailVerified: false,
      password: TEST_PASSWORD,
    });
    const clinic = await createTestClinic(user.id);
    await createTestClinicMember(user.id, clinic.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('should return 401 with ACCOUNT_DEACTIVATED for user with no active memberships', async () => {
    const user = await createTestUser({
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });
    // Create clinic but no membership
    await createTestClinic(user.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('should return 400 with CLINIC_SELECTION_REQUIRED for multi-clinic user without clinicId', async () => {
    const user = await createTestUser({
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });

    const clinic1 = await createTestClinic(user.id, { name: 'Clinic Alpha' });
    const clinic2 = await createTestClinic(user.id, { name: 'Clinic Beta' });

    await createTestClinicMember(user.id, clinic1.id);
    await createTestClinicMember(user.id, clinic2.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('CLINIC_SELECTION_REQUIRED');
    expect(body.error.clinics).toBeDefined();
    expect(body.error.clinics).toHaveLength(2);
  });

  it('should return 200 for multi-clinic user with valid clinicId', async () => {
    const user = await createTestUser({
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });

    const clinic1 = await createTestClinic(user.id, { name: 'Clinic Alpha' });
    const clinic2 = await createTestClinic(user.id, { name: 'Clinic Beta' });

    await createTestClinicMember(user.id, clinic1.id);
    await createTestClinicMember(user.id, clinic2.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: user.email,
        password: TEST_PASSWORD,
        clinicId: clinic2.id,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.clinic.id).toBe(clinic2.id);
    expect(body.data.clinic.name).toBe('Clinic Beta');
  });

  it('should write LOGIN_SUCCESS audit event on successful login', async () => {
    const { user } = await createVerifiedUserWithClinic();

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: TEST_PASSWORD },
    });

    const auditLog = await prisma.authAuditLog.findFirst({
      where: { userId: user.id, event: 'LOGIN_SUCCESS' },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog!.event).toBe('LOGIN_SUCCESS');
  });

  it('should write LOGIN_FAILED audit event on failed login', async () => {
    const { user } = await createVerifiedUserWithClinic();

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'WrongPassword' },
    });

    const auditLog = await prisma.authAuditLog.findFirst({
      where: { userId: user.id, event: 'LOGIN_FAILED' },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog!.event).toBe('LOGIN_FAILED');
  });
});
