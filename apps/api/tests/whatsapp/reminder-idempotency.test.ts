import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  createTestVaccinationRecord,
  createTestWhatsAppReminderTask,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';
import { getTodayIST, addDaysIST } from '../../src/lib/ist-date.js';
import { ReminderSourceRepository } from '../../src/modules/whatsapp/reminders/reminder-source.repository.js';
import { ReminderTaskRepository } from '../../src/modules/whatsapp/reminders/reminder-task.repository.js';
import { ReminderTaskService } from '../../src/modules/whatsapp/reminders/reminder-task.service.js';
import { runReminderSweep, type ReminderSweepDeps } from '../../src/modules/whatsapp/reminders/reminder-sweep.job.js';
import { WhatsAppRepository } from '../../src/modules/whatsapp/whatsapp.repository.js';
import { SendAuthorizationService } from '../../src/modules/whatsapp/send-authorization.service.js';
import { WhatsAppService } from '../../src/modules/whatsapp/whatsapp.service.js';

/**
 * WHA-01 / D-01 to D-04, D-28, Pitfall 3 — real-database integration suite
 * (07-11 Task 3). Mirrors `tests/whatsapp/send.test.ts`'s pattern: construct
 * the real repositories/services against the shared `prisma` handle from
 * `tests/helpers/factories.js` and a fake outbound queue, and call
 * `runReminderSweep` directly rather than through HTTP (the route layer
 * lands in 07-12/13).
 *
 * `deps.prisma.clinic.findMany` is stubbed to return ONLY the clinic each
 * test created, rather than the real cross-suite `prisma.clinic` table --
 * this shared test database accumulates clinics from every test file in the
 * run, and scoping here is what keeps "exactly one task" assertions
 * deterministic without needing a full per-test database reset.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

function buildDeps(clinicId: string, sendTemplate: ReturnType<typeof vi.fn>): ReminderSweepDeps {
  const sourceRepo = new ReminderSourceRepository(prisma);
  const taskRepo = new ReminderTaskRepository(prisma);
  const whatsappRepo = new WhatsAppRepository(prisma);
  const taskService = new ReminderTaskService(taskRepo, whatsappRepo, prisma);

  return {
    prisma: { clinic: { findMany: async () => [{ id: clinicId }] } } as any,
    sourceRepo,
    taskRepo,
    taskService,
    whatsAppService: { sendTemplate },
    outboundQueue: { add: vi.fn().mockResolvedValue(undefined) },
  };
}

async function setupClinicOwnerPet() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  await createTestTokens(app, user.id, clinic.id);
  const owner = await createTestPetOwner(clinic.id);
  const pet = await createTestPet(clinic.id, owner.id);
  return { user, clinic, owner, pet };
}

describe('WhatsApp Reminder Sweep Idempotency (WHA-01, D-01, D-03, Pitfall 3)', () => {
  it('running the sweep twice on the same day creates exactly one ADVANCE task row and enqueues exactly one send (WHA-01, D-01, D-03)', async () => {
    const { clinic, owner, pet, user } = await setupClinicOwnerPet();
    const today = getTodayIST();
    const followUpDate = addDaysIST(today, 1); // ADVANCE touch fires today, one day before (D-01)

    const consultation = await createTestConsultation(clinic.id, pet.id, user.id, {
      followUpDate,
      followUpReason: 'Recheck',
    });

    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const deps = buildDeps(clinic.id, sendTemplate);

    await runReminderSweep(deps);
    await runReminderSweep(deps);

    const tasks = await prisma.whatsAppReminderTask.findMany({
      where: { clinicId: clinic.id, sourceType: 'CONSULTATION', sourceId: consultation.id, touch: 'ADVANCE' },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].state).toBe('SENT');
    expect(tasks[0].attemptCount).toBe(1);

    expect(sendTemplate).toHaveBeenCalledTimes(1);
  });

  it('a superseded vaccination record produces no task (Pitfall 3)', async () => {
    const { clinic, owner, pet } = await setupClinicOwnerPet();
    const today = getTodayIST();
    const dueDate = addDaysIST(today, 3); // VACCINE_DUE ADVANCE fires today, 3 days before (D-02)

    // The OLDER record's nextDueDate falls in today's due window...
    await createTestVaccinationRecord(clinic.id, pet.id, {
      vaccineName: 'Rabies',
      administeredAt: new Date('2025-01-01'),
      nextDueDate: dueDate,
    });
    // ...but a NEWER record for the same pet/vaccine supersedes it.
    await createTestVaccinationRecord(clinic.id, pet.id, {
      vaccineName: 'Rabies',
      administeredAt: new Date(),
      nextDueDate: addDaysIST(today, 365),
    });

    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const deps = buildDeps(clinic.id, sendTemplate);

    await runReminderSweep(deps);

    const tasks = await prisma.whatsAppReminderTask.findMany({
      where: { clinicId: clinic.id, sourceType: 'VACCINATION_RECORD', kind: 'VACCINE_DUE' },
    });
    expect(tasks).toHaveLength(0);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('a SENT task with nextAttemptAt in the past and attemptCount 2 is capped and its thread has needsAction true (D-04)', async () => {
    const { clinic, owner, pet } = await setupClinicOwnerPet();

    // A prior send already created the owner's thread (mirrors what the
    // first dispatch would have done).
    const thread = await prisma.whatsAppThread.create({
      data: { clinicId: clinic.id, ownerId: owner.id, waPhone: owner.mobile },
    });

    const task = await createTestWhatsAppReminderTask(clinic.id, owner.id, pet.id, {
      kind: 'FOLLOW_UP',
      touch: 'ON_DATE',
      sourceType: 'CONSULTATION',
      sourceId: randomUUID(),
      state: 'SENT',
      attemptCount: 2,
    });
    await prisma.whatsAppReminderTask.update({
      where: { id: task.id },
      data: { lastAttemptAt: new Date('2026-08-01'), nextAttemptAt: new Date('2026-08-04') },
    });

    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const deps = buildDeps(clinic.id, sendTemplate);

    await runReminderSweep(deps);

    const updated = await prisma.whatsAppReminderTask.findUnique({ where: { id: task.id } });
    expect(updated?.state).toBe('CAPPED_NEEDS_ACTION');
    expect(updated?.cappedReason).toBe('NO_REPLY_AFTER_MAX_ATTEMPTS');
    expect(sendTemplate).not.toHaveBeenCalled();

    const updatedThread = await prisma.whatsAppThread.findUnique({ where: { id: thread.id } });
    expect(updatedThread?.needsAction).toBe(true);
    expect(updatedThread?.needsActionReason).toBe('REMINDER_NO_REPLY');
  });

  it('D-28: suppresses an ADVANCE resend that would land the same day as the sibling ON_DATE send, while the ON_DATE task dispatches normally', async () => {
    const { clinic, owner, pet } = await setupClinicOwnerPet();
    const today = getTodayIST();
    const sourceId = randomUUID();

    // ADVANCE touch: already SENT once, its 3-day escalation resend is due
    // today -- the SAME day the ON_DATE touch's own first send goes out.
    const advanceTask = await createTestWhatsAppReminderTask(clinic.id, owner.id, pet.id, {
      kind: 'VACCINE_DUE',
      touch: 'ADVANCE',
      sourceType: 'VACCINATION_RECORD',
      sourceId,
      sourceLabel: 'Rabies',
      state: 'SENT',
      attemptCount: 1,
      dueDate: today,
      scheduledFor: addDaysIST(today, -3),
    });
    await prisma.whatsAppReminderTask.update({
      where: { id: advanceTask.id },
      data: { lastAttemptAt: addDaysIST(today, -3), nextAttemptAt: today },
    });

    // ON_DATE touch: still PENDING, scheduled for today -- its own
    // independent first send.
    const onDateTask = await createTestWhatsAppReminderTask(clinic.id, owner.id, pet.id, {
      kind: 'VACCINE_DUE',
      touch: 'ON_DATE',
      sourceType: 'VACCINATION_RECORD',
      sourceId,
      sourceLabel: 'Rabies',
      state: 'PENDING',
      dueDate: today,
      scheduledFor: today,
    });

    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const deps = buildDeps(clinic.id, sendTemplate);

    await runReminderSweep(deps);

    const updatedAdvance = await prisma.whatsAppReminderTask.findUnique({ where: { id: advanceTask.id } });
    // Suppressed: unchanged attemptCount, still SENT, no resend dispatched for it.
    expect(updatedAdvance?.attemptCount).toBe(1);
    expect(updatedAdvance?.state).toBe('SENT');

    const updatedOnDate = await prisma.whatsAppReminderTask.findUnique({ where: { id: onDateTask.id } });
    // Independent: dispatches normally as its own send.
    expect(updatedOnDate?.state).toBe('SENT');
    expect(updatedOnDate?.attemptCount).toBe(1);

    // Exactly one send happened (the ON_DATE task's), not two.
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0][0].contextId).toBe(onDateTask.id);
  });
});
