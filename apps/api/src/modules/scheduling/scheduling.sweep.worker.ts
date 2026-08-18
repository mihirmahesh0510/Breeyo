/**
 * SCH-02, SCH-05, D-08/D-09/D-27: the single Redis-coordinated BullMQ sweep
 * that drives the three scheduling passes -- turning due appointments into
 * EXPECTED queue entries, flipping abandoned ones to NO_SHOW after the grace
 * window, and firing the "starting soon" staff push. RESEARCH § Architecture
 * Patterns Pattern 2 is explicit that one `upsertJobScheduler` job running
 * every 5 minutes IST over Postgres-owned state is correct here, and that
 * per-appointment BullMQ delayed jobs are not: the booking horizon is up to
 * 90 days out and this project's Redis runs `allkeys-lru` eviction, so a
 * long-delay job can be silently dropped (RESEARCH anti-pattern A1). Never
 * use `queue.add(..., { delay })` in this file.
 *
 * The in-process cron library `apps/api/src/jobs/midnight-archive.ts` uses
 * for its own transport is equally wrong here: `infra/aws/` deploys multiple
 * ECS tasks, and an in-process timer fires once PER PROCESS, not once
 * cluster-wide.
 * `upsertJobScheduler` is Redis-coordinated and fires exactly once regardless
 * of how many tasks are running (RESEARCH Pitfall 1).
 *
 * `runSchedulingSweep` is exported as a plain function specifically so every
 * test can call it directly with an explicit `now` and no live worker
 * (RESEARCH Pitfall 4). `registerSchedulingSweep` always constructs the
 * `Queue` (tests need to inspect/enqueue against it) but constructs the
 * `Worker` ONLY when `NODE_ENV !== 'test'` -- `notification.routes.ts`'s
 * unconditional `createNotificationWorker` call is the exact anti-pattern
 * (RESEARCH anti-pattern A5) this guard exists to avoid: `buildTestApp()`
 * registers every route/module, so an unconditional worker would fire mid-
 * `vitest`-run and mutate fixtures out from under a running test.
 */
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { STARTING_SOON_LEAD_MINUTES, SCHEDULING_SWEEP_CRON, SCHEDULING_TIMEZONE } from '@breeyo/types';
import type { QueueHandoffService, HandoffPassResult, NoShowPassResult } from './queue-handoff.service.js';
import type { PushTriggerService } from './push-trigger.service.js';
import type { AppointmentRepository } from './appointment.repository.js';

export const SCHEDULING_SWEEP_QUEUE = 'scheduling-sweep';

export interface SchedulingSweepDeps {
  handoff: QueueHandoffService;
  pushTriggers: PushTriggerService;
  appointments: AppointmentRepository;
}

export interface SchedulingSweepResult {
  handoff: HandoffPassResult;
  noShow: NoShowPassResult;
  startingSoon: { notified: number };
  errors: Array<{ pass: 'handoff' | 'noShow' | 'startingSoon'; error: unknown }>;
}

const EMPTY_HANDOFF: HandoffPassResult = { appointmentsProcessed: 0, entriesCreated: 0 };
const EMPTY_NO_SHOW: NoShowPassResult = { entriesFlipped: 0, appointmentsFlipped: 0 };

/**
 * Runs the three sweep passes in order, each wrapped in its own try/catch
 * that logs and records the failure in the result rather than aborting the
 * sweep -- matching `midnight-archive.ts`'s error-isolation shape, and
 * required so a bug in (say) the starting-soon push never blocks the
 * no-show flip that must still run every 5 minutes.
 */
export async function runSchedulingSweep(
  deps: SchedulingSweepDeps,
  now: Date = new Date(),
): Promise<SchedulingSweepResult> {
  const errors: SchedulingSweepResult['errors'] = [];

  let handoffResult = EMPTY_HANDOFF;
  try {
    // Pass 1 (SCH-02, D-08): due appointments -> EXPECTED queue entries.
    handoffResult = await deps.handoff.createExpectedEntriesForDueAppointments(now);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Scheduling sweep: handoff pass failed', error);
    errors.push({ pass: 'handoff', error });
  }

  let noShowResult = EMPTY_NO_SHOW;
  try {
    // Pass 2 (D-09): abandoned EXPECTED entries -> NO_SHOW.
    noShowResult = await deps.handoff.autoFlipExpiredExpected(now);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Scheduling sweep: no-show pass failed', error);
    errors.push({ pass: 'noShow', error });
  }

  let notified = 0;
  try {
    // Pass 3 (D-27 trigger 1): appointments starting soon -> staff push.
    const from = now;
    const to = new Date(now.getTime() + STARTING_SOON_LEAD_MINUTES * 60000);
    const dueSoon = await deps.appointments.findStartingSoon(from, to, 200);
    const clinicIdByAppointmentId = new Map(dueSoon.map((appointment) => [appointment.id, appointment.clinicId]));
    await deps.pushTriggers.notifyUpcomingAppointments(from, to, dueSoon, (appointmentId) =>
      deps.appointments.markStartingSoonNotified(clinicIdByAppointmentId.get(appointmentId)!, appointmentId, now),
    );
    notified = dueSoon.length;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Scheduling sweep: starting-soon pass failed', error);
    errors.push({ pass: 'startingSoon', error });
  }

  return {
    handoff: handoffResult,
    noShow: noShowResult,
    startingSoon: { notified },
    errors,
  };
}

/**
 * Registers the Redis-coordinated recurring sweep. Always constructs the
 * `Queue` (tests need it to inspect/enqueue); constructs the `Worker` only
 * outside `vitest`. The caller (plan 08-11's `app.ts`/module wiring) should
 * attach an `onClose` hook that closes both, mirroring
 * `notification.routes.ts`'s own `onClose` cleanup.
 */
export function registerSchedulingSweep(
  redis: Redis,
  deps: SchedulingSweepDeps,
): { queue: Queue; worker: Worker | null } {
  const queue = new Queue(SCHEDULING_SWEEP_QUEUE, { connection: redis });

  // Fire-and-forget is intentional: `upsertJobScheduler` resolves once the
  // Redis-side scheduler state is written, which does not need to block the
  // caller's own startup sequence. Any failure surfaces on the returned
  // promise if a caller chooses to await it in the future; today's callers
  // (plan 08-11) do not need to.
  void queue.upsertJobScheduler(
    SCHEDULING_SWEEP_QUEUE,
    { pattern: SCHEDULING_SWEEP_CRON, tz: SCHEDULING_TIMEZONE },
    { name: 'sweep', data: {} },
  );

  // RESEARCH Pitfall 4 / anti-pattern A5: `buildTestApp()` registers every
  // module, so an unconditional `Worker` here would fire mid-vitest-run and
  // mutate fixtures a running test still expects untouched.
  const worker =
    process.env.NODE_ENV !== 'test'
      ? new Worker(
          SCHEDULING_SWEEP_QUEUE,
          async () => {
            await runSchedulingSweep(deps);
          },
          { connection: redis, concurrency: 1 },
        )
      : null;

  return { queue, worker };
}
