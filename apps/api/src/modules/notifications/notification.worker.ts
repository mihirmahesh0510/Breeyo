import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { NotificationEvent } from '@breeyo/types';
import { PushService } from './push.service.js';

export function createNotificationWorker(
  redis: Redis,
  prisma: PrismaClient,
): Worker {
  const pushService = new PushService();

  const worker = new Worker<NotificationEvent>(
    'notifications',
    async (job: Job<NotificationEvent>) => {
      const event = job.data;
      const sendPush = event.sendPush !== false; // default true

      for (const userId of event.recipientUserIds) {
        // 1. Create in-app notification record
        await prisma.notification.create({
          data: {
            recipientUserId: userId,
            clinicId: event.clinicId,
            type: event.type,
            module: event.module,
            title: event.title,
            body: event.body,
            data: (event.data ?? {}) as Prisma.InputJsonValue,
          },
        });

        // 2. Send push notification if enabled
        if (sendPush) {
          const deviceTokens = await prisma.deviceToken.findMany({
            where: { userId },
          });

          if (deviceTokens.length > 0) {
            const tokens = deviceTokens.map((dt) => dt.token);
            const result = await pushService.send(
              tokens,
              event.title,
              event.body,
              event.data,
            );

            // 3. Clean up invalid tokens
            if (result.invalidTokens.length > 0) {
              await prisma.deviceToken.deleteMany({
                where: {
                  userId,
                  token: { in: result.invalidTokens },
                },
              });
            }
          }
        }
      }
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  return worker;
}
