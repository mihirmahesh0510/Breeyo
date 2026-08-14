/**
 * WHA-04/WHA-05 — the simulator worker (D-14, D-15, Pattern 10, Pitfall 7).
 *
 * Two job names arrive on the `whatsapp-simulator` queue, both enqueued by
 * `SimulatorProvider` (07-05): `status-transition` drives the
 * `Queued -> Sent -> Delivered` ladder through the exact same
 * `DeliveryStatusService` funnel the Cloud API webhook uses, and
 * `auto-reply` (D-14) builds a deterministic owner reply and pushes it
 * through `InboundRouterService.route` — deliberately the SAME path a real
 * webhook takes, so the simulator exercises the real 24h service-window
 * reset and D-03 reminder-reply logic rather than a shortcut.
 *
 * `processSimulatorJob` is exported as a plain function so tests call it
 * directly, with no live `Worker` in the process. `createSimulatorWorker`
 * copies the same `isTest` guard as `outbound.worker.ts` / the existing
 * `apps/api/src/app.ts:47,90-93` precedent (07-RESEARCH § Pitfall 7,
 * Anti-Pattern A9).
 */

import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import type { WaButtonSpec, WaDeliveryStatus, WaTemplateKey } from '@breeyo/types';
import { buildSimulatedReply } from '../providers/simulator/simulator-reply.js';
import { toWaId } from '../../../lib/phone.js';
import type { DeliveryStatusService } from '../delivery-status.service.js';
import type { InboundRouterService } from '../inbound-router.service.js';

export type SimulatorJobData =
  | { name: 'status-transition'; providerMessageId: string; status: WaDeliveryStatus }
  | { name: 'auto-reply'; providerMessageId: string; templateKey: WaTemplateKey; buttons: WaButtonSpec[] };

export interface SimulatorWorkerDeps {
  // The admin `PrismaClient`, matching every other WhatsApp collaborator —
  // this worker has no request context.
  prisma: PrismaClient;
  redis: Redis;
  deliveryStatusService: DeliveryStatusService;
  inboundRouter: InboundRouterService;
}

/**
 * Handles one simulator job. Exported as a plain function (Pitfall 7) —
 * `createSimulatorWorker` below is the only caller that wraps it in a live
 * BullMQ consumer.
 */
export async function processSimulatorJob(
  deps: SimulatorWorkerDeps,
  jobData: SimulatorJobData,
): Promise<void> {
  if (jobData.name === 'status-transition') {
    await deps.deliveryStatusService.apply(jobData.providerMessageId, jobData.status, null, new Date());
    return;
  }

  // auto-reply (D-14): find the outbound message this reply answers, so the
  // reply can be attributed to the right thread/clinic/owner.
  const outboundMessage = await deps.prisma.whatsAppMessage.findFirst({
    where: { providerMessageId: jobData.providerMessageId },
  });
  if (!outboundMessage) {
    // The outbound message this delayed job was scheduled against no
    // longer resolves (e.g. test isolation, or a wiped dev database) —
    // nothing to reply to.
    return;
  }

  const thread = await deps.prisma.whatsAppThread.findUnique({
    where: { id: outboundMessage.threadId },
  });
  if (!thread) {
    return;
  }

  const replyEvent = buildSimulatedReply({
    outboundProviderMessageId: jobData.providerMessageId,
    from: toWaId(thread.waPhone),
    templateKey: jobData.templateKey,
    buttons: jobData.buttons,
    occurredAt: new Date(),
  });

  // The same path a real Cloud API webhook takes (Pattern 10) — including
  // the 24h service-window reset and the D-03 reminder-reply dispatch —
  // labelled `SIMULATOR` so the thread view attributes it correctly (D-16).
  await deps.inboundRouter.route(replyEvent, outboundMessage.clinicId, 'SIMULATOR');
}

/**
 * Returns `undefined` under `vitest` (Pitfall 7) and a real BullMQ `Worker`
 * otherwise, copying the `isTest` guard precedent at
 * `apps/api/src/app.ts:47,90-93`.
 */
export function createSimulatorWorker(deps: SimulatorWorkerDeps): Worker<SimulatorJobData> | undefined {
  if (process.env.NODE_ENV === 'test') {
    return undefined;
  }

  return new Worker(
    'whatsapp-simulator',
    async (job: Job) => {
      // `SimulatorProvider` enqueues with `queue.add(name, data, opts)` —
      // BullMQ keeps the job name and its data separate, so they are
      // recombined into the single tagged-union shape `processSimulatorJob`
      // expects.
      await processSimulatorJob(deps, { name: job.name, ...job.data } as SimulatorJobData);
    },
    {
      connection: deps.redis,
      concurrency: 5,
    },
  );
}
