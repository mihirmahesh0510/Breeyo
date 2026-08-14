/**
 * WHA-05 — the two WhatsApp BullMQ queue wrappers (07-RESEARCH § Pattern 2).
 *
 * Copies `notification-bus.ts`'s shape: a plain `createX(deps): X` factory
 * returning `Queue` handles plus a `close()`. Job payloads carry ONLY row
 * ids (`{ messageId }`) — the row is the source of truth, the job is a
 * nudge (Pattern 2).
 *
 * Deliberately constructs NO `Worker` here. `notification.routes.ts:13-26`
 * creates its worker unconditionally at route-registration time, which means
 * that worker runs even under vitest; repeating that pattern for WhatsApp
 * would make simulator auto-replies and outbound sends fire mid-test.
 * Worker construction (with its test guard) belongs to 07-09, not this file.
 */

import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const WA_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export interface WhatsAppQueues {
  outbound: Queue;
  simulator: Queue;
  close(): Promise<void>;
}

export function createWhatsAppQueues(redis: Redis): WhatsAppQueues {
  const outbound = new Queue('whatsapp-outbound', { connection: redis });
  const simulator = new Queue('whatsapp-simulator', { connection: redis });

  return {
    outbound,
    simulator,
    async close() {
      await outbound.close();
      await simulator.close();
    },
  };
}
