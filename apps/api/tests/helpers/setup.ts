import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env before anything else
config({ path: resolve(import.meta.dirname, '../../.env') });

// Global test setup
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.COOKIE_SECRET = 'test-cookie-secret';
  process.env.AWS_REGION = 'ap-south-1';

  // Phase 6 (D-29): `lib/crypto.ts` reads this lazily and throws when absent,
  // so any suite that seeds a clinic's Razorpay credentials needs it. Set only
  // as a fallback — a real `.env` value wins, so a developer pointing the suite
  // at a database seeded with their own key still decrypts successfully. A
  // per-run random key is correct for CI: the tests encrypt and decrypt within
  // the same process, and a hardcoded one would invite reuse outside tests.
  if (!process.env.BILLING_ENCRYPTION_KEY) {
    const { randomBytes } = await import('node:crypto');
    process.env.BILLING_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  }
});

afterAll(async () => {
  // Cleanup will be handled by individual test suites
});
