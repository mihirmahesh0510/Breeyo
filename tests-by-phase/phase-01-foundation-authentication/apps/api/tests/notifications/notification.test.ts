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
import { NotificationType, NotificationModule } from '@breeyo/types';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

describe('Notification API', () => {
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let clinicX: Awaited<ReturnType<typeof createTestClinic>>;
  let tokensA: Awaited<ReturnType<typeof createTestTokens>>;

  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let clinicY: Awaited<ReturnType<typeof createTestClinic>>;
  let tokensB: Awaited<ReturnType<typeof createTestTokens>>;

  beforeEach(async () => {
    await cleanupTestData();

    userA = await createTestUser({ fullName: 'User A' });
    clinicX = await createTestClinic(userA.id, { name: 'Clinic X' });
    await createTestClinicMember(userA.id, clinicX.id);
    tokensA = await createTestTokens(app, userA.id, clinicX.id);

    userB = await createTestUser({ fullName: 'User B' });
    clinicY = await createTestClinic(userB.id, { name: 'Clinic Y' });
    await createTestClinicMember(userB.id, clinicY.id);
    tokensB = await createTestTokens(app, userB.id, clinicY.id);
  });

  // ---- Device Token Registration ----

  describe('POST /api/v1/notifications/device-token', () => {
    it('should register a device token and return 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/device-token',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
        payload: {
          token: 'ExponentPushToken[abc123]',
          platform: 'ios',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.token).toBe('ExponentPushToken[abc123]');
      expect(body.data.platform).toBe('ios');
    });

    it('should return 200 for duplicate device token (idempotent)', async () => {
      // Register first time
      await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/device-token',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
        payload: {
          token: 'ExponentPushToken[dup123]',
          platform: 'android',
        },
      });

      // Register again
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/device-token',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
        payload: {
          token: 'ExponentPushToken[dup123]',
          platform: 'android',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.token).toBe('ExponentPushToken[dup123]');
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/device-token',
        payload: {
          token: 'ExponentPushToken[noauth]',
          platform: 'ios',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ---- Device Token Removal ----

  describe('DELETE /api/v1/notifications/device-token', () => {
    it('should remove a device token and return 200', async () => {
      // First register
      await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/device-token',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
        payload: {
          token: 'ExponentPushToken[toremove]',
          platform: 'ios',
        },
      });

      // Then remove
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/notifications/device-token',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
        payload: {
          token: 'ExponentPushToken[toremove]',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify it's gone
      const remaining = await prisma.deviceToken.findFirst({
        where: { userId: userA.id, token: 'ExponentPushToken[toremove]' },
      });
      expect(remaining).toBeNull();
    });
  });

  // ---- Notification Listing ----

  describe('GET /api/v1/notifications', () => {
    it('should return empty list initially', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('should return notifications with pagination', async () => {
      // Create 25 notifications
      for (let i = 0; i < 25; i++) {
        await prisma.notification.create({
          data: {
            recipientUserId: userA.id,
            clinicId: clinicX.id,
            type: NotificationType.LOW_STOCK,
            module: NotificationModule.INVENTORY,
            title: `Notification ${i}`,
            body: `Body ${i}`,
          },
        });
      }

      // Page 1 (default 20 per page)
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      expect(response1.statusCode).toBe(200);
      const body1 = response1.json();
      expect(body1.data).toHaveLength(20);
      expect(body1.pagination.total).toBe(25);
      expect(body1.pagination.page).toBe(1);
      expect(body1.pagination.pageSize).toBe(20);
      expect(body1.pagination.totalPages).toBe(2);

      // Page 2
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications?page=2',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      const body2 = response2.json();
      expect(body2.data).toHaveLength(5);
      expect(body2.pagination.page).toBe(2);
    });

    it('should filter by unreadOnly=true', async () => {
      // Create 3 notifications, mark 1 as read
      const n1 = await prisma.notification.create({
        data: {
          recipientUserId: userA.id,
          clinicId: clinicX.id,
          type: NotificationType.SYSTEM,
          module: NotificationModule.SYSTEM,
          title: 'Read Notification',
          body: 'Already read',
          isRead: true,
        },
      });

      await prisma.notification.create({
        data: {
          recipientUserId: userA.id,
          clinicId: clinicX.id,
          type: NotificationType.SYSTEM,
          module: NotificationModule.SYSTEM,
          title: 'Unread 1',
          body: 'Not read yet',
        },
      });

      await prisma.notification.create({
        data: {
          recipientUserId: userA.id,
          clinicId: clinicX.id,
          type: NotificationType.SYSTEM,
          module: NotificationModule.SYSTEM,
          title: 'Unread 2',
          body: 'Also not read',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications?unreadOnly=true',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.every((n: any) => !n.isRead)).toBe(true);
    });
  });

  // ---- Unread Count ----

  describe('GET /api/v1/notifications/unread-count', () => {
    it('should return correct unread count', async () => {
      await prisma.notification.createMany({
        data: [
          {
            recipientUserId: userA.id,
            clinicId: clinicX.id,
            type: NotificationType.SYSTEM,
            module: NotificationModule.SYSTEM,
            title: 'N1',
            body: 'B1',
            isRead: false,
          },
          {
            recipientUserId: userA.id,
            clinicId: clinicX.id,
            type: NotificationType.SYSTEM,
            module: NotificationModule.SYSTEM,
            title: 'N2',
            body: 'B2',
            isRead: false,
          },
          {
            recipientUserId: userA.id,
            clinicId: clinicX.id,
            type: NotificationType.SYSTEM,
            module: NotificationModule.SYSTEM,
            title: 'N3',
            body: 'B3',
            isRead: true,
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/unread-count',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.count).toBe(2);
    });
  });

  // ---- Mark Read ----

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const notification = await prisma.notification.create({
        data: {
          recipientUserId: userA.id,
          clinicId: clinicX.id,
          type: NotificationType.LOW_STOCK,
          module: NotificationModule.INVENTORY,
          title: 'Low Stock',
          body: 'Item X is low',
        },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${notification.id}/read`,
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.isRead).toBe(true);

      // Verify in DB
      const updated = await prisma.notification.findUnique({
        where: { id: notification.id },
      });
      expect(updated?.isRead).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/notifications/00000000-0000-0000-0000-000000000000/read',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ---- Mark All Read ----

  describe('PATCH /api/v1/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      await prisma.notification.createMany({
        data: [
          {
            recipientUserId: userA.id,
            clinicId: clinicX.id,
            type: NotificationType.SYSTEM,
            module: NotificationModule.SYSTEM,
            title: 'Unread 1',
            body: 'Body',
          },
          {
            recipientUserId: userA.id,
            clinicId: clinicX.id,
            type: NotificationType.SYSTEM,
            module: NotificationModule.SYSTEM,
            title: 'Unread 2',
            body: 'Body',
          },
        ],
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/notifications/read-all',
        headers: { authorization: `Bearer ${tokensA.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.count).toBe(2);

      // Verify all are read
      const unread = await prisma.notification.count({
        where: {
          recipientUserId: userA.id,
          clinicId: clinicX.id,
          isRead: false,
        },
      });
      expect(unread).toBe(0);
    });
  });

  // ---- Clinic Isolation ----

  describe('Clinic Isolation', () => {
    it('should not allow User B to see Clinic X notifications', async () => {
      // Create notification for user A in clinic X
      await prisma.notification.create({
        data: {
          recipientUserId: userA.id,
          clinicId: clinicX.id,
          type: NotificationType.SYSTEM,
          module: NotificationModule.SYSTEM,
          title: 'Private to Clinic X',
          body: 'Should not be visible to User B',
        },
      });

      // User B tries to list notifications (they are in clinic Y)
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { authorization: `Bearer ${tokensB.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // User B should see no notifications (clinic Y has none)
      expect(body.data).toHaveLength(0);
    });
  });

  // ---- NotificationBus ----

  describe('NotificationBus', () => {
    it('should enqueue a job via emit()', async () => {
      // Dynamic import to avoid issues if the module doesn't exist yet
      const { createNotificationBus } = await import(
        '../../src/modules/notifications/notification-bus.js'
      );

      const bus = createNotificationBus(app.redis);

      await bus.emit({
        type: NotificationType.LOW_STOCK,
        module: NotificationModule.INVENTORY,
        clinicId: clinicX.id,
        recipientUserIds: [userA.id],
        title: 'Low Stock Alert',
        body: 'Item X is running low',
        sendPush: true,
      });

      // Give BullMQ a moment to enqueue
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check that a job was added to the queue
      const { Queue } = await import('bullmq');
      const queue = new Queue('notifications', { connection: app.redis });
      const jobs = await queue.getJobs(['waiting', 'active', 'completed']);
      const matchingJob = jobs.find(
        (j) => j.data?.title === 'Low Stock Alert',
      );

      expect(matchingJob).toBeDefined();
      expect(matchingJob?.data.type).toBe(NotificationType.LOW_STOCK);
      expect(matchingJob?.data.recipientUserIds).toContain(userA.id);

      // Cleanup
      await queue.obliterate({ force: true });
      await queue.close();
    });
  });
});
