/**
 * WHA-04 — The `WaProvider` port: the WhatsApp anti-corruption layer.
 *
 * Every outbound send, inbound parse, and webhook verification in this
 * codebase crosses this boundary. This is the only lasting output of Phase
 * 7's simulator-only Beta: zero real Meta API calls happen, so the shape of
 * this port is the actual deliverable.
 *
 * Anti-Pattern A1 (07-RESEARCH.md § Anti-Patterns to Avoid): no Meta-shaped
 * JSON (`messaging_product`, `graph.facebook.com`, `components`, etc.) may
 * appear anywhere in this file. All Meta-shaped JSON lives inside
 * `providers/cloud-api/cloud-api.mapper.ts` (plan 07-07) and nowhere else —
 * this file speaks only domain vocabulary.
 *
 * Reproduced from 07-RESEARCH.md § Pattern 1 / § Code Examples 1-2 verbatim
 * where declared there — do not re-derive the shapes below.
 */

import type {
  WaButtonSpec,
  WaCapabilities,
  WaDeliveryStatus,
  WaFailureCode,
  WaListRow,
  WaProviderId,
  WaTemplateKey,
} from '@breeyo/types';

export type { WaButtonSpec, WaListRow };

/**
 * An opaque provider handle for previously uploaded media — never a
 * caller-supplied URL. Cloud API requires a two-step upload (POST
 * /{phone-number-id}/media, then reference by id) and expires media 30 days
 * after last use (07-RESEARCH § Pattern 6). The simulator returns a
 * synthetic id with `expiresAt: null` and stores no bytes.
 */
export interface WaMediaRef {
  providerMediaId: string;
  filename: string;
  mimeType: string;
  expiresAt: Date | null;
}

export interface WaSendTemplateCommand {
  /** E.164 with a leading '+' — see apps/api/src/lib/phone.ts. */
  to: string;
  templateKey: WaTemplateKey;
  languageCode: string;
  /** Named parameters, validated against the template registry (plan 07-06). */
  variables: Record<string, string>;
  media?: WaMediaRef;
  buttons?: WaButtonSpec[];
  /** Our WhatsAppMessage.id — enables both provider-side and our-side idempotency. */
  idempotencyKey: string;
}

export interface WaSendFreeformCommand {
  to: string;
  text: string;
  buttons?: WaButtonSpec[];
  list?: { buttonText: string; rows: WaListRow[] };
  media?: WaMediaRef;
  replyToProviderMessageId?: string;
  /**
   * The calling thread's current 24h customer-service-window expiry, or
   * null if no inbound message has ever been received on this thread. The
   * port has no database access of its own — the caller (the send service
   * that owns `WhatsAppThread`) is the source of truth for this value, and
   * passes it down explicitly so `sendFreeform` can enforce
   * `requiresTemplateOutsideServiceWindow` without the port reaching into
   * Prisma. See `isServiceWindowOpen` in `capability-guards.ts`.
   */
  serviceWindowExpiresAt: Date | null;
  /** Our WhatsAppMessage.id — enables both provider-side and our-side idempotency. */
  idempotencyKey: string;
}

export interface WaSendResult {
  /** wamid on Cloud API; synthetic ('sim.<idempotencyKey>') on the simulator. Opaque to callers. */
  providerMessageId: string;
  /**
   * Provider ACK only — NEVER delivery (Anti-Pattern A3). Meta's send
   * response reports one of `accepted | held_for_quality_assessment |
   * paused`; it never reports `delivered`. Delivery is reported later,
   * asynchronously, out of order, by webhook — see `WaInboundEvent`'s
   * `STATUS` variant. A synchronous DELIVERED result here would bake in a
   * contract Meta cannot satisfy.
   */
  acceptedStatus: 'ACCEPTED' | 'HELD_FOR_REVIEW' | 'PAUSED';
  /** Meta's contacts[].wa_id can differ from the number submitted — store it. */
  resolvedWaId: string | null;
  acceptedAt: Date;
}

/**
 * A boundary-crossing failure. `retryable` distinguishes a technical
 * provider failure (safe for BullMQ `attempts`/backoff) from a capability
 * breach or unregistered template — a programming error, never retryable.
 * See `capability-guards.ts`.
 */
export class WaSendError extends Error {
  constructor(
    readonly code: WaFailureCode,
    readonly providerCode: string | null,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'WaSendError';
  }
}

/**
 * Normalized inbound event union. `parseInbound` must fold BOTH interactive
 * button/list-reply shapes and template quick-reply-button shapes into this
 * union so downstream code (the inbound router, plan 07-08) never sees a
 * provider-specific distinction.
 */
export type WaInboundEvent =
  | {
      kind: 'TEXT';
      providerMessageId: string;
      from: string;
      text: string;
      replyToProviderMessageId: string | null;
      occurredAt: Date;
    }
  | {
      kind: 'BUTTON_REPLY';
      providerMessageId: string;
      from: string;
      payload: string;
      label: string;
      replyToProviderMessageId: string | null;
      occurredAt: Date;
    }
  | {
      kind: 'LIST_REPLY';
      providerMessageId: string;
      from: string;
      rowId: string;
      label: string;
      replyToProviderMessageId: string | null;
      occurredAt: Date;
    }
  | {
      kind: 'STATUS';
      providerMessageId: string;
      status: WaDeliveryStatus;
      failure: { code: WaFailureCode; providerCode: string | null } | null;
      occurredAt: Date;
    }
  | {
      kind: 'UNSUPPORTED';
      providerMessageId: string;
      from: string;
      rawType: string;
      occurredAt: Date;
    };

/**
 * The single WaProvider port. Both `SimulatorProvider` and `CloudApiProvider`
 * implement this and nothing else — application code depends only on this
 * interface plus the `capabilities` data it declares (WHA-04). Application
 * code must never branch on `provider.id === 'simulator'`; it reads
 * `capabilities` instead.
 */
export interface WaProvider {
  readonly id: WaProviderId;
  readonly capabilities: WaCapabilities;

  sendTemplate(cmd: WaSendTemplateCommand): Promise<WaSendResult>;

  /**
   * MUST throw `WaSendError('OUTSIDE_SERVICE_WINDOW')` when the 24-hour
   * customer service window is closed, unless the caller's clinic config has
   * explicitly set the non-default `allowFreeformOutsideWindow` escape
   * hatch.
   */
  sendFreeform(cmd: WaSendFreeformCommand): Promise<WaSendResult>;

  uploadMedia(input: { bytes: Uint8Array; filename: string; mimeType: string }): Promise<WaMediaRef>;

  /** Normalizes BOTH template-button and interactive-button inbound shapes. */
  parseInbound(rawBody: unknown): WaInboundEvent[];

  /** Cloud API: HMAC-SHA256 over the raw body. Simulator: shared-secret compare. */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean;
}
