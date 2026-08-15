import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerReminderSweep,
  runReminderSweep,
  createReminderSweepWorker,
  WA_REMINDER_SWEEP_JOB,
} from '../reminders/reminder-sweep.job.js';
import { WA_ESCALATION } from '@breeyo/types';

/**
 * WHA-01 / D-01 to D-04, Pitfalls 1 & 2 — mocked-dependency unit suite,
 * mirroring `outbound.worker.test.ts`'s style: every collaborator is a plain
 * object of `vi.fn()`s, so this suite exercises only the sweep's own
 * discover/upsert/dispatch/escalate/requeue orchestration, never a real
 * queue or database.
 */

// `bullmq`'s `Worker` is mocked (matching `outbound.worker.test.ts`'s exact
// style) so `createReminderSweepWorker`'s "otherwise" branch — and, crucially,
// the processor function it hands to `Worker` — can be asserted with no live
// Redis connection.
vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return { ...actual, Worker: vi.fn().mockImplementation(() => ({ close: vi.fn() })) };
});

const { Worker } = await import('bullmq');

const CLINIC_ID = 'clinic-1';
const OWNER_ID = 'owner-1';
const PET_ID = 'pet-1';

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    clinicId: CLINIC_ID,
    ownerId: OWNER_ID,
    petId: PET_ID,
    kind: 'FOLLOW_UP',
    touch: 'ADVANCE',
    sourceType: 'CONSULTATION',
    sourceId: 'consult-1',
    sourceLabel: null,
    dueDate: new Date('2026-08-15'),
    scheduledFor: new Date('2026-08-14'),
    state: 'PENDING',
    attemptCount: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    pet: { id: PET_ID, name: 'Rocky', owner: { id: OWNER_ID, name: 'Asha', mobile: '+919876543210' } },
    ...overrides,
  };
}

function createMockQueue() {
  return { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
}

function createDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const sourceRepo = {
    findFollowUpsDue: vi.fn().mockResolvedValue([]),
    findLatestVaccinationsDue: vi.fn().mockResolvedValue([]),
    findLatestDewormingDue: vi.fn().mockResolvedValue([]),
    findStrandedQueuedMessages: vi.fn().mockResolvedValue([]),
  };
  const taskRepo = {
    findByKey: vi.fn().mockResolvedValue(null),
    cancel: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const taskService = {
    upsertTasksForSource: vi.fn().mockResolvedValue(undefined),
    findDispatchable: vi.fn().mockResolvedValue([]),
    findEscalatable: vi.fn().mockResolvedValue([]),
    markSent: vi.fn().mockResolvedValue(undefined),
    cap: vi.fn().mockResolvedValue(undefined),
    isEscalationSuppressedBySibling: vi.fn().mockResolvedValue(false),
  };
  const whatsAppService = { sendTemplate: vi.fn().mockResolvedValue({ messageId: 'message-1' }) };
  const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    clinic: { findMany: vi.fn().mockResolvedValue([{ id: CLINIC_ID }]) },
  };

  return { sourceRepo, taskRepo, taskService, whatsAppService, outboundQueue, prisma, ...overrides };
}

describe('registerReminderSweep (Pitfall 2)', () => {
  it("calls upsertJobScheduler with id 'whatsapp-reminder-sweep', pattern '0 30 8 * * *' and tz 'Asia/Kolkata'", async () => {
    const queue = createMockQueue();

    await registerReminderSweep(queue as any);

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      WA_REMINDER_SWEEP_JOB,
      expect.objectContaining({ pattern: '0 30 8 * * *', tz: 'Asia/Kolkata' }),
      expect.objectContaining({ name: 'reminder-sweep' }),
    );
    expect(WA_REMINDER_SWEEP_JOB).toBe('whatsapp-reminder-sweep');
  });

  it('uses upsertJobScheduler, never queue.add with a repeat option', async () => {
    const queue = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined), add: vi.fn() };

    await registerReminderSweep(queue as any);

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('runReminderSweep — discover/upsert (D-01, D-02)', () => {
  it('discovers follow-ups for today and today+1, and vaccine/deworming for today and today+3', async () => {
    const deps = createDeps();

    await runReminderSweep(deps as any);

    const followUpDates = deps.sourceRepo.findFollowUpsDue.mock.calls[0][1];
    const vaccineDates = deps.sourceRepo.findLatestVaccinationsDue.mock.calls[0][1];
    const dewormingDates = deps.sourceRepo.findLatestDewormingDue.mock.calls[0][1];

    expect(followUpDates).toHaveLength(2);
    expect(vaccineDates).toHaveLength(2);
    expect(dewormingDates).toHaveLength(2);

    // today+1 and today+3 respectively (D-01 lead 1 day, D-02 lead 3 days).
    const spanDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
    expect(Math.abs(spanDays(followUpDates[0], followUpDates[1]))).toBe(1);
    expect(Math.abs(spanDays(vaccineDates[0], vaccineDates[1]))).toBe(3);
    expect(Math.abs(spanDays(dewormingDates[0], dewormingDates[1]))).toBe(3);
  });

  it('upserts tasks for every discovered source', async () => {
    const deps = createDeps();
    const source = {
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      kind: 'FOLLOW_UP',
      sourceType: 'CONSULTATION',
      sourceId: 'consult-1',
      sourceLabel: null,
      dueDate: new Date('2026-08-15'),
    };
    deps.sourceRepo.findFollowUpsDue.mockResolvedValue([source]);

    await runReminderSweep(deps as any);

    expect(deps.taskService.upsertTasksForSource).toHaveBeenCalledWith(CLINIC_ID, source);
  });
});

describe('runReminderSweep — dispatch (D-10/D-11 STOP gate)', () => {
  it('dispatches PENDING tasks whose scheduledFor has arrived through WhatsAppService.sendTemplate', async () => {
    const deps = createDeps();
    deps.taskService.findDispatchable.mockResolvedValue([buildTask()]);

    const report = await runReminderSweep(deps as any);

    expect(deps.whatsAppService.sendTemplate).toHaveBeenCalledTimes(1);
    const [input, actor] = deps.whatsAppService.sendTemplate.mock.calls[0];
    expect(input.ownerId).toBe(OWNER_ID);
    expect(input.templateKey).toBe('follow_up_reminder');
    expect(input.contextType).toBe('REMINDER');
    expect(actor).toEqual({ clinicId: CLINIC_ID, userId: null });
    expect(deps.taskService.markSent).toHaveBeenCalledWith(CLINIC_ID, 'task-1');
    expect(report.dispatched).toBe(1);
  });

  it('skips a send for an owner with remindersOptedOut true and records the task without crashing the sweep', async () => {
    const deps = createDeps();
    deps.taskService.findDispatchable.mockResolvedValue([buildTask()]);
    const optedOutError = Object.assign(new Error('Owner has opted out of reminders'), {
      statusCode: 403,
      code: 'OWNER_OPTED_OUT',
    });
    deps.whatsAppService.sendTemplate.mockRejectedValue(optedOutError);

    const report = await expect(runReminderSweep(deps as any)).resolves.toBeDefined();

    expect(deps.taskRepo.cancel).toHaveBeenCalledWith(CLINIC_ID, 'task-1');
    expect(deps.taskService.markSent).not.toHaveBeenCalled();
  });
});

describe('runReminderSweep — escalate/cap (D-03, D-04)', () => {
  it('escalates SENT tasks past nextAttemptAt whose attemptCount is below the cap', async () => {
    const deps = createDeps();
    const task = buildTask({
      state: 'SENT',
      touch: 'ON_DATE',
      attemptCount: 1,
      lastAttemptAt: new Date('2026-08-11'),
      nextAttemptAt: new Date('2026-08-14'),
    });
    deps.taskService.findEscalatable.mockResolvedValue([task]);

    const report = await runReminderSweep(deps as any);

    expect(deps.whatsAppService.sendTemplate).toHaveBeenCalledTimes(1);
    expect(deps.taskService.markSent).toHaveBeenCalledWith(CLINIC_ID, 'task-1');
    expect(deps.taskService.cap).not.toHaveBeenCalled();
    expect(report.escalated).toBe(1);
  });

  it('caps tasks at the attempt limit and flags the thread needsAction, dispatching no further send', async () => {
    const deps = createDeps();
    const task = buildTask({
      state: 'SENT',
      touch: 'ON_DATE',
      attemptCount: WA_ESCALATION.maxAttempts,
      lastAttemptAt: new Date('2026-08-08'),
      nextAttemptAt: new Date('2026-08-11'),
    });
    deps.taskService.findEscalatable.mockResolvedValue([task]);

    const report = await runReminderSweep(deps as any);

    expect(deps.taskService.cap).toHaveBeenCalledWith(CLINIC_ID, 'task-1', 'NO_REPLY_AFTER_MAX_ATTEMPTS');
    expect(deps.whatsAppService.sendTemplate).not.toHaveBeenCalled();
    expect(report.capped).toBe(1);
  });

  it('D-28: suppresses an ADVANCE resend colliding with the sibling ON_DATE send, without sending or marking sent', async () => {
    const deps = createDeps();
    const task = buildTask({
      state: 'SENT',
      touch: 'ADVANCE',
      kind: 'VACCINE_DUE',
      attemptCount: 1,
      lastAttemptAt: new Date('2026-08-12'),
      nextAttemptAt: new Date('2026-08-15'),
    });
    deps.taskService.findEscalatable.mockResolvedValue([task]);
    deps.taskService.isEscalationSuppressedBySibling.mockResolvedValue(true);

    const report = await runReminderSweep(deps as any);

    expect(deps.whatsAppService.sendTemplate).not.toHaveBeenCalled();
    expect(deps.taskService.markSent).not.toHaveBeenCalled();
    expect(deps.taskService.cap).not.toHaveBeenCalled();
    expect(report.escalated).toBe(0);
  });
});

describe('runReminderSweep — requeue stranded messages (Pitfall 1)', () => {
  it('re-enqueues WhatsAppMessage rows still QUEUED for more than 30 minutes', async () => {
    const deps = createDeps();
    deps.sourceRepo.findStrandedQueuedMessages.mockResolvedValue([
      { id: 'stranded-1', clinicId: CLINIC_ID, threadId: 'thread-1', queuedAt: new Date('2020-01-01') },
    ]);

    const report = await runReminderSweep(deps as any);

    expect(deps.sourceRepo.findStrandedQueuedMessages).toHaveBeenCalledWith(null, 30);
    expect(deps.outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'stranded-1' },
      expect.objectContaining({ jobId: 'send-stranded-1' }),
    );
    expect(report.requeued).toBe(1);
  });
});

describe('runReminderSweep — idempotency and per-clinic isolation', () => {
  it('called twice produces the same task rows and enqueues no duplicate send for an already-SENT task', async () => {
    const deps = createDeps();
    // First run: task is PENDING and dispatched.
    deps.taskService.findDispatchable.mockResolvedValueOnce([buildTask()]).mockResolvedValueOnce([]);

    await runReminderSweep(deps as any);
    await runReminderSweep(deps as any);

    expect(deps.whatsAppService.sendTemplate).toHaveBeenCalledTimes(1);
  });

  it('catches and logs a per-clinic error and continues with the remaining clinics', async () => {
    const deps = createDeps();
    deps.prisma.clinic.findMany.mockResolvedValue([{ id: 'clinic-bad' }, { id: 'clinic-good' }]);
    deps.sourceRepo.findFollowUpsDue.mockImplementation((clinicId: string) => {
      if (clinicId === 'clinic-bad') {
        throw new Error('boom');
      }
      return Promise.resolve([]);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runReminderSweep(deps as any)).resolves.toBeDefined();

    expect(deps.sourceRepo.findFollowUpsDue).toHaveBeenCalledWith('clinic-good', expect.anything());
    errorSpy.mockRestore();
  });

  it('returns a report with counts { discovered, tasksUpserted, dispatched, escalated, capped, requeued }', async () => {
    const deps = createDeps();

    const report = await runReminderSweep(deps as any);

    expect(report).toEqual(
      expect.objectContaining({
        discovered: expect.any(Number),
        tasksUpserted: expect.any(Number),
        dispatched: expect.any(Number),
        escalated: expect.any(Number),
        capped: expect.any(Number),
        requeued: expect.any(Number),
      }),
    );
  });
});

describe('createReminderSweepWorker (WHA-01 fix, Pitfall 7) — gives the sweep its own worker', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.clearAllMocks();
  });

  it("returns undefined when NODE_ENV is 'test'", () => {
    process.env.NODE_ENV = 'test';
    const deps = { ...createDeps(), redis: {} as any };

    const worker = createReminderSweepWorker(deps as any);

    expect(worker).toBeUndefined();
    expect(Worker).not.toHaveBeenCalled();
  });

  it("constructs a Worker for the dedicated 'whatsapp-reminder-sweep' queue with concurrency 1 when NODE_ENV is not 'test'", () => {
    process.env.NODE_ENV = 'production';
    const deps = { ...createDeps(), redis: {} as any };

    const worker = createReminderSweepWorker(deps as any);

    expect(worker).toBeDefined();
    expect(Worker).toHaveBeenCalledWith(
      'whatsapp-reminder-sweep',
      expect.any(Function),
      expect.objectContaining({ connection: deps.redis, concurrency: 1 }),
    );
  });

  it(
    'the constructed processor actually reaches runReminderSweep through the real composition path — ' +
      'this is the exact gap the fix closes: previously the scheduled sweep job landed on the ' +
      "outbound queue's worker, which never called runReminderSweep at all",
    async () => {
      process.env.NODE_ENV = 'production';
      const deps = { ...createDeps(), redis: {} as any };
      const source = {
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        petId: PET_ID,
        kind: 'FOLLOW_UP',
        sourceType: 'CONSULTATION',
        sourceId: 'consult-1',
        sourceLabel: null,
        dueDate: new Date('2026-08-15'),
      };
      deps.sourceRepo.findFollowUpsDue.mockResolvedValue([source]);

      createReminderSweepWorker(deps as any);

      // Call the plain processor function BullMQ's `Worker` was constructed
      // with — not a live `Worker` (which cannot run under NODE_ENV=test) —
      // simulating exactly what happens when the scheduled job fires.
      const [, processor] = (Worker as any).mock.calls[0];
      await processor({ id: 'job-1', name: 'reminder-sweep', data: {} });

      // Observable proof the sweep's discover/upsert phases actually ran,
      // reached through createReminderSweepWorker's own processor — not
      // through a direct runReminderSweep(deps) call, which was already true
      // before this fix.
      expect(deps.prisma.clinic.findMany).toHaveBeenCalledTimes(1);
      expect(deps.sourceRepo.findFollowUpsDue).toHaveBeenCalledWith(CLINIC_ID, expect.anything());
      expect(deps.taskService.upsertTasksForSource).toHaveBeenCalledWith(CLINIC_ID, source);
    },
  );
});
