/**
 * WHA-01 / D-01 to D-04 — the single owner of all `WhatsAppReminderTask`
 * Prisma access.
 *
 * Constructed with `fastify.prisma`, matching `WhatsAppRepository` and
 * `VaccinationRepository` — clinicId is an explicit filter on every method,
 * never RLS (07-RESEARCH § Pitfall 5).
 *
 * `findByKey` + `create` (which catches the unique-constraint race, mirroring
 * `WhatsAppRepository.upsertThread`'s pattern) is the idempotency mechanism
 * for `@@unique([clinicId, sourceType, sourceId, kind, touch])` — that
 * constraint, not an application "already ran today?" flag, is what makes a
 * repeated sweep safe.
 */

import type { DbClient } from '../../../lib/prisma-rls.js';
import type { WaReminderKind, WaReminderTouch } from '@breeyo/types';

export interface CreateReminderTaskInput {
  ownerId: string;
  petId: string;
  kind: WaReminderKind;
  touch: WaReminderTouch;
  sourceType: string;
  sourceId: string;
  sourceLabel: string | null;
  dueDate: Date;
  scheduledFor: Date;
}

export interface UpdateScheduleInput {
  dueDate: Date;
  scheduledFor: Date;
}

export interface MarkSentInput {
  attemptCount: number;
  lastAttemptAt: Date;
  nextAttemptAt: Date;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export class ReminderTaskRepository {
  constructor(private readonly prisma: DbClient) {}

  async findByKey(
    clinicId: string,
    sourceType: string,
    sourceId: string,
    kind: WaReminderKind,
    touch: WaReminderTouch,
  ) {
    return this.prisma.whatsAppReminderTask.findFirst({
      where: { clinicId, sourceType, sourceId, kind, touch },
    });
  }

  async findById(clinicId: string, taskId: string) {
    return this.prisma.whatsAppReminderTask.findFirst({ where: { id: taskId, clinicId } });
  }

  /** Create, tolerating a concurrent sweep racing on the compound unique key
   * (mirrors `WhatsAppRepository.upsertThread`'s P2002 re-read). */
  async create(clinicId: string, input: CreateReminderTaskInput) {
    try {
      return await this.prisma.whatsAppReminderTask.create({
        data: {
          clinicId,
          ownerId: input.ownerId,
          petId: input.petId,
          kind: input.kind,
          touch: input.touch,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceLabel: input.sourceLabel,
          dueDate: input.dueDate,
          scheduledFor: input.scheduledFor,
          state: 'PENDING',
          attemptCount: 0,
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return this.findByKey(clinicId, input.sourceType, input.sourceId, input.kind, input.touch);
      }
      throw err;
    }
  }

  /** Only ever called by the service on a still-`PENDING` row — the
   * `state: 'PENDING'` filter is belt-and-braces so a raced concurrent send
   * cannot have its schedule silently rewritten out from under it. */
  async updateSchedule(clinicId: string, taskId: string, input: UpdateScheduleInput) {
    return this.prisma.whatsAppReminderTask.updateMany({
      where: { id: taskId, clinicId, state: 'PENDING' },
      data: { dueDate: input.dueDate, scheduledFor: input.scheduledFor },
    });
  }

  async findDispatchable(clinicId: string, today: Date) {
    return this.prisma.whatsAppReminderTask.findMany({
      where: { clinicId, state: 'PENDING', scheduledFor: { lte: today } },
      include: { pet: { include: { owner: true } } },
    });
  }

  /**
   * Returns every `SENT` task whose `nextAttemptAt` has passed, regardless
   * of `attemptCount` — a task at the escalation cap must still be returned
   * here so the caller's escalate/cap branch (07-RESEARCH § Code Example 6)
   * can decide to cap it. A separate "only below the cap" query would make
   * capping unreachable from this method.
   */
  async findEscalatable(clinicId: string, now: Date) {
    return this.prisma.whatsAppReminderTask.findMany({
      where: { clinicId, state: 'SENT', nextAttemptAt: { lte: now } },
      include: { pet: { include: { owner: true } } },
    });
  }

  /** PENDING->SENT (first send) or SENT->SENT (escalation resend) — same
   * transition either way (D-03). */
  async markSent(clinicId: string, taskId: string, input: MarkSentInput) {
    return this.prisma.whatsAppReminderTask.updateMany({
      where: { id: taskId, clinicId },
      data: {
        state: 'SENT',
        attemptCount: input.attemptCount,
        lastAttemptAt: input.lastAttemptAt,
        nextAttemptAt: input.nextAttemptAt,
      },
    });
  }

  /** Terminal. `reason` is a plain string — `'NO_REPLY_AFTER_MAX_ATTEMPTS'`
   * (D-04) or a distinct provider-failure reason (Anti-Pattern A5) — never a
   * shared enum with BullMQ's own failure codes. */
  async setCapped(clinicId: string, taskId: string, reason: string) {
    return this.prisma.whatsAppReminderTask.updateMany({
      where: { id: taskId, clinicId },
      data: { state: 'CAPPED_NEEDS_ACTION', cappedAt: new Date(), cappedReason: reason },
    });
  }

  /**
   * Always records `repliedAt`. Only transitions `state` to `REPLIED` when
   * the task is not already in a terminal state (`CAPPED_NEEDS_ACTION` /
   * `CANCELLED`) — a late reply on a capped task must stay visible without
   * resurrecting automated sending (D-04).
   */
  async setReplied(clinicId: string, taskId: string) {
    const task = await this.findById(clinicId, taskId);
    if (!task) {
      return null;
    }
    const isTerminal = task.state === 'CAPPED_NEEDS_ACTION' || task.state === 'CANCELLED';
    return this.prisma.whatsAppReminderTask.updateMany({
      where: { id: taskId, clinicId },
      data: { repliedAt: new Date(), ...(isTerminal ? {} : { state: 'REPLIED' }) },
    });
  }

  /** Pitfall 3: PENDING/SENT -> CANCELLED when a newer source record
   * supersedes this one — never touches a REPLIED/CAPPED_NEEDS_ACTION row. */
  async cancelActive(clinicId: string, sourceType: string, sourceId: string) {
    return this.prisma.whatsAppReminderTask.updateMany({
      where: { clinicId, sourceType, sourceId, state: { in: ['PENDING', 'SENT'] } },
      data: { state: 'CANCELLED' },
    });
  }

  /** A single task -> CANCELLED (an opted-out owner's dispatch attempt, for
   * example) rather than left PENDING/SENT to retry indefinitely. */
  async cancel(clinicId: string, taskId: string) {
    return this.prisma.whatsAppReminderTask.updateMany({
      where: { id: taskId, clinicId },
      data: { state: 'CANCELLED' },
    });
  }

  async setAcknowledged(clinicId: string, taskId: string, _actorUserId: string) {
    return this.prisma.whatsAppReminderTask.updateMany({
      where: { id: taskId, clinicId },
      data: { acknowledgedAt: new Date() },
    });
  }

  async hasOtherCapped(clinicId: string, ownerId: string, excludeTaskId: string): Promise<boolean> {
    const count = await this.prisma.whatsAppReminderTask.count({
      where: { clinicId, ownerId, state: 'CAPPED_NEEDS_ACTION', id: { not: excludeTaskId } },
    });
    return count > 0;
  }
}
