import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
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

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

async function registerAndCheckIn(
  token: string,
  overrides: { isEmergency?: boolean; visitReason?: string } = {},
) {
  const mobile = `${6000000000 + Math.floor(Math.random() * 3999999999)}`;
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/v1/patients/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      owner: { mobile, name: 'Test Owner' },
      pet: { name: `Pet-${mobile.slice(-4)}`, species: 'DOG' },
    },
  });
  const { pet } = regRes.json().data;

  const checkInRes = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/check-in',
    headers: { authorization: `Bearer ${token}` },
    payload: { petId: pet.id, ...overrides },
  });
  return checkInRes.json().data;
}

describe('Midnight Queue Archive (D-23)', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('archives WAITING entries from previous day', async () => {
    const { accessToken, clinic } = await setupTestContext();
    const entry = await registerAndCheckIn(accessToken);

    // Backdate checkedInAt to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { checkedInAt: yesterday },
    });

    // Trigger archive (POST or cron simulation)
    const archiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/archive',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Verify entry is archived
    const archived = await prisma.queueEntry.findUnique({
      where: { id: entry.id },
    });
    expect(archived?.archivedAt).not.toBeNull();
  });

  it('archives DONE entries from previous day', async () => {
    const { accessToken, clinic } = await setupTestContext();
    const entry = await registerAndCheckIn(accessToken);

    // Transition to IN_CONSULT then DONE
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'IN_CONSULT' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'DONE' },
    });

    // Backdate to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { checkedInAt: yesterday },
    });

    const archiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/archive',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const archived = await prisma.queueEntry.findUnique({
      where: { id: entry.id },
    });
    expect(archived?.archivedAt).not.toBeNull();
  });

  it('archives NO_SHOW entries from previous day', async () => {
    const { accessToken } = await setupTestContext();
    const entry = await registerAndCheckIn(accessToken);

    // Transition to NO_SHOW
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'NO_SHOW' },
    });

    // Backdate to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { checkedInAt: yesterday },
    });

    const archiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/archive',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const archived = await prisma.queueEntry.findUnique({
      where: { id: entry.id },
    });
    expect(archived?.archivedAt).not.toBeNull();
  });

  it('preserves IN_CONSULT entries past midnight (D-39)', async () => {
    const { accessToken } = await setupTestContext();
    const entry = await registerAndCheckIn(accessToken);

    // Transition to IN_CONSULT
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'IN_CONSULT' },
    });

    // Backdate to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { checkedInAt: yesterday },
    });

    const archiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/archive',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // IN_CONSULT should NOT be archived
    const preserved = await prisma.queueEntry.findUnique({
      where: { id: entry.id },
    });
    expect(preserved?.archivedAt).toBeNull();
    expect(preserved?.status).toBe('IN_CONSULT');
  });

  it('does not archive entries from current day', async () => {
    const { accessToken } = await setupTestContext();
    const entry = await registerAndCheckIn(accessToken);

    // Do NOT backdate — entry is from today
    const archiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/archive',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const notArchived = await prisma.queueEntry.findUnique({
      where: { id: entry.id },
    });
    expect(notArchived?.archivedAt).toBeNull();
  });

  it('sets archivedAt timestamp on archived entries', async () => {
    const { accessToken } = await setupTestContext();
    const entry = await registerAndCheckIn(accessToken);

    // Backdate to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { checkedInAt: yesterday },
    });

    const beforeArchive = new Date();
    const archiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/archive',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const archived = await prisma.queueEntry.findUnique({
      where: { id: entry.id },
    });
    expect(archived?.archivedAt).not.toBeNull();
    expect(new Date(archived!.archivedAt!).getTime()).toBeGreaterThanOrEqual(
      beforeArchive.getTime() - 1000,
    );
  });
});
