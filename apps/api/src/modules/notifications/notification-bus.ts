import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { NotificationEvent } from '@breeyo/types';

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export class NotificationBus {
  constructor(private queue: Queue) {}

  async emit(event: NotificationEvent): Promise<void> {
    await this.queue.add('send-notification', event, JOB_OPTIONS);
  }

  async emitBulk(events: NotificationEvent[]): Promise<void> {
    await this.queue.addBulk(
      events.map((e) => ({
        name: 'send-notification',
        data: e,
        opts: JOB_OPTIONS,
      })),
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createNotificationBus(redis: Redis): NotificationBus {
  const queue = new Queue('notifications', { connection: redis });
  return new NotificationBus(queue);
}
