/**
 * WHA-04 / D-14, D-15, D-16 — the simulator adapter.
 *
 * Anti-Pattern A2 (07-RESEARCH.md): a permissive simulator guarantees the
 * eventual swap to the real Cloud API breaks, because every reminder in the
 * codebase would have been written as free-form text or an oversized
 * interactive message. This adapter is deliberately as strict as Meta:
 * `SIMULATOR_CAPABILITIES` declares the exact same numbers as the real
 * Cloud API (§ Code Example 2), and every send runs the same
 * `capability-guards` the real adapter will run.
 *
 * Status transitions and the D-14 auto-reply arrive asynchronously via
 * delayed BullMQ jobs on the caller-supplied `simulatorQueue`, exactly like
 * a real webhook would arrive later — `sendTemplate`/`sendFreeform` return
 * only an ACK (Anti-Pattern A3).
 */

import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import type { WhatsAppClinicConfig } from '@prisma/client';
import { WA_CAPABILITY_LIMITS, WA_SIMULATOR_DEFAULTS, type WaCapabilities } from '@breeyo/types';
import {
  assertBodyLength,
  assertButtonLimits,
  assertListLimits,
  assertRegisteredTemplate,
  isServiceWindowOpen,
} from '../capability-guards.js';
import {
  WaSendError,
  type WaMediaRef,
  type WaProvider,
  type WaSendFreeformCommand,
  type WaSendResult,
  type WaSendTemplateCommand,
  type WaInboundEvent,
} from '../wa-provider.port.js';
import { toWaId } from '../../../../lib/phone.js';

/**
 * Deliberately identical to the real Cloud API's hard limits
 * (07-RESEARCH § Code Example 2) — sourced from the single
 * `WA_CAPABILITY_LIMITS` constant so the numbers can never drift from the
 * shared vocabulary in `@breeyo/types`. `CloudApiProvider` (plan 07-05
 * Task 3) imports this same object as `CLOUD_API_CAPABILITIES` rather than
 * re-declaring it, so the two adapters can never diverge (WHA-04).
 */
export const SIMULATOR_CAPABILITIES: WaCapabilities = {
  requiresTemplateOutsideServiceWindow: true,
  serviceWindowHours: WA_CAPABILITY_LIMITS.serviceWindowHours,
  requiresRegisteredTemplates: true,
  maxQuickReplyButtons: WA_CAPABILITY_LIMITS.maxQuickReplyButtons,
  maxButtonTitleChars: WA_CAPABILITY_LIMITS.maxButtonTitleChars,
  maxListRows: WA_CAPABILITY_LIMITS.maxListRows,
  maxListRowTitleChars: WA_CAPABILITY_LIMITS.maxListRowTitleChars,
  maxBodyChars: WA_CAPABILITY_LIMITS.maxInteractiveBodyChars,
  supportsInteractiveList: true,
  mediaMaxBytes: WA_CAPABILITY_LIMITS.mediaMaxBytes,
  mediaRequiresUpload: true,
};

export class SimulatorProvider implements WaProvider {
  readonly id = 'simulator' as const;
  readonly capabilities = SIMULATOR_CAPABILITIES;

  constructor(
    private readonly config: WhatsAppClinicConfig,
    private readonly simulatorQueue: Queue,
  ) {}

  async sendTemplate(cmd: WaSendTemplateCommand): Promise<WaSendResult> {
    assertRegisteredTemplate(cmd.templateKey);
    assertButtonLimits(cmd.buttons, this.capabilities);
    this.assertDeliverable();

    const providerMessageId = `sim.${cmd.idempotencyKey}`;
    await this.enqueueStatusTransitions(providerMessageId);

    // D-14: auto-reply so demo threads feel alive, deduped by jobId.
    if (this.config.autoReplyEnabled) {
      await this.simulatorQueue.add(
        'auto-reply',
        { providerMessageId, templateKey: cmd.templateKey, buttons: cmd.buttons ?? [] },
        {
          delay: this.config.autoReplyDelaySeconds * 1000,
          jobId: `auto-reply:${providerMessageId}`,
        },
      );
    }

    return this.buildAck(providerMessageId, cmd.to);
  }

  async sendFreeform(cmd: WaSendFreeformCommand): Promise<WaSendResult> {
    assertButtonLimits(cmd.buttons, this.capabilities);
    assertListLimits(cmd.list?.rows, this.capabilities);
    assertBodyLength(cmd.text, this.capabilities.maxBodyChars);

    // Enforced even in the simulator — otherwise the code that ships is
    // illegal against the real API (Anti-Pattern A2). The escape hatch is
    // explicit, non-default per-clinic config, never a code branch.
    if (
      this.capabilities.requiresTemplateOutsideServiceWindow &&
      !this.config.allowFreeformOutsideWindow &&
      !isServiceWindowOpen(cmd.serviceWindowExpiresAt)
    ) {
      throw new WaSendError(
        'OUTSIDE_SERVICE_WINDOW',
        'SIM_131047',
        false,
        'Free-form message requires an open 24h customer service window',
      );
    }

    this.assertDeliverable();

    const providerMessageId = `sim.${cmd.idempotencyKey}`;
    await this.enqueueStatusTransitions(providerMessageId);

    return this.buildAck(providerMessageId, cmd.to);
  }

  async uploadMedia(input: { bytes: Uint8Array; filename: string; mimeType: string }): Promise<WaMediaRef> {
    if (input.bytes.byteLength > this.capabilities.mediaMaxBytes) {
      throw new WaSendError(
        'TEMPLATE_PARAM_MISMATCH',
        null,
        false,
        `Media of ${input.bytes.byteLength} bytes exceeds the ${this.capabilities.mediaMaxBytes}-byte limit`,
      );
    }

    // Synthetic id, no bytes stored — exercises the same call sequence as
    // the real two-step Cloud API upload without needing a byte store.
    return {
      providerMediaId: `sim-media.${randomUUID()}`,
      filename: input.filename,
      mimeType: input.mimeType,
      expiresAt: null,
    };
  }

  parseInbound(rawBody: unknown): WaInboundEvent[] {
    // The simulator drives its own status transitions and auto-replies
    // directly through the delayed BullMQ jobs above (Pattern 10) rather
    // than by posting a Meta-shaped webhook payload to itself, so this path
    // is not exercised by the simulator's own inbound flow. It exists so
    // `SimulatorProvider` satisfies the `WaProvider` port, and defensively
    // accepts only the simulator's own envelope shape — never a Meta shape
    // (Anti-Pattern A1).
    if (
      typeof rawBody === 'object' &&
      rawBody !== null &&
      'events' in rawBody &&
      Array.isArray((rawBody as { events: unknown }).events)
    ) {
      return (rawBody as { events: WaInboundEvent[] }).events;
    }
    return [];
  }

  verifyWebhook(headers: Record<string, string | undefined>, _rawBody: string): boolean {
    const expected = process.env.WHATSAPP_SIMULATOR_WEBHOOK_SECRET;
    if (!expected) return false;
    const provided = headers['x-simulator-secret'] ?? headers['X-Simulator-Secret'];
    return provided === expected;
  }

  /** D-16: fails deterministically before any queue interaction. */
  private assertDeliverable(): void {
    if (this.config.deliveryMode === 'INVALID_NUMBER') {
      throw new WaSendError(
        'NOT_ON_WHATSAPP',
        'SIM_131026',
        false,
        'Simulated: recipient is not on WhatsApp',
      );
    }
    if (this.config.deliveryMode === 'FAIL') {
      throw new WaSendError('PROVIDER_UNAVAILABLE', 'SIM_500', true, 'Simulated: provider unavailable');
    }
  }

  /**
   * Status transitions arrive asynchronously, exactly like real webhooks
   * (Anti-Pattern A3). `SENT` fires immediately; `DELIVERED` fires after
   * the per-clinic D-16 delay (`DELAYED` mode: 60s, otherwise 2s). Both
   * jobIds dedupe on `providerMessageId`, so a retried caller can never
   * double-enqueue a transition.
   */
  private async enqueueStatusTransitions(providerMessageId: string): Promise<void> {
    const deliverAfterMs =
      this.config.deliveryMode === 'DELAYED'
        ? WA_SIMULATOR_DEFAULTS.delayedDeliverMs
        : WA_SIMULATOR_DEFAULTS.normalDeliverMs;

    await this.simulatorQueue.add(
      'status-transition',
      { providerMessageId, status: 'SENT' },
      { jobId: `status:${providerMessageId}:SENT` },
    );
    await this.simulatorQueue.add(
      'status-transition',
      { providerMessageId, status: 'DELIVERED' },
      { delay: deliverAfterMs, jobId: `status:${providerMessageId}:DELIVERED` },
    );
  }

  private buildAck(providerMessageId: string, to: string): WaSendResult {
    return {
      providerMessageId,
      acceptedStatus: 'ACCEPTED',
      resolvedWaId: toWaId(to),
      acceptedAt: new Date(),
    };
  }
}
