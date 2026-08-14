/**
 * WHA-01 / D-01 to D-05, D-28 — the bounded reminder escalation state
 * machine (07-RESEARCH § Pattern 5).
 *
 * Two touches (D-01/D-02) are two ROWS (`touch = 'ADVANCE' | 'ON_DATE'`),
 * never one row with a counter — this keeps the ADVANCE touch's escalation
 * independent of the ON_DATE touch's, which is exactly what the D-28
 * collision guard below needs to reason about.
 *
 * State machine:
 *   PENDING --send--> SENT --inbound reply--> REPLIED           (terminal)
 *                       |
 *                       +-- nextAttemptAt passed & attemptCount < max --> SENT (resend)
 *                       |
 *                       +-- attemptCount >= max & no reply --> CAPPED_NEEDS_ACTION (terminal)
 *   PENDING/SENT --source superseded--> CANCELLED               (terminal)
 *
 * Anti-Pattern A5: escalation-on-no-reply is BUSINESS retry measured in days
 * and lives entirely in this file / `WhatsAppReminderTask` rows. Provider
 * delivery-failure retry is TECHNICAL retry measured in seconds and lives in
 * BullMQ job `attempts`/backoff (`whatsapp-queue.ts`'s `WA_JOB_OPTIONS`).
 * They must never be the same mechanism — `capForNonRetryableFailure` below
 * caps a task WITHOUT incrementing `attemptCount`, so a bad phone number
 * cannot silently burn one of the owner's two chances.
 *
 * This service never sends a WhatsApp message itself — the actual
 * `WhatsAppService.sendTemplate` call is the sweep's (Task 3) responsibility,
 * so a bug here can transition task state incorrectly but can never bypass
 * the D-10/D-11 STOP gate or the D-13 consent audit that only the send path
 * enforces.
 */

import type { PrismaClient } from '@prisma/client';
import {
  WA_ESCALATION,
  WA_REMINDER_LEAD_DAYS,
  type WaReminderKind,
  type WaReminderTouch,
  type WaTemplateKey,
} from '@breeyo/types';
import { addDaysIST, getTodayIST } from '../../../lib/ist-date.js';
import { WA_REMINDER_KIND_TO_TEMPLATE } from '../template-registry.js';
import type { WhatsAppRepository } from '../whatsapp.repository.js';
import type { ReminderReplyHandler, ReminderReplyContext } from '../inbound-router.service.js';
import type { ReminderSourceRow } from './reminder-source.repository.js';
import type { ReminderTaskRepository } from './reminder-task.repository.js';

/**
 * D-05: the ONLY map from an automated reminder kind to a template key,
 * re-exposed here so callers of this module never need to import
 * `template-registry.js` directly for this one lookup. Exactly three
 * entries — the sixth (manual-only) template has no key in
 * `WaReminderKind` at all, so it is structurally unreachable from this
 * function.
 */
export function templateKeyForKind(kind: WaReminderKind): WaTemplateKey {
  return WA_REMINDER_KIND_TO_TEMPLATE[kind];
}

function taskNotFoundError() {
  const error = new Error('WhatsApp reminder task not found') as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 404;
  error.code = 'REMINDER_TASK_NOT_FOUND';
  return error;
}

/** Compares two dates by their IST calendar day, not by instant equality —
 * `dueDate`/`scheduledFor`/`lastAttemptAt` may carry different time-of-day
 * components even when they fall on the same IST date. */
function isSameISTDay(a: Date, b: Date): boolean {
  return getTodayIST(a).getTime() === getTodayIST(b).getTime();
}

/**
 * D-28: the recommended escalation interval (`WA_ESCALATION.intervalDays`,
 * 3 days) equals the vaccine/deworming lead time
 * (`WA_REMINDER_LEAD_DAYS.VACCINE_DUE` / `DEWORMING_DUE`, also 3 days), so an
 * unanswered ADVANCE touch's escalation resend lands exactly on the due
 * date — the SAME day the independent ON_DATE touch sends its own first
 * message. Without this guard the owner would receive two separate reminder
 * messages about the same source/kind on the due date. Only ADVANCE-touch
 * escalation can collide this way: ON_DATE is the later touch and has no
 * sibling scheduled after it, so this returns `false` immediately for any
 * other touch without even querying for a sibling.
 */
export async function isAdvanceEscalationSuppressedBySibling(
  taskRepo: ReminderTaskRepository,
  clinicId: string,
  task: { touch: WaReminderTouch; sourceType: string; sourceId: string; kind: WaReminderKind },
  today: Date,
): Promise<boolean> {
  if (task.touch !== 'ADVANCE') {
    return false;
  }

  const sibling = await taskRepo.findByKey(clinicId, task.sourceType, task.sourceId, task.kind, 'ON_DATE');
  if (!sibling) {
    return false;
  }

  const scheduledToday = isSameISTDay(sibling.scheduledFor as Date, today);
  const sentToday =
    sibling.state === 'SENT' && !!sibling.lastAttemptAt && isSameISTDay(sibling.lastAttemptAt as Date, today);

  return scheduledToday || sentToday;
}

export class ReminderTaskService {
  constructor(
    private readonly taskRepo: ReminderTaskRepository,
    // Only used to resolve an owner's existing WhatsAppThread by phone, for
    // the D-04 `needsAction` flag/clear — never to send a message (see file
    // header).
    private readonly whatsappRepo: WhatsAppRepository,
    // Raw admin client, matching `WhatsAppService`/`WhatsAppRepository`'s own
    // constructors — used ONLY to resolve `PetOwner.mobile` for the thread
    // lookup above; this service otherwise has no direct table access of its
    // own beyond what `ReminderTaskRepository` exposes.
    private readonly prisma: PrismaClient,
  ) {}

  /** D-01, D-02: creates/updates the ADVANCE and ON_DATE rows for one
   * discovered due-date source. Two touches, two rows — never one row with
   * a counter (see file header). */
  async upsertTasksForSource(clinicId: string, source: ReminderSourceRow): Promise<void> {
    const leadDays = WA_REMINDER_LEAD_DAYS[source.kind];
    const advanceScheduledFor = addDaysIST(source.dueDate, -leadDays);

    await this.upsertTouch(clinicId, source, 'ADVANCE', advanceScheduledFor);
    await this.upsertTouch(clinicId, source, 'ON_DATE', source.dueDate);
  }

  private async upsertTouch(
    clinicId: string,
    source: ReminderSourceRow,
    touch: WaReminderTouch,
    scheduledFor: Date,
  ): Promise<void> {
    const existing = await this.taskRepo.findByKey(clinicId, source.sourceType, source.sourceId, source.kind, touch);

    if (existing) {
      // Only a still-PENDING row's schedule may move — an already-SENT row
      // is history and must not be rewritten retroactively.
      if (existing.state === 'PENDING') {
        await this.taskRepo.updateSchedule(clinicId, existing.id, {
          dueDate: source.dueDate,
          scheduledFor,
        });
      }
      return;
    }

    await this.taskRepo.create(clinicId, {
      ownerId: source.ownerId,
      petId: source.petId,
      kind: source.kind,
      touch,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel,
      dueDate: source.dueDate,
      scheduledFor,
    });
  }

  async findDispatchable(clinicId: string, today: Date) {
    return this.taskRepo.findDispatchable(clinicId, today);
  }

  /** D-03: PENDING->SENT (first send) or SENT->SENT (escalation resend) —
   * the same transition, since a resend is just another attempt at the same
   * touch. `attemptCount` is read from the current row rather than assumed,
   * so this is safe to call from either the dispatch phase or the escalate
   * phase of the sweep. */
  async markSent(clinicId: string, taskId: string): Promise<void> {
    const task = await this.taskRepo.findById(clinicId, taskId);
    if (!task) {
      return;
    }

    const now = new Date();
    const attemptCount = (task.attemptCount as number) + 1;
    const nextAttemptAt = addDaysIST(now, WA_ESCALATION.intervalDays);

    await this.taskRepo.markSent(clinicId, taskId, {
      attemptCount,
      lastAttemptAt: now,
      nextAttemptAt,
    });
  }

  /** Returns every SENT task whose `nextAttemptAt` has passed — including
   * ones already at the escalation cap, so the sweep's branch (attemptCount
   * >= max -> cap; otherwise -> resend) has something to act on either way. */
  async findEscalatable(clinicId: string, now: Date) {
    return this.taskRepo.findEscalatable(clinicId, now);
  }

  /** D-28: exposed as a service method so callers that already hold a
   * `ReminderTaskService` (rather than a bare repository) don't need a
   * second import — delegates to the standalone function above. */
  async isEscalationSuppressedBySibling(
    clinicId: string,
    task: { touch: WaReminderTouch; sourceType: string; sourceId: string; kind: WaReminderKind },
    today: Date,
  ): Promise<boolean> {
    return isAdvanceEscalationSuppressedBySibling(this.taskRepo, clinicId, task, today);
  }

  /** D-04: terminal cap at the escalation limit, with the "no reply" reason
   * and the thread `needsAction` flag UI-SPEC's filter chip reads. */
  async cap(clinicId: string, taskId: string, reason: string): Promise<void> {
    const task = await this.taskRepo.findById(clinicId, taskId);
    if (!task) {
      return;
    }
    await this.taskRepo.setCapped(clinicId, taskId, reason);
    await this.flagOwnerThreadNeedsAction(clinicId, task.ownerId as string, 'REMINDER_NO_REPLY');
  }

  /**
   * Anti-Pattern A5: a non-retryable provider failure (an invalid number, an
   * unregistered template) caps the task WITHOUT incrementing
   * `attemptCount` and with a DISTINCT `cappedReason` from D-04's
   * `'NO_REPLY_AFTER_MAX_ATTEMPTS'` — a bad phone number is not "the owner
   * ignored two reminders" and must not consume either of their two chances.
   * Deliberately does not flag thread `needsAction`: a send failure already
   * surfaces via the message's own `FAILED` status (UI-SPEC's Failed filter
   * chip), which is a different signal from D-04's "no reply" one.
   */
  async capForNonRetryableFailure(clinicId: string, taskId: string, reason: string): Promise<void> {
    await this.taskRepo.setCapped(clinicId, taskId, reason);
  }

  /** D-03: a reply always stops escalation. On an already-terminal
   * (CAPPED_NEEDS_ACTION/CANCELLED) task, `repliedAt` is still recorded by
   * the repository (a late reply stays visible) without resurrecting the
   * task (D-04). */
  async markReplied(clinicId: string, taskId: string): Promise<void> {
    await this.taskRepo.setReplied(clinicId, taskId);
  }

  /** Pitfall 3: a newer source record (a fresh vaccination/deworming
   * administration, or a follow-up date change) supersedes an outstanding
   * task for the OLD source id. */
  async cancelSupersededTasks(clinicId: string, sourceType: string, sourceId: string): Promise<void> {
    await this.taskRepo.cancelActive(clinicId, sourceType, sourceId);
  }

  /** UI-SPEC's Mark Resolved action. Sets `acknowledgedAt` (via
   * `ReminderTaskRepository.setAcknowledged`) as the auditable target for
   * that action, then clears the owner thread's `needsAction` flag only when
   * no OTHER capped task remains for that owner — one resolved reminder
   * must not hide a second, still-unresolved one. */
  async acknowledgeTask(clinicId: string, taskId: string, actorUserId: string): Promise<void> {
    const task = await this.taskRepo.findById(clinicId, taskId);
    if (!task) {
      throw taskNotFoundError();
    }

    await this.taskRepo.setAcknowledged(clinicId, taskId, actorUserId);

    const stillCapped = await this.taskRepo.hasOtherCapped(clinicId, task.ownerId as string, taskId);
    if (!stillCapped) {
      await this.clearOwnerThreadNeedsAction(clinicId, task.ownerId as string);
    }
  }

  private async flagOwnerThreadNeedsAction(clinicId: string, ownerId: string, reason: string): Promise<void> {
    const owner = await this.prisma.petOwner.findUnique({ where: { id: ownerId } });
    if (!owner) {
      return;
    }
    const thread = await this.whatsappRepo.findThreadByPhone(clinicId, owner.mobile);
    if (thread) {
      await this.whatsappRepo.flagNeedsAction(clinicId, thread.id as string, reason);
    }
  }

  private async clearOwnerThreadNeedsAction(clinicId: string, ownerId: string): Promise<void> {
    const owner = await this.prisma.petOwner.findUnique({ where: { id: ownerId } });
    if (!owner) {
      return;
    }
    const thread = await this.whatsappRepo.findThreadByPhone(clinicId, owner.mobile);
    if (thread) {
      await this.whatsappRepo.clearNeedsAction(clinicId, thread.id as string);
    }
  }
}

/**
 * Supplies the `ReminderReplyHandler` interface `InboundRouterService`
 * (07-09) declared with a no-op default. `InboundRouterService` already
 * resolves `reminderTaskId` before calling this (its own
 * `attributeReminderTask`, see that file) — when attribution found nothing,
 * `reminderTaskId` is `null` and this handler does nothing, matching D-03's
 * requirement that every reply still runs the handler even when it cannot
 * be attributed to a specific task.
 */
export function createReminderReplyHandler(deps: {
  taskService: ReminderTaskService;
}): ReminderReplyHandler {
  return {
    async markReplied(ctx: ReminderReplyContext): Promise<void> {
      if (!ctx.reminderTaskId) {
        return;
      }
      await deps.taskService.markReplied(ctx.clinicId, ctx.reminderTaskId);
    },
  };
}
