import { beforeAll, afterAll } from 'vitest';

// Global test setup
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.COOKIE_SECRET = 'test-cookie-secret';
  process.env.AWS_REGION = 'ap-south-1';
});

afterAll(async () => {
  // Cleanup will be handled by individual test suites
});
