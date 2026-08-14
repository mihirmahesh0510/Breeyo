/**
 * WHA-04/WHA-05 — the outbound dispatch worker (D-16, Anti-Pattern A5).
 *
 * `processOutboundJob` is exported as a plain function so tests call it
 * directly, with no live BullMQ `Worker` in the process — the existing
 * `apps/api/src/app.ts:47,90-93` `isTest` guard precedent is what
 * `createOutboundWorker` copies, so a BullMQ worker never runs under
 * `vitest` (07-RESEARCH § Pitfall 7, Anti-Pattern A9).
 *
 * A `WhatsAppMessage.id` is the ONLY thing in a job payload — the row is the
 * source of truth, the job is a nudge (07-RESEARCH § Pattern 2). Loading the
 * message fresh on every attempt is what makes a replayed job safe: if the
 * row already moved past `QUEUED`, this handler does nothing.
 *
 * Business escalation must never be conflated with technical retry
 * (Anti-Pattern A5): a non-retryable failure (an invalid number, an
 * unregistered template) records the failure through the funnel and returns
 * — it never rethrows, and it never touches `WhatsAppReminderTask` state,
 * which stays 07-11's responsibility. A retryable failure does the opposite:
 * it rethrows unmodified so BullMQ's `attempts`/backoff (already configured
 * on the queue via `WA_JOB_OPTIONS`) does the retrying, and the funnel is
 * never called for a merely-technical hiccup.
 *
 * `message.templateKey` selects the send shape (fix for the WHA-03/D-14
 * dispatch gap): a template-keyed message (reminders, invoices, the
 * `booking_confirmation` template) calls `provider.sendTemplate`, unchanged
 * from before. A message with no `templateKey` — the booking flow's
 * interactive pet/slot pickers and its plain-text fallback replies
 * (`booking-inbound.handler.ts`), which only ever carry a `body` and an
 * optional `interactiveOptions` list, never a button set — calls
 * `provider.sendFreeform` instead. Both branches share the same
 * provider-result/failure handling tail via `dispatchSend` below, so the
 * replay-safety, funnel-integration, and retryable/terminal branching stay
 * identical for both send shapes.
 */

import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient, WhatsAppMessage, WhatsAppThread } from '@prisma/client';
import type { WaListRow, WaTemplateKey } from '@breeyo/types';
import { getTemplate } from '../template-registry.js';
import { resolveProvider } from '../providers/provider-registry.js';
import {
  WaSendError,
  type WaProvider,
  type WaSendFreeformCommand,
  type WaSendResult,
  type WaSendTemplateCommand,
} from '../providers/wa-provider.port.js';
import type { WhatsAppRepository } from '../whatsapp.repository.js';
import type { DeliveryStatusService, DeliveryStatusFailure } from '../delivery-status.service.js';

export interface OutboundJobData {
  messageId: string;
}

export interface OutboundWorkerDeps {
  // The admin `PrismaClient` — matching every other WhatsApp collaborator
  // (`WhatsAppRepository`, `DeliveryStatusService`); this worker has no
  // request context.
  prisma: PrismaClient;
  redis: Redis;
  repository: WhatsAppRepository;
  deliveryStatusService: DeliveryStatusService;
  /** For `resolveProvider`'s `ProviderRegistryDeps.simulatorQueue`. */
  simulatorQueue: import('bullmq').Queue;
}

/**
 * A messageId-keyed placeholder `providerMessageId`, assigned when a send
 * fails before any provider ACK (so there is no real `wamid` / `sim.<id>` to
 * key on yet). `DeliveryStatusService.apply` looks a message up BY
 * `providerMessageId` — assigning this first is what lets the funnel record
 * the failure at all. Guaranteed unique because it is derived from the
 * message's own unique id.
 */
function localFailureProviderMessageId(messageId: string): string {
  return `local-failed.${messageId}`;
}

async function setProviderMessageId(
  prisma: PrismaClient,
  messageId: string,
  providerMessageId: string,
): Promise<void> {
  // A non-status field. `DeliveryStatusService.apply` remains the only path
  // that mutates `WhatsAppMessage.status` — this write only assigns the key
  // that lookup depends on, before calling it.
  await prisma.whatsAppMessage.update({ where: { id: messageId }, data: { providerMessageId } });
}

/**
 * D-16: an invalid-number failure also flips the owner's `numberStatus` to
 * `INVALID` so UI-SPEC's warning renders. `WhatsAppRepository.markNumberInvalid`
 * requires a staff `actorUserId` (it is designed for an authenticated staff
 * action), which an automated worker does not have — so this reads the
 * current preference and calls `upsertOwnerPreference` instead, preserving
 * whatever opt-out state already exists and only changing `numberStatus`.
 */
async function markNumberInvalid(
  repository: WhatsAppRepository,
  clinicId: string,
  ownerId: string,
): Promise<void> {
  const existing = await repository.getOwnerPreference(clinicId, ownerId);
  await repository.upsertOwnerPreference(clinicId, ownerId, {
    remindersOptedOut: existing?.remindersOptedOut ?? false,
    source: (existing?.optedOutSource as 'OWNER_STOP' | 'STAFF' | null) ?? 'STAFF',
    numberStatus: 'INVALID',
  });
}

/**
 * Shared result/failure tail for both send shapes (template and freeform):
 * records the provider ACK, applies `SENT` through the delivery-status
 * funnel on success, and on a `WaSendError` either rethrows (retryable) or
 * records `FAILED` through the funnel (terminal) — identically regardless
 * of which `provider.send*` method produced the result.
 */
async function dispatchSend(
  deps: OutboundWorkerDeps,
  message: WhatsAppMessage,
  thread: WhatsAppThread,
  send: () => Promise<WaSendResult>,
): Promise<void> {
  try {
    const result = await send();

    await setProviderMessageId(deps.prisma, message.id, result.providerMessageId);

    if (result.resolvedWaId) {
      // `resolvedWaId` lives on `WhatsAppThread`, not `WhatsAppMessage` —
      // Meta's `contacts[].wa_id` describes the CONTACT the thread is with,
      // not any one message, and that is where the schema (07-02) put it.
      await deps.prisma.whatsAppThread.update({
        where: { id: thread.id },
        data: { resolvedWaId: result.resolvedWaId },
      });
    }

    await deps.deliveryStatusService.apply(result.providerMessageId, 'SENT', null, result.acceptedAt);
  } catch (err) {
    if (!(err instanceof WaSendError)) {
      throw err;
    }

    if (err.retryable) {
      // A technical hiccup (provider timeout, 5xx, rate limit). Rethrow
      // unmodified so BullMQ's configured `attempts`/backoff (WA_JOB_OPTIONS)
      // retries it — the funnel is not involved for a retryable failure.
      throw err;
    }

    // Terminal: a capability breach, an invalid number, an unregistered
    // template. Recording it costs one funnel call, never a retry attempt,
    // and never touches reminder-task escalation state (Anti-Pattern A5) —
    // that stays 07-11's responsibility.
    const providerMessageId = localFailureProviderMessageId(message.id);
    await setProviderMessageId(deps.prisma, message.id, providerMessageId);

    const failure: DeliveryStatusFailure = {
      code: err.code,
      providerCode: err.providerCode,
      reason: err.message,
    };
    await deps.deliveryStatusService.apply(providerMessageId, 'FAILED', failure, new Date());

    if (err.code === 'NOT_ON_WHATSAPP') {
      await markNumberInvalid(deps.repository, message.clinicId, thread.ownerId as string);
    }
  }
}

function buildTemplateCommand(def: ReturnType<typeof getTemplate>, message: WhatsAppMessage, thread: WhatsAppThread): WaSendTemplateCommand {
  return {
    to: thread.waPhone,
    templateKey: def.key,
    languageCode: def.cloud.languageCode,
    variables: (message.renderedVariables ?? {}) as Record<string, string>,
    buttons: def.buttons,
    // Our own row id — enables both provider-side and our-side idempotency.
    idempotencyKey: message.id,
  };
}

/**
 * The booking flow (`booking-inbound.handler.ts`) is, today, the only
 * producer of a `templateKey`-less outbound message, and it only ever
 * builds an interactive LIST (the pet/slot pickers) or plain text (the
 * no-working-hours/fully-booked/no-pets/slot-taken fallbacks) — never a
 * button set. `buttons` is therefore always `undefined` here; a future
 * producer of a freeform button send would need this function extended,
 * not `booking-inbound.handler.ts` alone.
 */
function buildFreeformCommand(message: WhatsAppMessage, thread: WhatsAppThread): WaSendFreeformCommand {
  const rows = (message.interactiveOptions ?? null) as unknown as WaListRow[] | null;
  return {
    to: thread.waPhone,
    text: message.body,
    list: rows && rows.length > 0 ? { buttonText: 'Choose', rows } : undefined,
    buttons: undefined,
    serviceWindowExpiresAt: thread.serviceWindowExpiresAt,
    // Our own row id — enables both provider-side and our-side idempotency.
    idempotencyKey: message.id,
  };
}

/**
 * Dispatches one QUEUED message. Exported as a plain function (Pitfall 7) —
 * `createOutboundWorker` below is the only caller that wraps it in a live
 * BullMQ consumer.
 */
export async function processOutboundJob(
  deps: OutboundWorkerDeps,
  jobData: OutboundJobData,
): Promise<void> {
  const message = await deps.prisma.whatsAppMessage.findUnique({ where: { id: jobData.messageId } });
  if (!message) {
    // The row is gone or never existed. Nothing to dispatch, nothing to
    // retry — a thrown error here would just cost BullMQ attempts on a
    // message that will never exist.
    return;
  }

  if (message.status !== 'QUEUED') {
    // Replay safety: a redelivered/duplicated job for a message that has
    // already progressed (SENT, FAILED, ...) does nothing.
    return;
  }

  const thread = await deps.prisma.whatsAppThread.findUnique({ where: { id: message.threadId } });
  if (!thread) {
    // Should not happen (a message always has a thread) — defensive, not a
    // retry target.
    return;
  }

  const provider: WaProvider = await resolveProvider(message.clinicId, {
    simulatorQueue: deps.simulatorQueue,
    loadClinicConfig: (clinicId: string) => deps.repository.getOrCreateClinicConfig(clinicId),
  });

  if (message.templateKey) {
    const def = getTemplate(message.templateKey as WaTemplateKey);
    const cmd = buildTemplateCommand(def, message, thread);
    await dispatchSend(deps, message, thread, () => provider.sendTemplate(cmd));
    return;
  }

  // No templateKey: a freeform send (the booking flow's interactive
  // pickers and plain-text fallbacks — see the file header and
  // `buildFreeformCommand`'s doc comment).
  const cmd = buildFreeformCommand(message, thread);
  await dispatchSend(deps, message, thread, () => provider.sendFreeform(cmd));
}

/**
 * Returns `undefined` under `vitest` (Pitfall 7) — copying the `isTest`
 * guard precedent at `apps/api/src/app.ts:47,90-93` — and a real BullMQ
 * `Worker` otherwise. The `limiter` keeps outbound throughput comfortably
 * under Meta's 80 messages/second default cap (T-07-09-08); Meta, not this
 * clinic's traffic, is the ceiling that matters.
 */
export function createOutboundWorker(deps: OutboundWorkerDeps): Worker<OutboundJobData> | undefined {
  if (process.env.NODE_ENV === 'test') {
    return undefined;
  }

  return new Worker<OutboundJobData>(
    'whatsapp-outbound',
    async (job: Job<OutboundJobData>) => {
      await processOutboundJob(deps, job.data);
    },
    {
      connection: deps.redis,
      concurrency: 5,
      limiter: { max: 50, duration: 1000 },
    },
  );
}
