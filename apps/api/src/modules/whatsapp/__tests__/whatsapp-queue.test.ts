import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * WHA-01 fix — `createWhatsAppQueues` must construct a THIRD, dedicated
 * queue for the reminder-sweep scheduler, not share `outbound`. Before this
 * fix, `registerReminderSweep` attached its `upsertJobScheduler` call to
 * `queues.outbound` — the exact queue `createOutboundWorker`'s `Worker`
 * consumes, and that worker's `processOutboundJob` unconditionally treats
 * every job as `{ messageId }`. A scheduled sweep job (`data: {}`) landing on
 * `whatsapp-outbound` was therefore a silent no-op forever: `runReminderSweep`
 * never ran in production.
 *
 * `bullmq`'s `Queue` is mocked (matching `outbound.worker.test.ts`'s style
 * for `Worker`) so this suite asserts queue construction/closing without a
 * live Redis connection.
 */

vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return {
    ...actual,
    Queue: vi.fn().mockImplementation((name: string) => ({
      name,
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

const { Queue } = await import('bullmq');
const { createWhatsAppQueues } = await import('../whatsapp-queue.js');

describe('createWhatsAppQueues', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('constructs a dedicated whatsapp-reminder-sweep queue alongside outbound and simulator', () => {
    const redis = {} as any;

    const queues = createWhatsAppQueues(redis);

    expect(Queue).toHaveBeenCalledWith('whatsapp-outbound', { connection: redis });
    expect(Queue).toHaveBeenCalledWith('whatsapp-simulator', { connection: redis });
    expect(Queue).toHaveBeenCalledWith('whatsapp-reminder-sweep', { connection: redis });
    expect(queues.reminderSweep).toBeDefined();
    // The critical property this whole fix depends on: the sweep scheduler's
    // queue must NOT be the same object as the outbound worker's queue.
    expect(queues.reminderSweep).not.toBe(queues.outbound);
  });

  it('close() closes all three queues, including the new reminderSweep queue', async () => {
    const redis = {} as any;
    const queues = createWhatsAppQueues(redis);

    await queues.close();

    expect((queues.outbound as any).close).toHaveBeenCalledTimes(1);
    expect((queues.simulator as any).close).toHaveBeenCalledTimes(1);
    expect((queues.reminderSweep as any).close).toHaveBeenCalledTimes(1);
  });
});
