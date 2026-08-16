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
  /**
   * WHA-01 fix: the reminder-sweep scheduler's own dedicated queue —
   * deliberately NOT the same queue `outbound`'s worker consumes. The sweep
   * scheduler previously shared `outbound`, whose worker unconditionally
   * treats every job as `{ messageId }`; a scheduled sweep job landing there
   * was silently a no-op (`whatsAppMessage.findUnique` on an undefined id),
   * so `runReminderSweep` never ran in production even though it is fully
   * implemented and tested in isolation. One queue -> one dedicated worker ->
   * one job-processing concern, exactly like `outbound`/`simulator`.
   */
  reminderSweep: Queue;
  close(): Promise<void>;
}

export function createWhatsAppQueues(redis: Redis): WhatsAppQueues {
  const outbound = new Queue('whatsapp-outbound', { connection: redis });
  const simulator = new Queue('whatsapp-simulator', { connection: redis });
  const reminderSweep = new Queue('whatsapp-reminder-sweep', { connection: redis });

  return {
    outbound,
    simulator,
    reminderSweep,
    async close() {
      await outbound.close();
      await simulator.close();
      await reminderSweep.close();
    },
  };
}
