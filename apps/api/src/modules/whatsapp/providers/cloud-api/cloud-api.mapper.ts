/**
 * WHA-04 — Cloud API mapper: domain <-> Meta JSON translation and error
 * normalization.
 *
 * Anti-Pattern A1 (07-RESEARCH.md § Anti-Patterns to Avoid): every
 * Meta-shaped JSON object in the codebase is constructed inside this file
 * and nowhere else. No service, controller or repository may build a
 * `messaging_product` envelope. The six Meta request/response interfaces
 * below are hand-written locally — no third-party WhatsApp Cloud API types
 * package is added (07-RESEARCH § Package Legitimacy Audit rejected the
 * scoped types package under evaluation for low adoption and unwanted type
 * coupling).
 *
 * Pure functions only: no I/O, no `fetch`, no clock beyond `new Date()` for
 * `acceptedAt`. `cloud-api.provider.ts` (07-07 Task 3) is the only caller.
 */

import { WA_CAPABILITY_LIMITS, type WaCapabilities, type WaFailureCode } from '@breeyo/types';
import { assertBodyLength, assertButtonLimits, assertListLimits } from '../capability-guards.js';
import {
  WaSendError,
  type WaButtonSpec,
  type WaListRow,
  type WaSendTemplateCommand,
} from '../wa-provider.port.js';

/**
 * Meta's Cloud API hard limits, expressed as a `WaCapabilities`-shaped
 * object purely so the existing `capability-guards.ts` functions can be
 * reused here without this file importing `CLOUD_API_CAPABILITIES` from the
 * provider (which would create a mapper -> provider -> mapper cycle). The
 * numeric values are the same `WA_CAPABILITY_LIMITS` constants the simulator
 * and the real provider both declare — this object can never drift from
 * them because it is derived from that single constant, not re-typed.
 */
const META_HARD_CAPS: WaCapabilities = {
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

// ─── Hand-written Meta request/response shapes ─────────────────────────────

/** A single named text parameter inside a template's `body` component. */
export interface MetaTemplateTextParameter {
  type: 'text';
  text: string;
  parameter_name: string;
}

/** A `header` component's document parameter — references a prior media upload, never a URL. */
export interface MetaTemplateDocumentParameter {
  type: 'document';
  document: { id: string; filename: string };
}

/** A quick-reply button component's payload parameter. */
export interface MetaTemplateButtonParameter {
  type: 'payload';
  payload: string;
}

export interface MetaTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply';
  index?: number;
  parameters: Array<MetaTemplateTextParameter | MetaTemplateDocumentParameter | MetaTemplateButtonParameter>;
}

export interface MetaSendTemplateBody {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: MetaTemplateComponent[];
  };
}

export interface MetaSendTextBody {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: { body: string; preview_url: false };
}

export interface MetaInteractiveReplyButton {
  type: 'reply';
  reply: { id: string; title: string };
}

export interface MetaInteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

/** The two interactive shapes `parseMetaWebhook`'s inbound counterpart understands. */
export type MetaInteractiveAction =
  | { type: 'button'; body: { text: string }; action: { buttons: MetaInteractiveReplyButton[] } }
  | {
      type: 'list';
      body: { text: string };
      action: { button: string; sections: [{ rows: MetaInteractiveListRow[] }] };
    };

export interface MetaSendInteractiveBody {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'interactive';
  interactive: MetaInteractiveAction;
}

/** The Cloud API send response — see 07-RESEARCH § WhatsApp Business Cloud API Reference. */
export interface MetaSendResponse {
  messages: Array<{ id: string; message_status?: 'accepted' | 'held_for_quality_assessment' | 'paused' }>;
  contacts?: Array<{ input: string; wa_id: string }>;
}

/** A Meta error object, e.g. the `error` field of a non-2xx send response or a status webhook's `errors[0]`. */
export interface MetaErrorPayload {
  code: number;
  message?: string;
  error_subcode?: number;
  fbtrace_id?: string;
}

/** A single status object from a delivery-status webhook — see 07-RESEARCH § Delivery status webhooks. */
export interface MetaStatusObject {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipient_id: string;
  timestamp: string;
  errors?: MetaErrorPayload[];
}

/** An inbound message object from a webhook's `messages[]` array. */
export interface MetaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  context?: { from?: string; id?: string };
  text?: { body: string };
  interactive?:
    | { type: 'button_reply'; button_reply: { id: string; title: string } }
    | { type: 'list_reply'; list_reply: { id: string; title: string; description?: string } };
  button?: { payload: string; text: string };
}

// ─── Domain -> Meta payload construction ───────────────────────────────────

/** The template registry's Cloud API metadata — data, not a switch (07-07-PLAN Task 1). */
export interface MetaTemplateMeta {
  name: string;
  languageCode: string;
  metaCategory: 'UTILITY' | 'MARKETING';
}

/**
 * Domain `WaSendTemplateCommand` -> a valid Cloud API `POST
 * /{phone-number-id}/messages` body for `type: 'template'`. Runs the
 * capability guards before constructing anything, so a limit breach fails
 * as a domain `WaSendError` rather than as a Meta 400.
 */
export function toMetaTemplatePayload(
  cmd: WaSendTemplateCommand,
  templateMeta: MetaTemplateMeta,
): MetaSendTemplateBody {
  assertButtonLimits(cmd.buttons, META_HARD_CAPS);

  const components: MetaTemplateComponent[] = [];

  if (cmd.media) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: { id: cmd.media.providerMediaId, filename: cmd.media.filename },
        },
      ],
    });
  }

  const bodyParameters: MetaTemplateTextParameter[] = Object.entries(cmd.variables).map(([key, value]) => ({
    type: 'text',
    text: value,
    parameter_name: key,
  }));
  if (bodyParameters.length > 0) {
    components.push({ type: 'body', parameters: bodyParameters });
  }

  if (cmd.buttons && cmd.buttons.length > 0) {
    cmd.buttons.forEach((button, index) => {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index,
        parameters: [{ type: 'payload', payload: button.id }],
      });
    });
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cmd.to,
    type: 'template',
    template: {
      name: templateMeta.name,
      language: { code: templateMeta.languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

/** A plain free-form text message — only ever legal inside an open service window. */
export function toMetaTextPayload(to: string, text: string): MetaSendTextBody {
  assertBodyLength(text, WA_CAPABILITY_LIMITS.maxTextBodyChars);

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  };
}

export interface MetaInteractiveInput {
  to: string;
  bodyText: string;
  buttons?: WaButtonSpec[];
  list?: { buttonText: string; rows: WaListRow[] };
}

/**
 * An interactive reply-button or list message. Exactly one of `buttons` /
 * `list` must be supplied — the booking flow (list) and quick-reply
 * follow-ups (buttons) never mix in one message.
 */
export function toMetaInteractivePayload(input: MetaInteractiveInput): MetaSendInteractiveBody {
  assertBodyLength(input.bodyText, META_HARD_CAPS.maxBodyChars);

  if (input.list) {
    assertListLimits(input.list.rows, META_HARD_CAPS);

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: input.bodyText },
        action: {
          button: input.list.buttonText,
          sections: [
            {
              rows: input.list.rows.map((row) => ({
                id: row.id,
                title: row.title,
                ...(row.description ? { description: row.description } : {}),
              })),
            },
          ],
        },
      },
    };
  }

  if (input.buttons) {
    assertButtonLimits(input.buttons, META_HARD_CAPS);

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: input.bodyText },
        action: {
          buttons: input.buttons.map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: button.title },
          })),
        },
      },
    };
  }

  throw new WaSendError(
    'TEMPLATE_PARAM_MISMATCH',
    null,
    false,
    'toMetaInteractivePayload requires either buttons or a list',
  );
}

// ─── Meta -> domain response mapping ────────────────────────────────────────

const MESSAGE_STATUS_MAP: Readonly<Record<string, 'ACCEPTED' | 'HELD_FOR_REVIEW' | 'PAUSED'>> = {
  accepted: 'ACCEPTED',
  held_for_quality_assessment: 'HELD_FOR_REVIEW',
  paused: 'PAUSED',
};

export interface MappedSendResult {
  providerMessageId: string;
  /** Provider ACK only — see `WaSendResult.acceptedStatus`. Never DELIVERED (Anti-Pattern A3). */
  acceptedStatus: 'ACCEPTED' | 'HELD_FOR_REVIEW' | 'PAUSED';
  resolvedWaId: string | null;
  acceptedAt: Date;
}

/**
 * Meta's send response -> the domain `WaSendResult` fields. An empty
 * `messages` array is not a shape Meta documents returning on a 2xx, but a
 * defensive `WaSendError('UNKNOWN')` here is safer than a downstream crash
 * on `messages[0]`.
 */
export function fromMetaSendResponse(response: MetaSendResponse): MappedSendResult {
  const message = response.messages[0];
  if (!message) {
    throw new WaSendError('UNKNOWN', null, false, 'Meta send response contained no messages');
  }

  return {
    providerMessageId: message.id,
    acceptedStatus: MESSAGE_STATUS_MAP[message.message_status ?? 'accepted'] ?? 'ACCEPTED',
    resolvedWaId: response.contacts?.[0]?.wa_id ?? null,
    acceptedAt: new Date(),
  };
}

// ─── Meta error normalization ───────────────────────────────────────────────

/**
 * Every Meta error code this phase normalizes, keyed by the numeric code
 * (07-RESEARCH § Failure codes worth normalizing). Retryability is a
 * property of the mapping, not of the caller — only rate-limit codes are
 * retryable. 131026 (undeliverable — Meta deliberately does not disambiguate
 * whether the recipient is not on WhatsApp, blocked the sender, is in a
 * restricted country, or has not accepted the ToS) is non-retryable and
 * surfaces as UI-SPEC's "This mobile number may not be on WhatsApp" copy.
 */
export const META_ERROR_CODE_MAP: Readonly<Record<number, { code: WaFailureCode; retryable: boolean }>> = {
  131026: { code: 'NOT_ON_WHATSAPP', retryable: false },
  131047: { code: 'OUTSIDE_SERVICE_WINDOW', retryable: false },
  131049: { code: 'SUPPRESSED_BY_META', retryable: false },
  132000: { code: 'TEMPLATE_PARAM_MISMATCH', retryable: false },
  132001: { code: 'TEMPLATE_NOT_AVAILABLE', retryable: false },
  4: { code: 'RATE_LIMITED', retryable: true },
  80007: { code: 'RATE_LIMITED', retryable: true },
  130429: { code: 'RATE_LIMITED', retryable: true },
};

export interface NormalizedMetaError {
  code: WaFailureCode;
  retryable: boolean;
  /** The raw numeric Meta code, preserved as a string so it stays auditable. */
  providerCode: string;
}

/**
 * Normalizes any Meta error object to a `WaFailureCode` + `retryable` pair.
 * A total fallback to `UNKNOWN` (never a throw) means an as-yet-unmapped
 * Meta code can never crash the send path or the webhook handler.
 */
export function normalizeMetaError(error: MetaErrorPayload): NormalizedMetaError {
  const mapped = META_ERROR_CODE_MAP[error.code] ?? { code: 'UNKNOWN' as WaFailureCode, retryable: false };

  return {
    code: mapped.code,
    retryable: mapped.retryable,
    providerCode: String(error.code),
  };
}
