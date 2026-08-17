import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  NotificationType,
  NotificationModule,
  STARTING_SOON_LEAD_MINUTES,
  QUEUE_BACKLOG_THRESHOLD,
  QUEUE_BACKLOG_DEBOUNCE_MINUTES,
  SCHEDULING_TIMEZONE,
} from '@breeyo/types';
import type { NotificationEvent, AppointmentWithDetails } from '@breeyo/types';
import type { NotificationBus } from '../notifications/notification-bus.js';

/**
 * D-27: the three staff push triggers. This service only BUILDS
 * `NotificationEvent`s and hands them to the existing `NotificationBus` --
 * `notification.worker.ts` already does the in-app `Notification` row, the
 * Expo send, and invalid-token pruning (`push.service.ts`). That separation
 * is what makes D-26's "adding an owner recipient later is a new token
 * registration, not a rebuild" true: an owner recipient is just one more
 * entry in `recipientUserIds`.
 *
 * Every title/body string lives in `PUSH_COPY` below, matching
 * `08-UI-SPEC.md` § Push notification copy verbatim, so the 40/120 character
 * limits can be asserted against one place.
 */
const PUSH_COPY = {
  startingSoon: {
    title: (): string => `Appointment in ${STARTING_SOON_LEAD_MINUTES} min`,
    body: (pet: string, owner: string, time: string, vet: string): string =>
      `${pet} (${owner}) at ${time} with Dr. ${vet}.`,
  },
  ownerCancelled: {
    title: (): string => 'Appointment cancelled',
    body: (owner: string, pet: string, time: string): string =>
      `${owner} cancelled ${pet}'s ${time} appointment on WhatsApp.`,
  },
  ownerMoveRequested: {
    title: (): string => 'Reschedule requested',
    body: (owner: string, pet: string, time: string): string =>
      `${owner} wants to move ${pet}'s ${time} appointment. Pick a new time.`,
  },
  queueBacklog: {
    title: (waitingCount: number): string => `${waitingCount} patients waiting`,
    body: (longestWaitMinutes: number): string =>
      `The queue is backing up. Longest wait is ${longestWaitMinutes} min.`,
  },
} as const;

/** IST calendar-day string ("YYYY-MM-DD") for the backlog debounce key. */
function istDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: SCHEDULING_TIMEZONE });
}

/** `en-IN` HH:MM AM/PM in IST, matching the format already used elsewhere
 * for user-facing appointment times (`formatMinutesRange` in
 * `scheduling.constants.ts`). */
function formatTimeIST(date: Date): string {
  return date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: SCHEDULING_TIMEZONE })
    .toUpperCase();
}

function petNames(appointment: AppointmentWithDetails): string {
  return appointment.pets.map((p) => p.pet.name).join(', ');
}

export class PushTriggerService {
  constructor(
    private readonly bus: NotificationBus,
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /** All active clinic members -- staff-only push for Beta (D-26). */
  private async resolveStaffRecipients(clinicId: string): Promise<string[]> {
    const members = await this.prisma.clinicMember.findMany({
      where: { clinicId, isActive: true },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  /**
   * D-27 trigger 1: one push per appointment starting within the lead
   * window, not yet notified. `markNotified` is called AFTER a successful
   * emit -- a transient bus failure then retries on the next sweep instead
   * of permanently losing the notification. Each appointment is wrapped in
   * its own try/catch so one failure never aborts the batch (`from`/`to`
   * are accepted for context/logging parity with the sweep's window, though
   * the appointments themselves are already pre-filtered by the caller's
   * `findStartingSoon` query).
   */
  async notifyUpcomingAppointments(
    from: Date,
    to: Date,
    appointments: AppointmentWithDetails[],
    markNotified: (appointmentId: string) => Promise<void>,
  ): Promise<void> {
    void from;
    void to;

    for (const appointment of appointments) {
      try {
        const recipientUserIds = await this.resolveStaffRecipients(appointment.clinicId);
        const time = formatTimeIST(appointment.scheduledFor);
        const dateStr = istDateString(appointment.scheduledFor);

        const event: NotificationEvent = {
          type: NotificationType.APPOINTMENT_REMINDER,
          module: NotificationModule.SCHEDULING,
          clinicId: appointment.clinicId,
          recipientUserIds,
          title: PUSH_COPY.startingSoon.title(),
          body: PUSH_COPY.startingSoon.body(petNames(appointment), appointment.owner.name, time, appointment.vet.name),
          sendPush: true,
          data: {
            deepLink: `/schedule?date=${dateStr}&appointmentId=${appointment.id}`,
            appointmentId: appointment.id,
          },
        };

        await this.bus.emit(event);
        await markNotified(appointment.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('PushTriggerService.notifyUpcomingAppointments failed for appointment', appointment.id, err);
      }
    }
  }

  /**
   * D-27 trigger 3: the queue-backlog alert. Debounced with a durable Redis
   * `SET NX EX` key scoped per clinic PER IST DAY -- NOT an in-process flag.
   * `infra/aws/` runs multiple ECS tasks, so an in-memory flag would let
   * each task alert independently, and a restart would silently reset it
   * (RESEARCH Pitfall 5). When the `SET ... NX` returns null, the key
   * already existed -- someone else (this task or another) already alerted
   * this clinic today, inside the debounce window, so this call is a no-op.
   */
  async notifyQueueBacklog(clinicId: string, waitingCount: number, longestWaitMinutes: number): Promise<void> {
    if (waitingCount < QUEUE_BACKLOG_THRESHOLD) {
      return;
    }

    const key = `scheduling:backlog-alert:${clinicId}:${istDateString(new Date())}`;
    const set = await this.redis.set(key, '1', 'EX', QUEUE_BACKLOG_DEBOUNCE_MINUTES * 60, 'NX');
    if (set === null) {
      // Already alerted this clinic-day; still inside the debounce window.
      return;
    }

    try {
      const recipientUserIds = await this.resolveStaffRecipients(clinicId);
      const event: NotificationEvent = {
        type: NotificationType.QUEUE_CHANGE,
        module: NotificationModule.SCHEDULING,
        clinicId,
        recipientUserIds,
        title: PUSH_COPY.queueBacklog.title(waitingCount),
        body: PUSH_COPY.queueBacklog.body(longestWaitMinutes),
        sendPush: true,
        data: { deepLink: '/queue' },
      };

      await this.bus.emit(event);
    } catch (err) {
      // Recipient resolution or emit failed after the debounce key was
      // already set -- release it so the next check-in retries instead of
      // silently losing the alert for the rest of the debounce window.
      await this.redis.del(key);
      throw err;
    }
  }

  /**
   * D-27 trigger 2: an owner's WhatsApp MOVE/CANCEL reply (D-16). Plan
   * 08-10's inbound WhatsApp bridge calls this once the auto-apply/staff
   * hand-off decision has been made. Both branches carry `data.appointmentId`
   * so `NotificationList`/`NotificationBadge` (the existing components; no
   * new task-tracking surface per UI-SPEC) can deep-link straight to it.
   */
  async notifyOwnerAction(
    clinicId: string,
    appointment: AppointmentWithDetails,
    action: 'MOVE' | 'CANCEL',
  ): Promise<void> {
    const recipientUserIds = await this.resolveStaffRecipients(clinicId);
    const time = formatTimeIST(appointment.scheduledFor);
    const pet = petNames(appointment);
    const owner = appointment.owner.name;

    const event: NotificationEvent =
      action === 'MOVE'
        ? {
            type: NotificationType.MOVE_REQUEST,
            module: NotificationModule.SCHEDULING,
            clinicId,
            recipientUserIds,
            title: PUSH_COPY.ownerMoveRequested.title(),
            body: PUSH_COPY.ownerMoveRequested.body(owner, pet, time),
            sendPush: true,
            data: { deepLink: '/schedule/move-requests', appointmentId: appointment.id },
          }
        : {
            // No dedicated `NotificationType` exists for "owner cancelled via
            // WhatsApp" (the enum has no such value, and adding one is out of
            // this plan's scope); `SYSTEM` is the closest generic fit and is
            // still correctly scoped to `module: SCHEDULING`.
            type: NotificationType.SYSTEM,
            module: NotificationModule.SCHEDULING,
            clinicId,
            recipientUserIds,
            title: PUSH_COPY.ownerCancelled.title(),
            body: PUSH_COPY.ownerCancelled.body(owner, pet, time),
            sendPush: true,
            data: {
              deepLink: `/schedule?date=${istDateString(appointment.scheduledFor)}`,
              appointmentId: appointment.id,
            },
          };

    await this.bus.emit(event);
  }
}
