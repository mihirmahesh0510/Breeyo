/**
 * WHA-04 — Cloud API webhook: signature verification, GET handshake, and
 * inbound payload normalization.
 *
 * This is the phase's highest-severity security control (T-07-07-01 in the
 * plan's threat model): an unverified webhook would let anyone opt an owner
 * out of reminders or forge a booking confirmation. `verifyMetaSignature`
 * and `handleVerification` reproduce 07-RESEARCH.md § Code Example 3
 * verbatim.
 *
 * A pure translator — no database access, no routing decisions, no
 * `STOP`/booking interpretation. `parseMetaWebhook` must always return an
 * array (never throw) so the caller can always answer Meta with `200`;
 * unsupported shapes become `UNSUPPORTED` events instead of dropped data.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { webhookPayloadSchema } from '@breeyo/validators';
import type { WaDeliveryStatus } from '@breeyo/types';
import { normalizeMetaError, type MetaErrorPayload, type MetaInboundMessage, type MetaStatusObject } from './cloud-api.mapper.js';
import type { WaInboundEvent } from '../wa-provider.port.js';
import { toWaId } from '../../../../lib/phone.js';

// ─── Signature verification (T-07-07-01, T-07-07-02) ───────────────────────

/**
 * Meta sends `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 of the RAW
 * body keyed with the app secret. Must be computed BEFORE JSON parsing, with
 * a timing-safe comparison. Reproduced from 07-RESEARCH.md § Code Example 3
 * verbatim, with the hex decode wrapped so a malformed digest returns
 * `false` instead of throwing — a malformed signature is a rejection, never
 * a 500.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;

  try {
    const provided = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();

    // timingSafeEqual throws on a length mismatch — short-circuit before
    // calling it, so a truncated/malformed digest never reaches it.
    if (provided.length !== expected.length) return false;

    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

/** GET handshake: echo `hub.challenge` only when `hub.mode` is `subscribe` and the verify token matches. */
export function handleVerification(
  query: Record<string, string | undefined>,
  verifyToken: string,
): { status: 200; body: string } | { status: 403; body: string } {
  const mode = query['hub.mode'] ?? query['hub_mode'];
  const token = query['hub.verify_token'] ?? query['hub_verify_token'];
  const challenge = query['hub.challenge'] ?? query['hub_challenge'];

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return { status: 200, body: challenge };
  }
  return { status: 403, body: 'Forbidden' };
}

// ─── Inbound payload normalization ──────────────────────────────────────────

/** The shape of one `entry[].changes[].value` object this phase understands. */
interface MetaWebhookChangeValue {
  messages?: MetaInboundMessage[];
  statuses?: MetaStatusObject[];
}

const STATUS_MAP: Readonly<Record<string, WaDeliveryStatus>> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

/** Meta timestamps are epoch seconds as a string; fall back to "now" on anything unparsable. */
function toDateFromMetaTimestamp(timestamp: string | undefined): Date {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && timestamp !== undefined ? new Date(seconds * 1000) : new Date();
}

/**
 * Normalizes ONE inbound message into a `WaInboundEvent`. Handles all four
 * message shapes: `interactive.button_reply`, the template `button` object
 * with `payload`/`text` (07-RESEARCH Assumption A1 — arrives differently
 * from an interactive button, folded to the SAME `BUTTON_REPLY` shape so the
 * assumption being wrong costs nothing), `interactive.list_reply`, and plain
 * `text.body`. Anything else becomes `UNSUPPORTED`, never a throw.
 */
function parseInboundMessage(message: MetaInboundMessage): WaInboundEvent {
  const providerMessageId = message.id;
  const from = toWaId(message.from);
  const replyToProviderMessageId = message.context?.id ?? null;
  const occurredAt = toDateFromMetaTimestamp(message.timestamp);

  if (message.interactive?.type === 'button_reply') {
    const { id, title } = message.interactive.button_reply;
    return { kind: 'BUTTON_REPLY', providerMessageId, from, payload: id, label: title, replyToProviderMessageId, occurredAt };
  }

  if (message.interactive?.type === 'list_reply') {
    const { id, title } = message.interactive.list_reply;
    return { kind: 'LIST_REPLY', providerMessageId, from, rowId: id, label: title, replyToProviderMessageId, occurredAt };
  }

  if (message.button) {
    return {
      kind: 'BUTTON_REPLY',
      providerMessageId,
      from,
      payload: message.button.payload,
      label: message.button.text,
      replyToProviderMessageId,
      occurredAt,
    };
  }

  if (message.type === 'text' && message.text?.body !== undefined) {
    return { kind: 'TEXT', providerMessageId, from, text: message.text.body, replyToProviderMessageId, occurredAt };
  }

  return { kind: 'UNSUPPORTED', providerMessageId, from, rawType: message.type, occurredAt };
}

/**
 * Normalizes ONE status object into a `WaInboundEvent`, or `null` for a
 * status string this phase does not track (never a throw). Ordering is
 * deliberately NOT enforced here — Meta does not guarantee status order
 * (`read` can arrive before `delivered`); monotonic ranking is the
 * delivery-status funnel's job (07-09, Pattern 9).
 */
function parseStatus(status: MetaStatusObject): WaInboundEvent | null {
  const mappedStatus = STATUS_MAP[status.status];
  if (!mappedStatus) return null;

  const firstError: MetaErrorPayload | undefined = status.errors?.[0];
  const failure = firstError
    ? { code: normalizeMetaError(firstError).code, providerCode: String(firstError.code) }
    : null;

  return {
    kind: 'STATUS',
    providerMessageId: status.id,
    status: mappedStatus,
    failure,
    occurredAt: toDateFromMetaTimestamp(status.timestamp),
  };
}

/**
 * Parses a raw webhook POST body into zero or more `WaInboundEvent` values.
 * Validates through `webhookPayloadSchema` first; a schema failure OR any
 * unexpected shape below returns `[]` rather than throwing, because a
 * webhook endpoint must always be answerable with `200` (T-07-07-05).
 * Flattens every `entry[].changes[].value`, handling both `messages[]` and
 * `statuses[]`. Emits only `WaInboundEvent` values — no Meta field name
 * leaks into the output.
 */
export function parseMetaWebhook(rawBody: unknown): WaInboundEvent[] {
  const parsed = webhookPayloadSchema.safeParse(rawBody);
  if (!parsed.success) return [];

  const events: WaInboundEvent[] = [];

  try {
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value || typeof value !== 'object') continue;

        const typedValue = value as MetaWebhookChangeValue;

        if (Array.isArray(typedValue.messages)) {
          for (const message of typedValue.messages) {
            events.push(parseInboundMessage(message));
          }
        }

        if (Array.isArray(typedValue.statuses)) {
          for (const status of typedValue.statuses) {
            const event = parseStatus(status);
            if (event) events.push(event);
          }
        }
      }
    }
  } catch {
    return [];
  }

  return events;
}
