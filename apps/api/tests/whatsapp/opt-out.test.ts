import { describe, it, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
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

/**
 * Creates a test user, clinic, and clinic member, then generates auth tokens.
 */
async function setupAuthenticatedUser() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

describe('WhatsApp Opt-Out (WHA-02/03)', () => {
  it.todo(
    'invoice_delivery and booking_confirmation send even when remindersOptedOut is true (WHA-02, D-10)',
  );

  it.todo(
    "reminder-category templates are blocked for all of that owner's pets when remindersOptedOut is true (WHA-02/03, D-10/D-11)",
  );
});
