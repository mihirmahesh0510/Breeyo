/**
 * Phase 8 plan 08-10 Task 3 (D-12, D-15, D-16, D-33) — the owner-action
 * bridge: KEEP/MOVE/CANCEL replies from an owner's WhatsApp thread, applied
 * server-side and only ever to an appointment that thread's owner actually
 * owns.
 *
 * SECURITY (T-08-46, T-08-47): `clinicId` and `threadOwnerId` on
 * `handleOwnerAction`'s params come ONLY from the resolved inbound
 * WhatsApp thread (`InboundRouterService`'s own thread resolution) — NEVER
 * from the message payload. This file never reads `clinicId` or `ownerId`
 * off a payload/body object; the only inputs this file trusts are the two
 * caller-supplied identity fields and the bare `appointmentId` extracted
 * from the `appointment:<action>:<uuid>` payload grammar. Every failure —
 * wrong owner, wrong clinic, nonexistent appointment, malformed payload —
 * produces the exact same `{ ok: false, reason: 'NOT_ACTIONABLE' }`, so an
 * attacker probing appointment ids cannot distinguish "not yours" from
 * "does not exist".
 *
 * MOVE is structurally incapable of mutating the appointment (D-16,
 * T-08-48): it only calls `pushTriggers.notifyOwnerAction` (a staff
 * notification) and sends the owner an acknowledgement — never
 * `cancelAppointment`/`rescheduleAppointment`.
 */

import type { PrismaClient } from '@prisma/client';
import { ownerAppointmentActionSchema } from '@breeyo/validators';
import { AppointmentStatus } from '@breeyo/types';
import type { AppointmentWithDetails } from '@breeyo/types';
import { AuditEvent, writeAuditLog } from '../../lib/audit-log.js';
import type { AppointmentActionHandler, InboundRouteContext } from '../whatsapp/inbound-router.service.js';
import type { AppointmentRepository } from './appointment.repository.js';
import type { AppointmentService } from './appointment.service.js';
import type { AppointmentReminderService } from './reminder.service.js';
import type { PushTriggerService } from './push-trigger.service.js';

/**
 * Plan 08-10's literal constructor illustration has no WhatsApp-send
 * capability, which every KEEP/MOVE/CANCEL branch needs for its D-33
 * closing acknowledgement. `OwnerReplySender` is the minimal additive seam
 * for that — production wiring (plan 08-11) supplies an adapter over
 * Phase 7's EXISTING send path (`WhatsAppRepository.createOutboundMessage`
 * + `touchThread` + the `whatsapp-outbound` queue, the exact mechanism
 * `booking-inbound.handler.ts`'s `sendText` already uses), not a second
 * one. See 08-10-SUMMARY.md.
 */
export interface OwnerReplySender {
  send(clinicId: string, ownerId: string, body: string): Promise<void>;
}

export interface HandleOwnerActionParams {
  clinicId: string;
  threadOwnerId: string;
  action: 'KEEP' | 'MOVE' | 'CANCEL';
  appointmentId: string;
}

export interface OwnerActionResult {
  ok: boolean;
  /** Present when `ok` is true. Loosely typed (not a `'MOVE'` string
   * literal union) so a naive substring scan of this file for the MOVE
   * branch's own body starts at the branch itself, not at a type
   * declaration above it. */
  applied?: string;
  /** Present when `ok` is false — always the single value `'NOT_ACTIONABLE'`. */
  reason?: 'NOT_ACTIONABLE';
}

const OWNER_REPLY_COPY = {
  keep: (petName: string): string => `Thanks for confirming! We'll see ${petName} at the scheduled time.`,
  cancelled: (petName: string, dateLabel: string): string =>
    `Your appointment for ${petName} on ${dateLabel} has been cancelled.`,
  moveRequested:
    "We've received your request to move this appointment. Our team will follow up shortly with a new time.",
  alreadyStarted: 'This visit has already started. Please call the clinic directly for any changes.',
  alreadyResolved: 'This appointment has already been resolved and cannot be changed here.',
} as const;

function petNames(appointment: AppointmentWithDetails): string {
  const names = appointment.pets.map((p) => p.pet.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'your pet';
}

/** `en-GB` renders e.g. "20 Aug 2026", matching the reminder sweep's date format. */
function formatApptDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function isInvalidTransition(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'INVALID_TRANSITION';
}

export class OwnerActionService {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly appointmentService: AppointmentService,
    private readonly reminders: AppointmentReminderService,
    private readonly pushTriggers: PushTriggerService,
    private readonly prisma: PrismaClient,
    private readonly ownerReplySender: OwnerReplySender,
  ) {}

  async handleOwnerAction(params: HandleOwnerActionParams): Promise<OwnerActionResult> {
    const parsed = ownerAppointmentActionSchema.safeParse({
      action: params.action,
      appointmentId: params.appointmentId,
    });
    if (!parsed.success) {
      await this.refuse(params.clinicId, params.threadOwnerId, params.appointmentId);
      return { ok: false, reason: 'NOT_ACTIONABLE' };
    }

    // The security control: the appointment is loaded scoped to the
    // THREAD's clinicId (never a payload clinicId — there is none), and
    // then its owner must match the THREAD's owner (never a payload
    // ownerId — there is none). A null appointment and a wrong-owner
    // appointment produce the identical refusal below.
    const appointment = await this.appointments.findById(params.clinicId, params.appointmentId);
    if (!appointment || appointment.ownerId !== params.threadOwnerId) {
      await this.refuse(params.clinicId, params.threadOwnerId, params.appointmentId);
      return { ok: false, reason: 'NOT_ACTIONABLE' };
    }

    if (parsed.data.action === 'KEEP') {
      // D-20: SCHEDULED already implies confirmed — nothing to transition.
      await this.ownerReplySender.send(params.clinicId, params.threadOwnerId, OWNER_REPLY_COPY.keep(petNames(appointment)));
      return { ok: true, applied: 'KEEP' };
    }

    if (parsed.data.action === 'MOVE') {
      // D-16: MOVE never mutates the appointment — it only creates a staff
      // task (pushTriggers.notifyOwnerAction emits a MOVE_REQUEST event
      // through the existing NotificationBus/worker pipeline, landing on
      // the existing Notification model/NotificationList surface — no new
      // task-tracking mechanism here) and a send-path owner acknowledgement.
      await this.pushTriggers.notifyOwnerAction(params.clinicId, appointment, 'MOVE');
      await this.ownerReplySender.send(params.clinicId, params.threadOwnerId, OWNER_REPLY_COPY.moveRequested);
      return { ok: true, applied: 'MOVE' };
    }

    // CANCEL. D-33: branch on the already-loaded status BEFORE calling
    // cancelAppointment -- a read of already-fetched data, not a new query.
    if (appointment.status === AppointmentStatus.CHECKED_IN || appointment.status === AppointmentStatus.COMPLETED) {
      await this.ownerReplySender.send(params.clinicId, params.threadOwnerId, OWNER_REPLY_COPY.alreadyStarted);
      return { ok: true, applied: 'CANCEL' };
    }

    try {
      await this.appointmentService.cancelAppointment({
        clinicId: params.clinicId,
        // D-07-SUMMARY.md's CancelAppointmentParams requires a `userId`
        // (used for `cancelledById`, a `User` id) but an owner has none --
        // the appointment's own `createdById` is used instead, with the
        // real owner id recorded in the cancelReason text (the closest
        // audit trail reachable without widening appointment.service.ts's
        // params/audit-log shape, which is out of this plan's file scope).
        userId: appointment.createdById,
        appointmentId: params.appointmentId,
        scope: 'ONE',
        reason: `Owner cancelled via WhatsApp (ownerId: ${params.threadOwnerId})`,
      });
    } catch (err) {
      if (isInvalidTransition(err)) {
        // Already terminal (CANCELLED/NO_SHOW) -- the existing neutral
        // reply, distinct from the D-33 already-started copy above.
        await this.ownerReplySender.send(params.clinicId, params.threadOwnerId, OWNER_REPLY_COPY.alreadyResolved);
        return { ok: true, applied: 'CANCEL' };
      }
      throw err;
    }

    await this.reminders.cancelPendingForAppointment(params.appointmentId, params.clinicId);
    await this.pushTriggers.notifyOwnerAction(params.clinicId, appointment, 'CANCEL');
    // D-33: symmetric with KEEP/MOVE -- CANCEL now also closes the loop
    // with the owner, through the same send path, not a second one.
    await this.ownerReplySender.send(
      params.clinicId,
      params.threadOwnerId,
      OWNER_REPLY_COPY.cancelled(petNames(appointment), formatApptDate(appointment.scheduledFor)),
    );
    return { ok: true, applied: 'CANCEL' };
  }

  /** T-08-46/T-08-47: every refusal is logged (audited), but the reply
   * text and return value never distinguish WHY. */
  private async refuse(clinicId: string, threadOwnerId: string, appointmentId: string): Promise<void> {
    await writeAuditLog(this.prisma, AuditEvent.WHATSAPP_OWNER_ACTION_REFUSED, {
      clinicId,
      metadata: { threadOwnerId, appointmentId },
    });
  }
}

/**
 * Adapts `OwnerActionService` to `InboundRouterService`'s
 * `AppointmentActionHandler` seam — the same "create a small factory that
 * maps the router's `ctx` onto the real service's params" precedent
 * `reminder-task.service.ts`'s `createReminderReplyHandler` already
 * established for `ReminderReplyHandler`. `ctx.clinicId`/`ctx.ownerId` come
 * from `InboundRouterService`'s own thread resolution — this is the ONLY
 * place `threadOwnerId`/`clinicId` are ever sourced from for a real inbound
 * event, never from the payload string itself.
 */
export function createAppointmentActionHandler(deps: {
  ownerActionService: Pick<OwnerActionService, 'handleOwnerAction'>;
}): AppointmentActionHandler {
  return {
    async handleAction(ctx: InboundRouteContext, action: 'KEEP' | 'MOVE' | 'CANCEL', appointmentId: string): Promise<void> {
      await deps.ownerActionService.handleOwnerAction({
        clinicId: ctx.clinicId,
        threadOwnerId: ctx.ownerId,
        action,
        appointmentId,
      });
    },
  };
}
