import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OwnerActionService } from '../owner-action.service.js';
import type { AppointmentRepository } from '../appointment.repository.js';
import type { AppointmentService } from '../appointment.service.js';
import type { AppointmentReminderService } from '../reminder.service.js';
import type { PushTriggerService } from '../push-trigger.service.js';

/**
 * Phase 8 plan 08-10 Task 3 (D-12, D-15, D-16, D-33) — OwnerActionService
 * unit tests against mocked collaborators. The ownership-refusal behaviors
 * are ALSO proven against real rows in
 * `apps/api/tests/scheduling/owner-action-bridge.test.ts` — this file
 * covers the full dispatch/branch logic with fast, deterministic mocks.
 */

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_CLINIC_ID = '00000000-0000-0000-0000-000000000099';
const OWNER_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_OWNER_ID = '00000000-0000-0000-0000-000000000003';
const CREATED_BY_ID = '00000000-0000-0000-0000-000000000010';
const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000200';

function mockAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    clinicId: CLINIC_ID,
    ownerId: OWNER_ID,
    createdById: CREATED_BY_ID,
    status: 'SCHEDULED',
    scheduledFor: new Date('2026-08-20T04:30:00.000Z'),
    pets: [{ id: 'ap-1', petId: 'pet-1', queueEntryId: null, pet: { id: 'pet-1', name: 'Bruno', species: 'DOG' } }],
    owner: { id: OWNER_ID, name: 'Asha', mobile: '+919876543210' },
    ...overrides,
  };
}

function createMockAppointments() {
  return { findById: vi.fn().mockResolvedValue(mockAppointment()) };
}

function createMockAppointmentService() {
  return {
    cancelAppointment: vi.fn().mockResolvedValue({ appointment: mockAppointment({ status: 'CANCELLED' }) }),
    rescheduleAppointment: vi.fn(),
  };
}

function createMockReminders() {
  return { cancelPendingForAppointment: vi.fn().mockResolvedValue(2) };
}

function createMockPushTriggers() {
  return { notifyOwnerAction: vi.fn().mockResolvedValue(undefined) };
}

function createMockPrisma() {
  return {};
}

function createMockSender() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function invalidTransitionError() {
  const err = new Error('Invalid transition') as Error & { code: string; statusCode: number };
  err.code = 'INVALID_TRANSITION';
  err.statusCode = 400;
  return err;
}

vi.mock('../../../lib/audit-log.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/audit-log.js')>('../../../lib/audit-log.js');
  return { ...actual, writeAuditLog: vi.fn().mockResolvedValue(undefined) };
});

describe('OwnerActionService.handleOwnerAction (D-12, D-15, D-16, D-33)', () => {
  let appointments: ReturnType<typeof createMockAppointments>;
  let appointmentService: ReturnType<typeof createMockAppointmentService>;
  let reminders: ReturnType<typeof createMockReminders>;
  let pushTriggers: ReturnType<typeof createMockPushTriggers>;
  let sender: ReturnType<typeof createMockSender>;
  let service: OwnerActionService;

  beforeEach(() => {
    appointments = createMockAppointments();
    appointmentService = createMockAppointmentService();
    reminders = createMockReminders();
    pushTriggers = createMockPushTriggers();
    sender = createMockSender();
    service = new OwnerActionService(
      appointments as unknown as AppointmentRepository,
      appointmentService as unknown as AppointmentService,
      reminders as unknown as AppointmentReminderService,
      pushTriggers as unknown as PushTriggerService,
      createMockPrisma() as any,
      sender,
    );
  });

  it('KEEP is a no-op acknowledgement: leaves the appointment SCHEDULED, no lifecycle change, sends owner confirmation', async () => {
    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'KEEP',
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: true, applied: 'KEEP' });
    expect(appointmentService.cancelAppointment).not.toHaveBeenCalled();
    expect(appointmentService.rescheduleAppointment).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send.mock.calls[0][0]).toBe(CLINIC_ID);
    expect(sender.send.mock.calls[0][1]).toBe(OWNER_ID);
  });

  it('CANCEL auto-applies: transitions to CANCELLED with a WhatsApp cancelReason, cancels pending reminders, notifies staff', async () => {
    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'CANCEL',
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: true, applied: 'CANCEL' });
    expect(appointmentService.cancelAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        appointmentId: APPOINTMENT_ID,
        scope: 'ONE',
        reason: expect.stringContaining('WhatsApp'),
      }),
    );
    expect(reminders.cancelPendingForAppointment).toHaveBeenCalledWith(APPOINTMENT_ID, CLINIC_ID);
    expect(pushTriggers.notifyOwnerAction).toHaveBeenCalledWith(CLINIC_ID, expect.anything(), 'CANCEL');
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('MOVE does not change the appointment: emits a staff MOVE_REQUEST notification and an owner acknowledgement, never calls cancel/reschedule', async () => {
    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'MOVE',
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: true, applied: 'MOVE' });
    expect(appointmentService.cancelAppointment).not.toHaveBeenCalled();
    expect(appointmentService.rescheduleAppointment).not.toHaveBeenCalled();
    expect(pushTriggers.notifyOwnerAction).toHaveBeenCalledWith(CLINIC_ID, expect.anything(), 'MOVE');
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('an appointment belonging to a different owner is refused with the single NOT_ACTIONABLE reason, unchanged', async () => {
    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OTHER_OWNER_ID,
      action: 'CANCEL',
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });
    expect(appointmentService.cancelAppointment).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('an appointment in a different clinic is refused, resolved through the thread clinic not a payload clinic id', async () => {
    // findById is scoped by clinicId at the repository level -- a
    // cross-clinic lookup returns null, exactly like "not found".
    appointments.findById.mockImplementation(async (clinicId: string) =>
      clinicId === CLINIC_ID ? mockAppointment() : null,
    );

    const result = await service.handleOwnerAction({
      clinicId: OTHER_CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'CANCEL',
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });
    expect(appointments.findById).toHaveBeenCalledWith(OTHER_CLINIC_ID, APPOINTMENT_ID);
  });

  it('a well-formed payload for a nonexistent appointment is refused without disclosing anything', async () => {
    appointments.findById.mockResolvedValue(null);

    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'CANCEL',
      appointmentId: '00000000-0000-0000-0000-000000009999',
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });
  });

  it('an already-cancelled appointment refuses a second CANCEL with the neutral reply, not the D-33 already-started reply', async () => {
    appointments.findById.mockResolvedValue(mockAppointment({ status: 'CANCELLED' }));
    appointmentService.cancelAppointment.mockRejectedValue(invalidTransitionError());

    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'CANCEL',
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: true, applied: 'CANCEL' });
    expect(sender.send).toHaveBeenCalledTimes(1);
    const neutralReply = sender.send.mock.calls[0][2] as string;
    expect(neutralReply.toLowerCase()).not.toContain('already started');
  });

  it('a CANCEL reply for an already-checked-in appointment gets the specific D-33 reply, distinct from the neutral one, without calling cancelAppointment', async () => {
    appointments.findById.mockResolvedValue(mockAppointment({ status: 'CHECKED_IN' }));

    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'CANCEL',
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: true, applied: 'CANCEL' });
    expect(appointmentService.cancelAppointment).not.toHaveBeenCalled();
    const reply = sender.send.mock.calls[0][2] as string;
    expect(reply.toLowerCase()).toContain('already started');
  });

  it('a COMPLETED appointment also gets the D-33 already-started reply, without calling cancelAppointment', async () => {
    appointments.findById.mockResolvedValue(mockAppointment({ status: 'COMPLETED' }));

    await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'CANCEL',
      appointmentId: APPOINTMENT_ID,
    });

    expect(appointmentService.cancelAppointment).not.toHaveBeenCalled();
    const reply = sender.send.mock.calls[0][2] as string;
    expect(reply.toLowerCase()).toContain('already started');
  });

  it('a malformed payload (not-a-uuid appointmentId) is rejected by the validator with no state change', async () => {
    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'CANCEL',
      appointmentId: 'not-a-uuid',
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });
    expect(appointments.findById).not.toHaveBeenCalled();
  });

  it('a malformed action is rejected by the validator with no state change', async () => {
    const result = await service.handleOwnerAction({
      clinicId: CLINIC_ID,
      threadOwnerId: OWNER_ID,
      action: 'FROBNICATE' as never,
      appointmentId: APPOINTMENT_ID,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_ACTIONABLE' });
    expect(appointments.findById).not.toHaveBeenCalled();
  });
});
