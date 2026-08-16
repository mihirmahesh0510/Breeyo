import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import { cleanupTestData, prisma } from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

const validSignupBody = {
  email: 'signup-test@example.com',
  password: 'SecureP@ss123',
  phone: '+919876543210',
  fullName: 'Dr. Test Vet',
  clinicName: 'Happy Paws Clinic',
  clinicAddress: '123 MG Road, Mumbai 400001',
  clinicPhone: '+919876543211',
};

describe('POST /api/v1/auth/signup', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should return 201 with user and clinic on valid signup', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: validSignupBody,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.user).toBeDefined();
    expect(body.data.user.email).toBe(validSignupBody.email.toLowerCase());
    expect(body.data.user.fullName).toBe(validSignupBody.fullName);
    expect(body.data.user.id).toBeDefined();
    expect(body.data.clinic).toBeDefined();
    expect(body.data.clinic.name).toBe(validSignupBody.clinicName);
    expect(body.data.clinic.id).toBeDefined();
  });

  it('should return 409 when signing up with a duplicate email', async () => {
    // First signup
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: validSignupBody,
    });

    // Second signup with same email
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        ...validSignupBody,
        phone: '+919876543299',
        clinicPhone: '+919876543298',
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it('should return 400 with invalid email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        ...validSignupBody,
        email: 'not-an-email',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should create ClinicMember with Admin role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: validSignupBody,
    });

    expect(response.statusCode).toBe(201);
    const { user, clinic } = response.json().data;

    const clinicMember = await prisma.clinicMember.findUnique({
      where: {
        userId_clinicId: {
          userId: user.id,
          clinicId: clinic.id,
        },
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    expect(clinicMember).not.toBeNull();
    expect(clinicMember!.isActive).toBe(true);
    expect(clinicMember!.roles).toHaveLength(1);
    expect(clinicMember!.roles[0].role.name).toBe('Admin');
  });

  it('should write SIGNUP audit event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: validSignupBody,
    });

    expect(response.statusCode).toBe(201);
    const { user } = response.json().data;

    const auditLog = await prisma.authAuditLog.findFirst({
      where: {
        userId: user.id,
        event: 'SIGNUP',
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog!.event).toBe('SIGNUP');
  });
});

describe('GET /api/v1/auth/verify-email', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should verify email with a valid token', async () => {
    // Create user with verification token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const user = await prisma.user.create({
      data: {
        email: 'verify-test@example.com',
        phone: '+919876543220',
        fullName: 'Verify User',
        passwordHash: 'dummy-hash',
        isEmailVerified: false,
        emailVerificationToken: tokenHash,
        emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/verify-email?token=${rawToken}`,
    });

    expect(response.statusCode).toBe(200);

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(updatedUser!.isEmailVerified).toBe(true);
    expect(updatedUser!.emailVerificationToken).toBeNull();
    expect(updatedUser!.emailVerificationExpiry).toBeNull();
  });

  it('should return 400 with expired token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    await prisma.user.create({
      data: {
        email: 'expired-verify@example.com',
        phone: '+919876543221',
        fullName: 'Expired Verify User',
        passwordHash: 'dummy-hash',
        isEmailVerified: false,
        emailVerificationToken: tokenHash,
        emailVerificationExpiry: new Date(Date.now() - 1000), // already expired
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/verify-email?token=${rawToken}`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 with invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/verify-email?token=invalid-token-that-does-not-exist',
    });

    expect(response.statusCode).toBe(400);
  });
});
