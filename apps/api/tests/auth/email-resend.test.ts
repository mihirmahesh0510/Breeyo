import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
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

describe('POST /api/v1/auth/verify-email/resend', () => {
  beforeEach(async () => {
    await cleanupTestData();
    // Clear any rate-limit keys
    const keys = await app.redis.keys('email_resend:*');
    if (keys.length > 0) {
      await app.redis.del(...keys);
    }
  });

  it('should return 200 with unverified email and update verification token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await createTestUser({
      email: 'resend-test@example.com',
      isEmailVerified: false,
    });

    // Set initial verification token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: tokenHash,
        emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email/resend',
      payload: { email: 'resend-test@example.com' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.message).toBeDefined();

    // Verify that the token was regenerated (should differ from original)
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(updatedUser!.emailVerificationToken).not.toBe(tokenHash);
    expect(updatedUser!.emailVerificationExpiry).not.toBeNull();
  });

  it('should return 200 with unknown email (no information leak)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email/resend',
      payload: { email: 'does-not-exist@example.com' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.message).toBeDefined();
  });

  it('should return 200 with "already verified" message for verified email', async () => {
    await createTestUser({
      email: 'already-verified@example.com',
      isEmailVerified: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email/resend',
      payload: { email: 'already-verified@example.com' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.message).toContain('already verified');
  });

  it('should return 429 after exceeding rate limit (4th request in 1 hour)', async () => {
    await createTestUser({
      email: 'rate-limit@example.com',
      isEmailVerified: false,
    });

    // Send 3 requests (all should succeed)
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email/resend',
        payload: { email: 'rate-limit@example.com' },
      });
      expect(res.statusCode).toBe(200);
    }

    // 4th request should be rate limited
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email/resend',
      payload: { email: 'rate-limit@example.com' },
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
