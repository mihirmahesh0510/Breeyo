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
import Redis from 'ioredis';

let app: FastifyInstance;
let redis: Redis;

beforeAll(async () => {
  app = await buildTestApp();
  redis = app.redis;
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

async function createVerifiedUserWithClinic(phoneOverride?: string) {
  const user = await createTestUser({
    isEmailVerified: true,
    ...(phoneOverride ? { phone: phoneOverride } : {}),
  });
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  return { user, clinic };
}

describe('POST /api/v1/auth/otp/request', () => {
  beforeEach(async () => {
    await cleanupTestData();
    // Clear OTP-related Redis keys
    const keys = await redis.keys('otp:*');
    const rateKeys = await redis.keys('otp_rate:*');
    if (keys.length > 0) await redis.del(...keys);
    if (rateKeys.length > 0) await redis.del(...rateKeys);
  });

  it('should return 200 and store OTP in Redis', async () => {
    const phone = '+919876543210';

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.sent).toBe(true);

    // Verify OTP is stored in Redis
    const storedOtp = await redis.get(`otp:${phone}`);
    expect(storedOtp).toBeDefined();
    expect(storedOtp).toHaveLength(6);
  });

  it('should return 429 after 3 OTP requests in 5 minutes', async () => {
    const phone = '+919876543211';

    // Send 3 requests (should succeed)
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/request',
        payload: { phone },
      });
      expect(response.statusCode).toBe(200);
    }

    // 4th request should be rate limited
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone },
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.code).toBe('OTP_RATE_LIMITED');
  });
});

describe('POST /api/v1/auth/otp/verify', () => {
  beforeEach(async () => {
    await cleanupTestData();
    const keys = await redis.keys('otp:*');
    const rateKeys = await redis.keys('otp_rate:*');
    if (keys.length > 0) await redis.del(...keys);
    if (rateKeys.length > 0) await redis.del(...rateKeys);
  });

  it('should return 200 with tokens on correct OTP', async () => {
    const phone = '+919876543212';
    const { user, clinic } = await createVerifiedUserWithClinic(phone);

    // Store OTP manually
    await redis.set(`otp:${phone}`, '123456', 'EX', 300);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone, otp: '123456' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.expiresIn).toBe(900);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.clinic.id).toBe(clinic.id);
  });

  it('should return 401 with OTP_INVALID on wrong OTP', async () => {
    const phone = '+919876543213';
    await createVerifiedUserWithClinic(phone);

    // Store OTP manually
    await redis.set(`otp:${phone}`, '123456', 'EX', 300);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone, otp: '999999' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('OTP_INVALID');
  });

  it('should return 401 with OTP_EXPIRED when no OTP stored', async () => {
    const phone = '+919876543214';
    await createVerifiedUserWithClinic(phone);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone, otp: '123456' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('OTP_EXPIRED');
  });

  it('should set isPhoneVerified=true on first OTP login', async () => {
    const phone = '+919876543215';
    const { user } = await createVerifiedUserWithClinic(phone);

    // Verify phone is not verified initially
    const userBefore = await prisma.user.findUnique({ where: { id: user.id } });
    expect(userBefore!.isPhoneVerified).toBe(false);

    // Store OTP and verify
    await redis.set(`otp:${phone}`, '123456', 'EX', 300);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone, otp: '123456' },
    });

    expect(response.statusCode).toBe(200);

    // Verify phone is now verified
    const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
    expect(userAfter!.isPhoneVerified).toBe(true);
  });
});
