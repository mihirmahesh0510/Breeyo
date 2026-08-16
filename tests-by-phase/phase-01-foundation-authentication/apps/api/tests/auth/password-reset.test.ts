import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import * as argon2 from 'argon2';
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

describe('POST /api/v1/auth/password-reset/request', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should return 200 with known email', async () => {
    // Create a user first
    await prisma.user.create({
      data: {
        email: 'reset-test@example.com',
        phone: '+919876543230',
        fullName: 'Reset User',
        passwordHash: await argon2.hash('OldPassword123!'),
        isEmailVerified: true,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'reset-test@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.message).toBeDefined();
  });

  it('should return 200 with unknown email (no leak)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'nonexistent@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.message).toBeDefined();
  });
});

describe('POST /api/v1/auth/password-reset/confirm', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should reset password with valid token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const oldPasswordHash = await argon2.hash('OldPassword123!');

    const user = await prisma.user.create({
      data: {
        email: 'reset-confirm@example.com',
        phone: '+919876543231',
        fullName: 'Reset Confirm User',
        passwordHash: oldPasswordHash,
        isEmailVerified: true,
        passwordResetToken: tokenHash,
        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const newPassword = 'NewSecureP@ss456';

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: rawToken, newPassword },
    });

    expect(response.statusCode).toBe(200);

    // Verify password was actually changed
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(updatedUser!.passwordResetToken).toBeNull();
    expect(updatedUser!.passwordResetExpiry).toBeNull();

    // Verify new password works
    const passwordValid = await argon2.verify(
      updatedUser!.passwordHash,
      newPassword,
    );
    expect(passwordValid).toBe(true);
  });

  it('should return 400 with expired token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    await prisma.user.create({
      data: {
        email: 'expired-reset@example.com',
        phone: '+919876543232',
        fullName: 'Expired Reset User',
        passwordHash: await argon2.hash('OldPassword123!'),
        isEmailVerified: true,
        passwordResetToken: tokenHash,
        passwordResetExpiry: new Date(Date.now() - 1000), // already expired
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: rawToken, newPassword: 'NewPassword123!' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 with already-used token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    await prisma.user.create({
      data: {
        email: 'used-reset@example.com',
        phone: '+919876543233',
        fullName: 'Used Reset User',
        passwordHash: await argon2.hash('OldPassword123!'),
        isEmailVerified: true,
        passwordResetToken: tokenHash,
        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // First reset should succeed
    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: rawToken, newPassword: 'NewPassword123!' },
    });
    expect(firstResponse.statusCode).toBe(200);

    // Second reset with same token should fail (token is cleared)
    const secondResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: rawToken, newPassword: 'AnotherPassword123!' },
    });
    expect(secondResponse.statusCode).toBe(400);
  });
});
