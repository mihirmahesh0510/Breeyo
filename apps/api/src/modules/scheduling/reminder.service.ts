/**
 * Phase 8 plan 08-10 Task 2 (D-17, D-18) — the appointment reminder
 * producer, riding Phase 7's EXISTING `WhatsAppReminderTask` pipeline
 * (`ReminderTaskRepository`) rather than a parallel messaging mechanism.
 *
 * D-17 forbids a parallel mechanism: this file never sends a message
 * (`grep -Ec 'sendMessage|providerPort|twilio|whatsappProvider'` on this
 * file is `0`) and never declares a second `WhatsAppReminderTask`-shaped
 * table (`APPOINTMENT_REMINDER` is a fourth `kind` value on Phase 7's own
 * table). Phase 7's daily sweep (`reminder-sweep.job.ts`) is the only thing
 * that ever dispatches a `WhatsAppReminderTask` row — this service only
 * discovers appointments and upserts/cancels rows for the sweep to find.
 *
 * D-18's cadence (one day before, and the day of) is registered on Phase
 * 7's EXISTING daily sweep, not the 5-minute scheduling sweep from plan
 * 08-09 -- those are different granularities for different purposes.
 *
 * No escalation (RESEARCH § Assumptions Log A5, § Open Questions 1):
 * unlike Phase 7's FOLLOW_UP/VACCINE_DUE/DEWORMING_DUE reminders, an
 * appointment reminder never resends and never caps to
 * `CAPPED_NEEDS_ACTION`. The owner already committed to a specific time by
 * booking the appointment; a missed reply to a reminder about a
 * *scheduled* appointment is a different situation from a missed reply to
 * a reminder asking the owner to book a follow-up visit in the first
 * place, and RESEARCH recommends "no escalation" as Beta's default for
 * exactly this reason. This is a deliberate scope decision, not an
 * oversight -- see 08-10-SUMMARY.md.
 */

import { addDaysIST, getTodayIST } from '../../lib/ist-date.js';
import type { ReminderTaskRepository } from '../whatsapp/reminders/reminder-task.repository.js';
import type { WhatsAppRepository } from '../whatsapp/whatsapp.repository.js';
import type { AppointmentRepository } from './appointment.repository.js';

const SOURCE_TYPE = 'APPOINTMENT';
const REMINDER_KIND = 'APPOINTMENT_REMINDER';

export interface AppointmentReminderDiscoveryReport {
  advanceCreated: number;
  onDateCreated: number;
  skipped: number;
}

export class AppointmentReminderService {
  constructor(
    private readonly taskRepo: ReminderTaskRepository,
    private readonly whatsappRepo: WhatsAppRepository,
    private readonly appointments: AppointmentRepository,
  ) {}

  /**
   * D-18: ADVANCE fires one IST calendar day before the appointment,
   * ON_DATE fires on the appointment's own IST calendar day -- identical in
   * shape to Phase 7's D-01 two-touch cadence, computed independently here
   * rather than through `WA_REMINDER_LEAD_DAYS` (that map is keyed to
   * Phase 7's three clinical-record kinds; an appointment's lead time is
   * always exactly one day, never configurable per kind).
   *
   * Runs once per overall sweep (no `clinicId` parameter) -- the appointment
   * table is queried across every clinic in one pass, matching
   * `AppointmentRepository`'s three worker-only sweep queries'
   * cross-tenant convention, NOT Phase 7's own per-clinic
   * `ReminderSourceRepository` convention.
   */
  async discoverAppointmentReminders(now: Date): Promise<AppointmentReminderDiscoveryReport> {
    const advanceDay = addDaysIST(getTodayIST(now), 1);
    const onDateDay = getTodayIST(now);

    const advance = await this.discoverForDay(advanceDay, 'ADVANCE');
    const onDate = await this.discoverForDay(onDateDay, 'ON_DATE');

    return {
      advanceCreated: advance.created,
      onDateCreated: onDate.created,
      skipped: advance.skipped + onDate.skipped,
    };
  }

  private async discoverForDay(
    day: Date,
    touch: 'ADVANCE' | 'ON_DATE',
  ): Promise<{ created: number; skipped: number }> {
    const dayEnd = addDaysIST(day, 1);
    const appointments = await this.appointments.findRemindableAppointments(day, dayEnd);

    let created = 0;
    let skipped = 0;

    for (const appointment of appointments) {
      // D-17: reuse Phase 7's existing consent lookup rather than
      // reimplementing the STOP-opt-out check. Unlike Phase 7's own sweep
      // (which creates the task and only cancels it at send time), this
      // discovery skips creating the task at all for an opted-out owner --
      // an equally valid, simpler application of the same underlying rule.
      const pref = await this.whatsappRepo.getOwnerPreference(appointment.clinicId, appointment.ownerId);
      if (pref?.remindersOptedOut) {
        skipped += 1;
        continue;
      }

      const existing = await this.taskRepo.findByKey(
        appointment.clinicId,
        SOURCE_TYPE,
        appointment.id,
        REMINDER_KIND as never,
        touch,
      );
      if (existing) {
        // Idempotent re-run: the unique key already has a row for this
        // appointment/touch (RESEARCH Pattern 5's idempotency guarantee).
        continue;
      }

      // D-21: an appointment may have more than one pet; `WhatsAppReminderTask.petId`
      // is a single required column, so the first pet on the appointment is
      // used. Recorded in 08-10-SUMMARY.md as a documented scope decision.
      const petId = appointment.pets[0]?.petId;
      if (!petId) {
        continue;
      }

      await this.taskRepo.create(appointment.clinicId, {
        ownerId: appointment.ownerId,
        petId,
        kind: REMINDER_KIND as never,
        touch,
        sourceType: SOURCE_TYPE,
        sourceId: appointment.id,
        sourceLabel: null,
        dueDate: appointment.scheduledFor,
        scheduledFor: day,
      });
      created += 1;
    }

    return { created, skipped };
  }

  /**
   * Transitions every `PENDING`/`SENT` `WhatsAppReminderTask` row for this
   * appointment to `CANCELLED`, mirroring Phase 7's own superseded-source
   * pattern (`ReminderTaskRepository.cancelActive`) -- no new cancellation
   * mechanism. Called from plan 08-07's `onRescheduled`/`onCancelled`
   * hooks (wired at construction time by plan 08-11's routes plugin, not
   * here -- see 08-10-SUMMARY.md for exactly what 08-11 must do).
   */
  async cancelPendingForAppointment(appointmentId: string, clinicId: string): Promise<number> {
    const result = await this.taskRepo.cancelActive(clinicId, SOURCE_TYPE, appointmentId);
    return (result as { count: number }).count;
  }
}
