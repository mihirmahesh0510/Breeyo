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

describe('WhatsApp Invoice Delivery (WHA-02)', () => {
  it.todo(
    'invoice_delivery sends with contextType INVOICE and contextId and no FK to a nonexistent Invoice, link-only (WHA-02, D-18, Pitfall 8)',
  );
});
