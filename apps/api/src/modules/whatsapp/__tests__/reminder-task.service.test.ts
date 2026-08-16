import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReminderTaskService,
  createReminderReplyHandler,
  templateKeyForKind,
  isAdvanceEscalationSuppressedBySibling,
} from '../reminders/reminder-task.service.js';
import type { ReminderTaskRepository } from '../reminders/reminder-task.repository.js';
import { WA_ESCALATION, WA_REMINDER_LEAD_DAYS } from '@breeyo/types';

/**
 * WHA-01 / D-01 to D-05, D-28 — mock-repo style mirrors
 * `emr/__tests__/emr.service.test.ts` and `whatsapp.service.test.ts`: plain
 * objects exposing only the methods this service touches, each a `vi.fn()`.
 */

const CLINIC_ID = 'clinic-1';
const OWNER_ID = 'owner-1';
const PET_ID = 'pet-1';
const TASK_ID = 'task-1';
const THREAD_ID = 'thread-1';

function createMockTaskRepo(): { [K in keyof ReminderTaskRepository]: ReturnType<typeof vi.fn> } {
  return {
    findByKey: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateSchedule: vi.fn(),
    findDispatchable: vi.fn(),
    findEscalatable: vi.fn(),
    markSent: vi.fn(),
    setCapped: vi.fn(),
    setReplied: vi.fn(),
    cancelActive: vi.fn(),
    cancel: vi.fn(),
    setAcknowledged: vi.fn(),
    hasOtherCapped: vi.fn(),
  } as any;
}

function createMockWhatsAppRepo() {
  return {
    findThreadByPhone: vi.fn(),
    flagNeedsAction: vi.fn(),
    clearNeedsAction: vi.fn(),
  };
}

function createMockPrisma() {
  return {
    petOwner: {
      findUnique: vi.fn(),
    },
  };
}

function buildService() {
  const taskRepo = createMockTaskRepo();
  const whatsappRepo = createMockWhatsAppRepo();
  const prisma = createMockPrisma();
  const service = new ReminderTaskService(taskRepo as any, whatsappRepo as any, prisma as any);
  return { service, taskRepo, whatsappRepo, prisma };
}

describe('ReminderTaskService.upsertTasksForSource (D-01, D-02)', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('creates TWO rows for a follow-up due 2026-08-14: ADVANCE scheduledFor 2026-08-13, ON_DATE scheduledFor 2026-08-14', async () => {
    ctx.taskRepo.findByKey.mockResolvedValue(null);
    ctx.taskRepo.create.mockResolvedValue({ id: TASK_ID });

    await ctx.service.upsertTasksForSource(CLINIC_ID, {
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      kind: 'FOLLOW_UP',
      sourceType: 'CONSULTATION',
      sourceId: 'consult-1',
      sourceLabel: null,
      dueDate: new Date('2026-08-14'),
    });

    expect(ctx.taskRepo.create).toHaveBeenCalledTimes(2);
    const [advanceCall, onDateCall] = ctx.taskRepo.create.mock.calls.map((c) => c[1]);
    expect(advanceCall.touch).toBe('ADVANCE');
    expect(advanceCall.scheduledFor).toEqual(new Date('2026-08-13'));
    expect(onDateCall.touch).toBe('ON_DATE');
    expect(onDateCall.scheduledFor).toEqual(new Date('2026-08-14'));
  });

  it('creates ADVANCE scheduledFor 2026-08-12 and ON_DATE scheduledFor 2026-08-15 for a vaccine due 2026-08-15 (3-day lead)', async () => {
    ctx.taskRepo.findByKey.mockResolvedValue(null);
    ctx.taskRepo.create.mockResolvedValue({ id: TASK_ID });

    await ctx.service.upsertTasksForSource(CLINIC_ID, {
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      kind: 'VACCINE_DUE',
      sourceType: 'VACCINATION_RECORD',
      sourceId: 'vacc-1',
      sourceLabel: 'Rabies',
      dueDate: new Date('2026-08-15'),
    });

    const [advanceCall, onDateCall] = ctx.taskRepo.create.mock.calls.map((c) => c[1]);
    expect(advanceCall.scheduledFor).toEqual(new Date('2026-08-12'));
    expect(onDateCall.scheduledFor).toEqual(new Date('2026-08-15'));
  });

  it('creates no duplicate rows when called twice with identical input (unique key no-op)', async () => {
    const existingAdvance = { id: 'existing-advance', state: 'PENDING', touch: 'ADVANCE' };
    const existingOnDate = { id: 'existing-ondate', state: 'PENDING', touch: 'ON_DATE' };
    ctx.taskRepo.findByKey.mockImplementation((_c, _st, _sid, _kind, touch) =>
      Promise.resolve(touch === 'ADVANCE' ? existingAdvance : existingOnDate),
    );

    const source = {
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      kind: 'FOLLOW_UP' as const,
      sourceType: 'CONSULTATION' as const,
      sourceId: 'consult-1',
      sourceLabel: null,
      dueDate: new Date('2026-08-14'),
    };

    await ctx.service.upsertTasksForSource(CLINIC_ID, source);
    await ctx.service.upsertTasksForSource(CLINIC_ID, source);

    expect(ctx.taskRepo.create).not.toHaveBeenCalled();
  });

  it('updates scheduledFor on the existing PENDING rows rather than creating new ones when dueDate changes', async () => {
    const existingAdvance = { id: 'existing-advance', state: 'PENDING', touch: 'ADVANCE' };
    const existingOnDate = { id: 'existing-ondate', state: 'PENDING', touch: 'ON_DATE' };
    ctx.taskRepo.findByKey.mockImplementation((_c, _st, _sid, _kind, touch) =>
      Promise.resolve(touch === 'ADVANCE' ? existingAdvance : existingOnDate),
    );

    await ctx.service.upsertTasksForSource(CLINIC_ID, {
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      kind: 'FOLLOW_UP',
      sourceType: 'CONSULTATION',
      sourceId: 'consult-1',
      sourceLabel: null,
      dueDate: new Date('2026-08-20'),
    });

    expect(ctx.taskRepo.create).not.toHaveBeenCalled();
    expect(ctx.taskRepo.updateSchedule).toHaveBeenCalledWith(
      CLINIC_ID,
      'existing-advance',
      expect.objectContaining({ scheduledFor: new Date('2026-08-19') }),
    );
    expect(ctx.taskRepo.updateSchedule).toHaveBeenCalledWith(
      CLINIC_ID,
      'existing-ondate',
      expect.objectContaining({ scheduledFor: new Date('2026-08-20') }),
    );
  });

  it('does not update scheduledFor on an already-SENT row', async () => {
    const sentAdvance = { id: 'sent-advance', state: 'SENT', touch: 'ADVANCE' };
    const pendingOnDate = { id: 'pending-ondate', state: 'PENDING', touch: 'ON_DATE' };
    ctx.taskRepo.findByKey.mockImplementation((_c, _st, _sid, _kind, touch) =>
      Promise.resolve(touch === 'ADVANCE' ? sentAdvance : pendingOnDate),
    );

    await ctx.service.upsertTasksForSource(CLINIC_ID, {
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      kind: 'FOLLOW_UP',
      sourceType: 'CONSULTATION',
      sourceId: 'consult-1',
      sourceLabel: null,
      dueDate: new Date('2026-08-20'),
    });

    expect(ctx.taskRepo.updateSchedule).not.toHaveBeenCalledWith('sent-advance', expect.anything());
    expect(ctx.taskRepo.updateSchedule).toHaveBeenCalledWith(CLINIC_ID, 'pending-ondate', expect.anything());
  });
});

describe('ReminderTaskService.findDispatchable', () => {
  it('proxies to the repository for PENDING tasks due today or earlier', async () => {
    const { service, taskRepo } = buildService();
    const today = new Date('2026-08-14');
    taskRepo.findDispatchable.mockResolvedValue([{ id: TASK_ID }]);

    const rows = await service.findDispatchable(CLINIC_ID, today);

    expect(taskRepo.findDispatchable).toHaveBeenCalledWith(CLINIC_ID, today);
    expect(rows).toEqual([{ id: TASK_ID }]);
  });
});

describe('ReminderTaskService.markSent (D-03 interval)', () => {
  it('sets state SENT, increments attemptCount to 1, sets lastAttemptAt and nextAttemptAt = lastAttemptAt + 3 days', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.findById.mockResolvedValue({ id: TASK_ID, attemptCount: 0 });
    taskRepo.markSent.mockResolvedValue({ count: 1 });

    await service.markSent(CLINIC_ID, TASK_ID);

    expect(taskRepo.markSent).toHaveBeenCalledTimes(1);
    const [clinicId, taskId, input] = taskRepo.markSent.mock.calls[0];
    expect(clinicId).toBe(CLINIC_ID);
    expect(taskId).toBe(TASK_ID);
    expect(input.attemptCount).toBe(1);
    expect(input.lastAttemptAt).toBeInstanceOf(Date);
    const expectedNext = new Date(
      input.lastAttemptAt.getTime() + WA_ESCALATION.intervalDays * 24 * 60 * 60 * 1000,
    );
    expect(input.nextAttemptAt).toEqual(expectedNext);
  });

  it('increments attemptCount from an existing attemptCount rather than always writing 1', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.findById.mockResolvedValue({ id: TASK_ID, attemptCount: 1 });
    taskRepo.markSent.mockResolvedValue({ count: 1 });

    await service.markSent(CLINIC_ID, TASK_ID);

    const input = taskRepo.markSent.mock.calls[0][2];
    expect(input.attemptCount).toBe(2);
  });
});

describe('ReminderTaskService.findEscalatable', () => {
  it('returns SENT tasks whose nextAttemptAt has passed and whose attemptCount is below WA_ESCALATION.maxAttempts', async () => {
    const { service, taskRepo } = buildService();
    const now = new Date('2026-08-17');
    taskRepo.findEscalatable.mockResolvedValue([{ id: TASK_ID, attemptCount: 1, state: 'SENT' }]);

    const rows = await service.findEscalatable(CLINIC_ID, now);

    expect(taskRepo.findEscalatable).toHaveBeenCalledWith(CLINIC_ID, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].attemptCount).toBeLessThan(WA_ESCALATION.maxAttempts);
  });

  it('excludes a SENT task whose nextAttemptAt is still in the future (repository-level filter, asserted via call args)', async () => {
    const { service, taskRepo } = buildService();
    const now = new Date('2026-08-17');
    taskRepo.findEscalatable.mockResolvedValue([]);

    const rows = await service.findEscalatable(CLINIC_ID, now);

    expect(rows).toHaveLength(0);
    expect(taskRepo.findEscalatable).toHaveBeenCalledWith(CLINIC_ID, now);
  });
});

describe('ReminderTaskService.cap (D-04)', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
    ctx.taskRepo.findById.mockResolvedValue({ id: TASK_ID, ownerId: OWNER_ID, attemptCount: 2 });
    ctx.taskRepo.setCapped.mockResolvedValue({ count: 1 });
    ctx.prisma.petOwner.findUnique.mockResolvedValue({ id: OWNER_ID, mobile: '+919876543210' });
    ctx.whatsappRepo.findThreadByPhone.mockResolvedValue({ id: THREAD_ID });
  });

  it('a task with attemptCount 2 and no reply is capped: CAPPED_NEEDS_ACTION with cappedReason NO_REPLY_AFTER_MAX_ATTEMPTS', async () => {
    await ctx.service.cap(CLINIC_ID, TASK_ID, 'NO_REPLY_AFTER_MAX_ATTEMPTS');

    expect(ctx.taskRepo.setCapped).toHaveBeenCalledWith(CLINIC_ID, TASK_ID, 'NO_REPLY_AFTER_MAX_ATTEMPTS');
  });

  it('also flags the owner thread needsAction with reason REMINDER_NO_REPLY', async () => {
    await ctx.service.cap(CLINIC_ID, TASK_ID, 'NO_REPLY_AFTER_MAX_ATTEMPTS');

    expect(ctx.whatsappRepo.flagNeedsAction).toHaveBeenCalledWith(CLINIC_ID, THREAD_ID, 'REMINDER_NO_REPLY');
  });
});

describe('ReminderTaskService.markReplied (D-03, D-04)', () => {
  it('sets state REPLIED and repliedAt, so a subsequent findEscalatable does not return it', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.setReplied.mockResolvedValue({ count: 1 });
    taskRepo.findEscalatable.mockResolvedValue([]);

    await service.markReplied(CLINIC_ID, TASK_ID);

    expect(taskRepo.setReplied).toHaveBeenCalledWith(CLINIC_ID, TASK_ID);
    const rows = await service.findEscalatable(CLINIC_ID, new Date());
    expect(rows).toHaveLength(0);
  });

  it('on an already CAPPED_NEEDS_ACTION task still records repliedAt without resurrecting automated sending', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.setReplied.mockResolvedValue({ count: 1 });

    await service.markReplied(CLINIC_ID, TASK_ID);

    // The repository is the source of truth for the "preserve terminal
    // state" rule (setReplied never flips CAPPED_NEEDS_ACTION back to
    // REPLIED) -- this asserts the service delegates rather than
    // re-implementing (and potentially getting wrong) that state guard.
    expect(taskRepo.setReplied).toHaveBeenCalledWith(CLINIC_ID, TASK_ID);
  });
});

describe('ReminderTaskRepository.setReplied state-preservation (via a real repository instance)', () => {
  it('preserves CAPPED_NEEDS_ACTION when a late reply arrives', async () => {
    const { ReminderTaskRepository } = await import('../reminders/reminder-task.repository.js');
    const prisma = {
      whatsAppReminderTask: {
        findFirst: vi.fn().mockResolvedValue({ id: TASK_ID, state: 'CAPPED_NEEDS_ACTION' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repo = new ReminderTaskRepository(prisma as any);

    await repo.setReplied(CLINIC_ID, TASK_ID);

    const data = prisma.whatsAppReminderTask.updateMany.mock.calls[0][0].data;
    expect(data.repliedAt).toBeInstanceOf(Date);
    expect(data.state).toBeUndefined();
  });

  it('transitions a SENT task to REPLIED', async () => {
    const { ReminderTaskRepository } = await import('../reminders/reminder-task.repository.js');
    const prisma = {
      whatsAppReminderTask: {
        findFirst: vi.fn().mockResolvedValue({ id: TASK_ID, state: 'SENT' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repo = new ReminderTaskRepository(prisma as any);

    await repo.setReplied(CLINIC_ID, TASK_ID);

    const data = prisma.whatsAppReminderTask.updateMany.mock.calls[0][0].data;
    expect(data.state).toBe('REPLIED');
  });
});

describe('ReminderTaskService.capForNonRetryableFailure (Anti-Pattern A5)', () => {
  it('sets CAPPED_NEEDS_ACTION with a distinct cappedReason and does NOT increment attemptCount', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.findById.mockResolvedValue({ id: TASK_ID, ownerId: OWNER_ID, attemptCount: 1 });
    taskRepo.setCapped.mockResolvedValue({ count: 1 });

    await service.capForNonRetryableFailure(CLINIC_ID, TASK_ID, 'NOT_ON_WHATSAPP');

    expect(taskRepo.setCapped).toHaveBeenCalledWith(CLINIC_ID, TASK_ID, 'NOT_ON_WHATSAPP');
    expect(taskRepo.markSent).not.toHaveBeenCalled();
  });
});

describe('ReminderTaskService.cancelSupersededTasks (Pitfall 3)', () => {
  it('transitions PENDING and SENT tasks to CANCELLED when a newer source record supersedes theirs', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.cancelActive.mockResolvedValue({ count: 2 });

    await service.cancelSupersededTasks(CLINIC_ID, 'VACCINATION_RECORD', 'vacc-old-1');

    expect(taskRepo.cancelActive).toHaveBeenCalledWith(CLINIC_ID, 'VACCINATION_RECORD', 'vacc-old-1');
  });
});

describe('ReminderTaskService.acknowledgeTask', () => {
  it('sets acknowledgedAt so UI-SPEC Mark Resolved has an auditable target', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.findById.mockResolvedValue({ id: TASK_ID, ownerId: OWNER_ID });
    taskRepo.setAcknowledged.mockResolvedValue({ count: 1 });
    taskRepo.hasOtherCapped.mockResolvedValue(false);

    await service.acknowledgeTask(CLINIC_ID, TASK_ID, 'staff-1');

    expect(taskRepo.setAcknowledged).toHaveBeenCalledWith(CLINIC_ID, TASK_ID, 'staff-1');
  });

  it('clears thread needsAction when no other capped task remains for the owner', async () => {
    const { service, taskRepo, whatsappRepo, prisma } = buildService();
    taskRepo.findById.mockResolvedValue({ id: TASK_ID, ownerId: OWNER_ID });
    taskRepo.setAcknowledged.mockResolvedValue({ count: 1 });
    taskRepo.hasOtherCapped.mockResolvedValue(false);
    prisma.petOwner.findUnique.mockResolvedValue({ id: OWNER_ID, mobile: '+919876543210' });
    whatsappRepo.findThreadByPhone.mockResolvedValue({ id: THREAD_ID });

    await service.acknowledgeTask(CLINIC_ID, TASK_ID, 'staff-1');

    expect(whatsappRepo.clearNeedsAction).toHaveBeenCalledWith(CLINIC_ID, THREAD_ID);
  });

  it('does not clear thread needsAction when another capped task remains for the owner', async () => {
    const { service, taskRepo, whatsappRepo } = buildService();
    taskRepo.findById.mockResolvedValue({ id: TASK_ID, ownerId: OWNER_ID });
    taskRepo.setAcknowledged.mockResolvedValue({ count: 1 });
    taskRepo.hasOtherCapped.mockResolvedValue(true);

    await service.acknowledgeTask(CLINIC_ID, TASK_ID, 'staff-1');

    expect(whatsappRepo.clearNeedsAction).not.toHaveBeenCalled();
  });
});

describe('templateKeyForKind / WA_REMINDER_KIND_TO_TEMPLATE (D-05)', () => {
  it('maps each automated reminder kind to its template key', () => {
    expect(templateKeyForKind('FOLLOW_UP')).toBe('follow_up_reminder');
    expect(templateKeyForKind('VACCINE_DUE')).toBe('vaccine_due');
    expect(templateKeyForKind('DEWORMING_DUE')).toBe('deworming_due');
  });
});

describe('createReminderReplyHandler (interface supplied to InboundRouterService)', () => {
  it('markReplied calls the task service when a reminderTaskId is attributed', async () => {
    const { service, taskRepo } = buildService();
    taskRepo.setReplied.mockResolvedValue({ count: 1 });
    const handler = createReminderReplyHandler({ taskService: service });

    await handler.markReplied({
      clinicId: CLINIC_ID,
      threadId: THREAD_ID,
      ownerId: OWNER_ID,
      waPhone: '+919876543210',
      occurredAt: new Date(),
      reminderTaskId: TASK_ID,
    });

    expect(taskRepo.setReplied).toHaveBeenCalledWith(CLINIC_ID, TASK_ID);
  });

  it('does nothing when no reminderTaskId could be attributed', async () => {
    const { service, taskRepo } = buildService();
    const handler = createReminderReplyHandler({ taskService: service });

    await handler.markReplied({
      clinicId: CLINIC_ID,
      threadId: THREAD_ID,
      ownerId: OWNER_ID,
      waPhone: '+919876543210',
      occurredAt: new Date(),
      reminderTaskId: null,
    });

    expect(taskRepo.setReplied).not.toHaveBeenCalled();
  });
});

describe('isAdvanceEscalationSuppressedBySibling (D-28)', () => {
  const today = new Date('2026-08-15');

  it('returns false immediately for an ON_DATE task without querying a sibling', async () => {
    const taskRepo = createMockTaskRepo();

    const suppressed = await isAdvanceEscalationSuppressedBySibling(
      taskRepo as any,
      CLINIC_ID,
      { touch: 'ON_DATE', sourceType: 'VACCINATION_RECORD', sourceId: 'vacc-1', kind: 'VACCINE_DUE' },
      today,
    );

    expect(suppressed).toBe(false);
    expect(taskRepo.findByKey).not.toHaveBeenCalled();
  });

  it('suppresses an ADVANCE escalation when the sibling ON_DATE task is scheduled for today', async () => {
    const taskRepo = createMockTaskRepo();
    taskRepo.findByKey.mockResolvedValue({
      id: 'sibling-1',
      touch: 'ON_DATE',
      scheduledFor: new Date('2026-08-15'),
      state: 'PENDING',
      lastAttemptAt: null,
    });

    const suppressed = await isAdvanceEscalationSuppressedBySibling(
      taskRepo as any,
      CLINIC_ID,
      { touch: 'ADVANCE', sourceType: 'VACCINATION_RECORD', sourceId: 'vacc-1', kind: 'VACCINE_DUE' },
      today,
    );

    expect(suppressed).toBe(true);
    expect(taskRepo.findByKey).toHaveBeenCalledWith(
      CLINIC_ID,
      'VACCINATION_RECORD',
      'vacc-1',
      'VACCINE_DUE',
      'ON_DATE',
    );
  });

  it('suppresses an ADVANCE escalation when the sibling ON_DATE task already sent today', async () => {
    const taskRepo = createMockTaskRepo();
    taskRepo.findByKey.mockResolvedValue({
      id: 'sibling-1',
      touch: 'ON_DATE',
      scheduledFor: new Date('2026-08-20'), // not today, but already sent today
      state: 'SENT',
      lastAttemptAt: new Date('2026-08-15T09:00:00Z'),
    });

    const suppressed = await isAdvanceEscalationSuppressedBySibling(
      taskRepo as any,
      CLINIC_ID,
      { touch: 'ADVANCE', sourceType: 'VACCINATION_RECORD', sourceId: 'vacc-1', kind: 'VACCINE_DUE' },
      today,
    );

    expect(suppressed).toBe(true);
  });

  it('does not suppress when the sibling ON_DATE task is scheduled for a future day and has not sent today', async () => {
    const taskRepo = createMockTaskRepo();
    taskRepo.findByKey.mockResolvedValue({
      id: 'sibling-1',
      touch: 'ON_DATE',
      scheduledFor: new Date('2026-08-20'),
      state: 'PENDING',
      lastAttemptAt: null,
    });

    const suppressed = await isAdvanceEscalationSuppressedBySibling(
      taskRepo as any,
      CLINIC_ID,
      { touch: 'ADVANCE', sourceType: 'VACCINATION_RECORD', sourceId: 'vacc-1', kind: 'VACCINE_DUE' },
      today,
    );

    expect(suppressed).toBe(false);
  });

  it('does not suppress when no sibling ON_DATE task exists', async () => {
    const taskRepo = createMockTaskRepo();
    taskRepo.findByKey.mockResolvedValue(null);

    const suppressed = await isAdvanceEscalationSuppressedBySibling(
      taskRepo as any,
      CLINIC_ID,
      { touch: 'ADVANCE', sourceType: 'VACCINATION_RECORD', sourceId: 'vacc-1', kind: 'VACCINE_DUE' },
      today,
    );

    expect(suppressed).toBe(false);
  });
});

describe('WA_REMINDER_LEAD_DAYS sanity (used by upsertTasksForSource)', () => {
  it('has the three automated reminder kinds with the D-01/D-02 lead days', () => {
    expect(WA_REMINDER_LEAD_DAYS).toEqual({ FOLLOW_UP: 1, VACCINE_DUE: 3, DEWORMING_DUE: 3 });
  });
});
