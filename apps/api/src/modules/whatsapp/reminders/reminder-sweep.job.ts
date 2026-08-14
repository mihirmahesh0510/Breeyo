/**
 * WHA-01 / D-01 to D-04, Pitfalls 1 & 2 — the Redis-coordinated daily
 * reminder sweep (07-RESEARCH § Pattern 4, § Code Example 6).
 *
 * `registerReminderSweep` is called once at boot (behind the existing
 * `if (!isTest)` guard at `app.ts:90-93`, wired up by 07-12) and uses BullMQ
 * `upsertJobScheduler` — deliberately NOT the in-process scheduling library
 * `midnight-archive.ts` uses (see that file's own import), and NOT
 * `queue.add(..., { repeat })` either. That in-process approach fires once
 * per OS process; `infra/aws/` deploys ECS task definitions, so N running
 * tasks would each fire their own timer and send every reminder N times.
 * `upsertJobScheduler` is Redis-coordinated and fires exactly once across
 * every task (Pitfall 2). Belt-and-braces: the `WhatsAppReminderTask`
 * unique key (`clinicId, sourceType, sourceId, kind, touch`) makes even a
 * duplicate sweep run a no-op.
 *
 * `runReminderSweep` performs five phases in order — discover, upsert,
 * dispatch, escalate/cap, requeue-stranded — copying `midnight-archive.ts`'s
 * structural conventions: a doc comment naming the decisions implemented,
 * and a per-clinic try/catch that logs and does not throw, so one clinic's
 * bad data cannot abort the sweep for every other clinic (T-07-11-08).
 *
 * Every automated send goes through `WhatsAppService.sendTemplate` — never
 * directly at the outbound queue — so an automated send passes the exact
 * same D-10/D-11 STOP gate and D-13 consent audit a staff-initiated send
 * does.
 *
 * No BullMQ job in this module is ever created with a multi-hour delay
 * (Pitfall 1): a vaccine due date can be twelve months out, this project's
 * Redis runs `--maxmemory 128mb --maxmemory-policy allkeys-lru`, and LRU
 * eviction does not exempt BullMQ's own keys — a long-horizon delayed job
 * would silently vanish with no error and no reminder. Schedule state lives
 * in `WhatsAppReminderTask.scheduledFor`/`nextAttemptAt` (Postgres); BullMQ
 * here handles only the once-daily trigger and the immediate (non-delayed)
 * outbound send/requeue jobs `WhatsAppService`/`WA_JOB_OPTIONS` already use.
 */

import type { Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import {
  WA_ESCALATION,
  WA_REMINDER_LEAD_DAYS,
  WA_REMINDER_SWEEP_CRON,
  WA_REMINDER_SWEEP_TZ,
  type WaReminderKind,
} from '@breeyo/types';
import { addDaysIST, getTodayIST } from '../../../lib/ist-date.js';
import { WA_JOB_OPTIONS } from '../whatsapp-queue.js';
import type { WaOutboundQueueLike, SendTemplateInput, WaActor } from '../whatsapp.service.js';
import { templateKeyForKind } from './reminder-task.service.js';
import type { ReminderSourceRepository, ReminderSourceRow } from './reminder-source.repository.js';
import type { ReminderTaskRepository } from './reminder-task.repository.js';
import type { ReminderTaskService } from './reminder-task.service.js';

export const WA_REMINDER_SWEEP_JOB = 'whatsapp-reminder-sweep';

export interface SweepReport {
  discovered: number;
  tasksUpserted: number;
  dispatched: number;
  escalated: number;
  capped: number;
  requeued: number;
}

/** The shape `findDispatchable`/`findEscalatable` return: a
 * `WhatsAppReminderTask` row joined with its pet and the pet's owner, which
 * is exactly what building the template variables below needs. */
interface DispatchableTask {
  id: string;
  clinicId: string;
  ownerId: string;
  petId: string;
  kind: string;
  touch: 'ADVANCE' | 'ON_DATE';
  sourceType: string;
  sourceId: string;
  sourceLabel: string | null;
  dueDate: Date;
  attemptCount: number;
  pet: { name: string; owner: { name: string; mobile: string } };
}

/** Narrows `DispatchableTask.kind` (a plain `string` at the Prisma-row
 * boundary) to `WaReminderKind` for the two call sites that need the
 * narrower type (`templateKeyForKind`, `isEscalationSuppressedBySibling`) —
 * `WhatsAppReminderTask.kind` is a real Prisma enum column, so this narrowing
 * always holds for any row this repository can return. */
function asReminderKind(kind: string): WaReminderKind {
  return kind as WaReminderKind;
}

export interface ReminderSweepDeps {
  prisma: Pick<PrismaClient, 'clinic'>;
  sourceRepo: Pick<
    ReminderSourceRepository,
    'findFollowUpsDue' | 'findLatestVaccinationsDue' | 'findLatestDewormingDue' | 'findStrandedQueuedMessages'
  >;
  taskRepo: Pick<ReminderTaskRepository, 'cancel'>;
  taskService: Pick<
    ReminderTaskService,
    'upsertTasksForSource' | 'findDispatchable' | 'findEscalatable' | 'markSent' | 'cap' | 'isEscalationSuppressedBySibling'
  >;
  whatsAppService: { sendTemplate(input: SendTemplateInput, actor: WaActor): Promise<{ messageId: string }> };
  outboundQueue: WaOutboundQueueLike;
}

/** Pitfall 2: Redis-coordinated, fires once across N ECS tasks — never an
 * in-process timer library, never `queue.add(..., { repeat })`. */
export async function registerReminderSweep(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    WA_REMINDER_SWEEP_JOB,
    { pattern: WA_REMINDER_SWEEP_CRON, tz: WA_REMINDER_SWEEP_TZ },
    { name: 'reminder-sweep', data: {} },
  );
}

function isOwnerOptedOutError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'OWNER_OPTED_OUT';
}

/** `en-GB` with these options renders e.g. "14 Aug 2026", matching the
 * date strings already used across this module's tests/fixtures. */
function formatISTDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function buildVariables(task: DispatchableTask): Record<string, string> {
  const dueDateStr = formatISTDate(task.dueDate);
  const ownerName = task.pet.owner.name;
  const petName = task.pet.name;

  switch (task.kind) {
    case 'FOLLOW_UP':
      return {
        owner_name: ownerName,
        pet_name: petName,
        follow_up_date: dueDateStr,
        ...(task.sourceLabel ? { follow_up_reason: task.sourceLabel } : {}),
      };
    case 'VACCINE_DUE':
      return {
        owner_name: ownerName,
        pet_name: petName,
        vaccine_name: task.sourceLabel ?? '',
        due_date: dueDateStr,
      };
    case 'DEWORMING_DUE':
    default:
      return { owner_name: ownerName, pet_name: petName, due_date: dueDateStr };
  }
}

/**
 * Sends one reminder task through the authorized `WhatsAppService` path and
 * advances its state on success. Used for BOTH the first dispatch (task was
 * PENDING) and an escalation resend (task was already SENT) — same
 * mechanic, same STOP gate, same D-13 consent audit either way.
 *
 * An `OWNER_OPTED_OUT` refusal from the send-authorization gate cancels the
 * task rather than leaving it to retry forever: a reminder blocked by an
 * owner's opt-out is done, not merely delayed, so the bounded-escalation
 * guarantee (D-03/D-04) stays true even for opted-out owners.
 */
async function sendReminder(
  deps: ReminderSweepDeps,
  clinicId: string,
  task: DispatchableTask,
): Promise<boolean> {
  const input: SendTemplateInput = {
    ownerId: task.ownerId,
    waPhone: task.pet.owner.mobile,
    templateKey: templateKeyForKind(asReminderKind(task.kind)),
    variables: buildVariables(task),
    contextType: 'REMINDER',
    contextId: task.id,
    petId: task.petId,
  };

  try {
    await deps.whatsAppService.sendTemplate(input, { clinicId, userId: null });
  } catch (err) {
    if (isOwnerOptedOutError(err)) {
      await deps.taskRepo.cancel(clinicId, task.id);
      return false;
    }
    throw err;
  }

  await deps.taskService.markSent(clinicId, task.id);
  return true;
}

async function processClinic(
  deps: ReminderSweepDeps,
  clinicId: string,
  today: Date,
  report: SweepReport,
): Promise<void> {
  // (1) DISCOVER — latest-record-only per Pitfall 3, delegated to
  // ReminderSourceRepository.
  const followUps = await deps.sourceRepo.findFollowUpsDue(clinicId, [
    addDaysIST(today, WA_REMINDER_LEAD_DAYS.FOLLOW_UP), // ADVANCE touch (D-01)
    today, // ON_DATE touch (D-01)
  ]);
  const vaccines = await deps.sourceRepo.findLatestVaccinationsDue(clinicId, [
    addDaysIST(today, WA_REMINDER_LEAD_DAYS.VACCINE_DUE),
    today,
  ]);
  const dewormers = await deps.sourceRepo.findLatestDewormingDue(clinicId, [
    addDaysIST(today, WA_REMINDER_LEAD_DAYS.DEWORMING_DUE),
    today,
  ]);
  const discovered: ReminderSourceRow[] = [...followUps, ...vaccines, ...dewormers];
  report.discovered += discovered.length;

  // (2) UPSERT — unique(clinicId, sourceType, sourceId, kind, touch) makes a
  // repeated sweep run a no-op (one row per touch, never duplicated).
  for (const source of discovered) {
    await deps.taskService.upsertTasksForSource(clinicId, source);
    report.tasksUpserted += 2; // ADVANCE + ON_DATE per source
  }

  // (3) DISPATCH pending
  for (const task of (await deps.taskService.findDispatchable(clinicId, today)) as DispatchableTask[]) {
    const sent = await sendReminder(deps, clinicId, task);
    if (sent) {
      report.dispatched += 1;
    }
  }

  // (4) ESCALATE / CAP (D-03, D-04)
  for (const task of (await deps.taskService.findEscalatable(clinicId, new Date())) as (DispatchableTask & {
    attemptCount: number;
  })[]) {
    if (task.attemptCount >= WA_ESCALATION.maxAttempts) {
      await deps.taskService.cap(clinicId, task.id, 'NO_REPLY_AFTER_MAX_ATTEMPTS');
      report.capped += 1;
      continue; // D-04: no further automated sends, ever
    }

    // D-28: an ADVANCE-touch resend landing the same day as the sibling
    // ON_DATE touch's own first send would double-message the owner (the
    // 3-day escalation interval coincides with the 3-day vaccine/deworming
    // lead time). Skip this sweep run entirely for this task — no send, no
    // attemptCount change — and reconsider it on a future run.
    if (
      await deps.taskService.isEscalationSuppressedBySibling(
        clinicId,
        { touch: task.touch, sourceType: task.sourceType, sourceId: task.sourceId, kind: asReminderKind(task.kind) },
        today,
      )
    ) {
      continue;
    }

    const sent = await sendReminder(deps, clinicId, task);
    if (sent) {
      report.escalated += 1;
    }
  }
}

/** WHA-01: discover -> upsert -> dispatch -> escalate/cap -> requeue
 * stranded, once per clinic, with per-clinic error isolation. */
export async function runReminderSweep(deps: ReminderSweepDeps): Promise<SweepReport> {
  const today = getTodayIST();
  const report: SweepReport = {
    discovered: 0,
    tasksUpserted: 0,
    dispatched: 0,
    escalated: 0,
    capped: 0,
    requeued: 0,
  };

  const clinics = await deps.prisma.clinic.findMany({ select: { id: true } });
  for (const clinic of clinics) {
    try {
      await processClinic(deps, clinic.id, today, report);
    } catch (err) {
      // T-07-11-08: one clinic's bad data must not abort the sweep for
      // every other clinic (midnight-archive.ts's log-don't-throw
      // precedent).
      console.error(`Reminder sweep failed for clinic ${clinic.id}:`, err);
    }
  }

  // (5) REQUEUE stranded QUEUED messages (Pitfall 1). This re-adds an
  // EXISTING message row to the outbound queue with no delay at all — it is
  // not a rescheduled reminder, just a bounded re-drive of a job BullMQ may
  // have lost under `allkeys-lru` pressure.
  const stranded = await deps.sourceRepo.findStrandedQueuedMessages(null, 30);
  for (const message of stranded) {
    try {
      // Hyphen, not colon (07-12 fix — see `whatsapp.service.ts`'s identical
      // comment): a single-colon `jobId` throws BullMQ's own `Custom Id
      // cannot contain :` validation.
      await deps.outboundQueue.add(
        'send',
        { messageId: message.id },
        { jobId: `send-${message.id}`, ...WA_JOB_OPTIONS },
      );
      report.requeued += 1;
    } catch (err) {
      console.error(`Failed to requeue stranded message ${message.id}:`, err);
    }
  }

  return report;
}
