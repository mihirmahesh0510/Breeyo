import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppointmentReminderService } from '../reminder.service.js';
import type { ReminderTaskRepository } from '../../whatsapp/reminders/reminder-task.repository.js';
import type { WhatsAppRepository } from '../../whatsapp/whatsapp.repository.js';
import type { AppointmentRepository } from '../appointment.repository.js';
import { getTodayIST, addDaysIST, minutesToIstDate } from '../../../lib/ist-date.js';

/**
 * Phase 8 plan 08-10 Task 2 (D-17, D-18) — AppointmentReminderService unit
 * tests against mocked collaborators: `ReminderTaskRepository` (Phase 7's
 * own `WhatsAppReminderTask` persistence), `WhatsAppRepository` (Phase 7's
 * consent check), and `AppointmentRepository` (Phase 8's own repository).
 * No live database — the real-DB idempotency/unique-key proof already lives
 * in Phase 7's own reminder-task suite; this file proves only this
 * service's own discovery/upsert/cancel orchestration.
 */

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OWNER_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_OWNER_ID = '00000000-0000-0000-0000-000000000003';
const PET_ID = '00000000-0000-0000-0000-000000000004';
const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000200';

const TODAY = getTodayIST();
const TOMORROW = addDaysIST(TODAY, 1);
const NOW = minutesToIstDate(TODAY, 9 * 60); // 9:00 AM IST "now"

function mockAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    clinicId: CLINIC_ID,
    ownerId: OWNER_ID,
    status: 'SCHEDULED',
    scheduledFor: minutesToIstDate(TOMORROW, 10 * 60),
    pets: [{ id: 'ap-1', petId: PET_ID, queueEntryId: null, pet: { id: PET_ID, name: 'Buddy', species: 'DOG' } }],
    owner: { id: OWNER_ID, name: 'Rahul', mobile: '+919876543210' },
    ...overrides,
  };
}

function createMockTaskRepo() {
  return {
    findByKey: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'task-1' }),
    cancelActive: vi.fn().mockResolvedValue({ count: 0 }),
  };
}

function createMockWhatsAppRepo() {
  return {
    getOwnerPreference: vi.fn().mockResolvedValue(null), // no opt-out by default
  };
}

function createMockAppointmentRepo() {
  return {
    findRemindableAppointments: vi.fn().mockResolvedValue([]),
  };
}

describe('AppointmentReminderService.discoverAppointmentReminders (D-17, D-18)', () => {
  let taskRepo: ReturnType<typeof createMockTaskRepo>;
  let whatsappRepo: ReturnType<typeof createMockWhatsAppRepo>;
  let appointments: ReturnType<typeof createMockAppointmentRepo>;
  let service: AppointmentReminderService;

  beforeEach(() => {
    taskRepo = createMockTaskRepo();
    whatsappRepo = createMockWhatsAppRepo();
    appointments = createMockAppointmentRepo();
    service = new AppointmentReminderService(
      taskRepo as unknown as ReminderTaskRepository,
      whatsappRepo as unknown as WhatsAppRepository,
      appointments as unknown as AppointmentRepository,
    );
  });

  it('an appointment one day out gets an ADVANCE task', async () => {
    appointments.findRemindableAppointments.mockImplementation(async (from: Date) => {
      // The ADVANCE-day query window (tomorrow) returns the appointment.
      return from.getTime() === TOMORROW.getTime() ? [mockAppointment()] : [];
    });

    const report = await service.discoverAppointmentReminders(NOW);

    expect(report.advanceCreated).toBe(1);
    expect(taskRepo.create).toHaveBeenCalledWith(
      CLINIC_ID,
      expect.objectContaining({
        kind: 'APPOINTMENT_REMINDER',
        sourceType: 'APPOINTMENT',
        sourceId: APPOINTMENT_ID,
        touch: 'ADVANCE',
      }),
    );
  });

  it('an appointment today gets an ON_DATE task', async () => {
    appointments.findRemindableAppointments.mockImplementation(async (from: Date) => {
      return from.getTime() === TODAY.getTime() ? [mockAppointment({ scheduledFor: minutesToIstDate(TODAY, 14 * 60) })] : [];
    });

    const report = await service.discoverAppointmentReminders(NOW);

    expect(report.onDateCreated).toBe(1);
    expect(taskRepo.create).toHaveBeenCalledWith(
      CLINIC_ID,
      expect.objectContaining({
        kind: 'APPOINTMENT_REMINDER',
        sourceType: 'APPOINTMENT',
        sourceId: APPOINTMENT_ID,
        touch: 'ON_DATE',
      }),
    );
  });

  it('the two touches coexist: both tasks exist simultaneously for one appointment and neither overwrites the other', async () => {
    const appt = mockAppointment();
    appointments.findRemindableAppointments.mockResolvedValue([appt]);

    await service.discoverAppointmentReminders(NOW);

    const calls = taskRepo.create.mock.calls;
    const touches = calls.map((call) => (call[1] as { touch: string }).touch);
    expect(touches).toContain('ADVANCE');
    expect(touches).toContain('ON_DATE');
    expect(calls).toHaveLength(2);
  });

  it('re-running discovery is a no-op: a second run upserts no additional rows', async () => {
    const appt = mockAppointment();
    appointments.findRemindableAppointments.mockResolvedValue([appt]);
    // Second run: findByKey now resolves an existing row for both touches.
    taskRepo.findByKey.mockResolvedValue({ id: 'existing-task', state: 'PENDING' });

    const report = await service.discoverAppointmentReminders(NOW);

    expect(report.advanceCreated).toBe(0);
    expect(report.onDateCreated).toBe(0);
    expect(taskRepo.create).not.toHaveBeenCalled();
  });

  it('a cancelled appointment produces no task', async () => {
    // findRemindableAppointments is documented to only return SCHEDULED
    // appointments -- a cancelled one is filtered at the query layer, so the
    // mock simply returns nothing for it.
    appointments.findRemindableAppointments.mockResolvedValue([]);

    const report = await service.discoverAppointmentReminders(NOW);

    expect(report.advanceCreated).toBe(0);
    expect(report.onDateCreated).toBe(0);
    expect(taskRepo.create).not.toHaveBeenCalled();
  });

  it('a NO_SHOW appointment produces no task', async () => {
    appointments.findRemindableAppointments.mockResolvedValue([]);

    const report = await service.discoverAppointmentReminders(NOW);

    expect(taskRepo.create).not.toHaveBeenCalled();
    expect(report.skipped).toBe(0);
  });

  it('an appointment for a STOP-opted-out owner produces no task (D-17 reuses Phase 7 consent rules)', async () => {
    appointments.findRemindableAppointments.mockResolvedValue([mockAppointment()]);
    whatsappRepo.getOwnerPreference.mockResolvedValue({ remindersOptedOut: true });

    const report = await service.discoverAppointmentReminders(NOW);

    expect(taskRepo.create).not.toHaveBeenCalled();
    expect(report.skipped).toBeGreaterThan(0);
    expect(whatsappRepo.getOwnerPreference).toHaveBeenCalledWith(CLINIC_ID, OWNER_ID);
  });

  it('no escalation task is created: exactly two tasks ever exist per appointment run, no third resend/needsAction row', async () => {
    appointments.findRemindableAppointments.mockResolvedValue([mockAppointment()]);

    await service.discoverAppointmentReminders(NOW);

    expect(taskRepo.create).toHaveBeenCalledTimes(2);
    for (const call of taskRepo.create.mock.calls) {
      expect(call[1]).not.toHaveProperty('cappedReason');
      expect(call[1]).not.toHaveProperty('attemptCount');
    }
  });
});

describe('AppointmentReminderService.cancelPendingForAppointment', () => {
  let taskRepo: ReturnType<typeof createMockTaskRepo>;
  let service: AppointmentReminderService;

  beforeEach(() => {
    taskRepo = createMockTaskRepo();
    service = new AppointmentReminderService(
      taskRepo as unknown as ReminderTaskRepository,
      createMockWhatsAppRepo() as unknown as WhatsAppRepository,
      createMockAppointmentRepo() as unknown as AppointmentRepository,
    );
  });

  it('cancels PENDING and SENT tasks for the appointment, matching Phase 7\'s superseded-source pattern', async () => {
    taskRepo.cancelActive.mockResolvedValue({ count: 2 });

    const count = await service.cancelPendingForAppointment(APPOINTMENT_ID, CLINIC_ID);

    expect(taskRepo.cancelActive).toHaveBeenCalledWith(CLINIC_ID, 'APPOINTMENT', APPOINTMENT_ID);
    expect(count).toBe(2);
  });

  it('leaves already-CANCELLED and FAILED tasks alone (delegates to cancelActive\'s own PENDING/SENT-only filter)', async () => {
    taskRepo.cancelActive.mockResolvedValue({ count: 0 });

    const count = await service.cancelPendingForAppointment(APPOINTMENT_ID, CLINIC_ID);

    expect(count).toBe(0);
  });
});

describe('AppointmentReminderService reschedule-then-rediscover (RESEARCH Pitfall 6)', () => {
  it('reschedule then rediscover produces tasks for the new date, and no task references the old one', async () => {
    const taskRepo = createMockTaskRepo();
    const whatsappRepo = createMockWhatsAppRepo();
    const appointments = createMockAppointmentRepo();
    const service = new AppointmentReminderService(
      taskRepo as unknown as ReminderTaskRepository,
      whatsappRepo as unknown as WhatsAppRepository,
      appointments as unknown as AppointmentRepository,
    );

    // Step 1: the appointment moves — its pending reminder tasks are cancelled.
    await service.cancelPendingForAppointment(APPOINTMENT_ID, CLINIC_ID);
    expect(taskRepo.cancelActive).toHaveBeenCalledWith(CLINIC_ID, 'APPOINTMENT', APPOINTMENT_ID);

    // Step 2: rediscovery against the NEW date finds the moved appointment
    // and upserts fresh tasks scheduled for the new date.
    const newTomorrow = addDaysIST(TOMORROW, 5);
    appointments.findRemindableAppointments.mockImplementation(async (from: Date) => {
      return from.getTime() === newTomorrow.getTime()
        ? [mockAppointment({ scheduledFor: minutesToIstDate(newTomorrow, 10 * 60) })]
        : [];
    });

    const nowForNewDate = minutesToIstDate(addDaysIST(newTomorrow, -1), 9 * 60);
    const report = await service.discoverAppointmentReminders(nowForNewDate);

    expect(report.advanceCreated).toBe(1);
    const [, data] = taskRepo.create.mock.calls[0];
    expect((data as { scheduledFor: Date }).scheduledFor.getTime()).toBe(newTomorrow.getTime());
  });
});
