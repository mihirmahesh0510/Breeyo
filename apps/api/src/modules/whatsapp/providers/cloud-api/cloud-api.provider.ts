/**
 * WHA-04 — CloudApiProvider: the real `fetch`-based `WaProvider` adapter
 * over `graph.facebook.com`.
 *
 * Unexercised in Beta: `WHATSAPP_PROVIDER` stays `simulator` deploy-wide and
 * no pilot clinic's config row is set to `CLOUD_API` (Meta Business
 * verification has not started, per STATE.md). Its value is that it exists,
 * is fully typed, and is fully unit-tested against a stubbed `fetch` — this
 * is the artifact that actually proves WHA-04's "swappable via
 * configuration" claim.
 *
 * Holds only credentials, URL construction, the `fetch` call and error
 * routing — all payload construction is delegated to `cloud-api.mapper.ts`
 * and all inbound/webhook handling to `cloud-api.webhook.ts` (Anti-Pattern
 * A1). Credentials are read once at construction and never logged, never
 * included in a `WaSendError` message (T-07-07-03).
 */

import { SIMULATOR_CAPABILITIES } from '../simulator/simulator.provider.js';
import {
  assertBodyLength,
  assertButtonLimits,
  assertListLimits,
  assertRegisteredTemplate,
  isServiceWindowOpen,
} from '../capability-guards.js';
import {
  fromMetaSendResponse,
  normalizeMetaError,
  toMetaInteractivePayload,
  toMetaTemplatePayload,
  toMetaTextPayload,
  type MetaErrorPayload,
  type MetaSendResponse,
  type MetaTemplateMeta,
} from './cloud-api.mapper.js';
import { parseMetaWebhook, verifyMetaSignature } from './cloud-api.webhook.js';
import {
  WaSendError,
  type WaInboundEvent,
  type WaMediaRef,
  type WaProvider,
  type WaSendFreeformCommand,
  type WaSendResult,
  type WaSendTemplateCommand,
} from '../wa-provider.port.js';

export interface CloudApiProviderConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  graphVersion: string;
}

/**
 * Imported from the simulator rather than re-declared here, so the real
 * adapter can never end up declaring looser limits than the simulator
 * already enforces (WHA-04) — see `simulator.provider.ts`'s
 * `SIMULATOR_CAPABILITIES` doc comment. One shared object; the two
 * adapters cannot drift apart.
 */
export const CLOUD_API_CAPABILITIES = SIMULATOR_CAPABILITIES;

/** A hung Meta call must not occupy a BullMQ worker indefinitely (T-07-07-04). */
const REQUEST_TIMEOUT_MS = 15_000;

/** Cloud API media is retained for 30 days after last use (07-RESEARCH § Media). */
const MEDIA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class CloudApiProvider implements WaProvider {
  readonly id = 'cloud-api' as const;
  readonly capabilities = CLOUD_API_CAPABILITIES;

  constructor(private readonly config: CloudApiProviderConfig) {}

  async sendTemplate(cmd: WaSendTemplateCommand): Promise<WaSendResult> {
    assertRegisteredTemplate(cmd.templateKey);
    assertButtonLimits(cmd.buttons, this.capabilities);

    const body = toMetaTemplatePayload(cmd, this.resolveTemplateMeta(cmd));
    const response = await this.postMessage(body);
    return fromMetaSendResponse(response);
  }

  /**
   * MUST throw `WaSendError('OUTSIDE_SERVICE_WINDOW')` when the 24h window
   * is closed — the real Cloud API has no escape hatch (that is a
   * simulator-only demo affordance, D-16); this mirrors Meta's actual
   * constraint rather than a configurable bypass.
   */
  async sendFreeform(cmd: WaSendFreeformCommand): Promise<WaSendResult> {
    assertButtonLimits(cmd.buttons, this.capabilities);
    assertListLimits(cmd.list?.rows, this.capabilities);
    assertBodyLength(cmd.text, this.capabilities.maxBodyChars);

    if (
      this.capabilities.requiresTemplateOutsideServiceWindow &&
      !isServiceWindowOpen(cmd.serviceWindowExpiresAt)
    ) {
      throw new WaSendError(
        'OUTSIDE_SERVICE_WINDOW',
        null,
        false,
        'Free-form message requires an open 24h customer service window',
      );
    }

    const body =
      cmd.buttons || cmd.list
        ? toMetaInteractivePayload({ to: cmd.to, bodyText: cmd.text, buttons: cmd.buttons, list: cmd.list })
        : toMetaTextPayload(cmd.to, cmd.text);

    const response = await this.postMessage(body);
    return fromMetaSendResponse(response);
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

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', input.mimeType);
    // `Uint8Array<ArrayBufferLike>` is not directly assignable to `BlobPart`
    // under strict mode, because it may be backed by a `SharedArrayBuffer`.
    // `Buffer.from` copies into a plain `ArrayBuffer`-backed view, which is.
    form.append('file', new Blob([Buffer.from(input.bytes)], { type: input.mimeType }), input.filename);

    const response = await this.fetchWithTimeout(this.mediaUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
      body: form,
    });

    if (!response.ok) {
      await this.throwForErrorResponse(response);
    }

    const parsed = await this.parseJson<{ id: string }>(response);

    return {
      providerMediaId: parsed.id,
      filename: input.filename,
      mimeType: input.mimeType,
      expiresAt: new Date(Date.now() + MEDIA_RETENTION_MS),
    };
  }

  /** Normalizes BOTH template-button and interactive-button inbound shapes; never throws. */
  parseInbound(rawBody: unknown): WaInboundEvent[] {
    return parseMetaWebhook(rawBody);
  }

  /** HMAC-SHA256 over the raw body, timing-safe compared — see `cloud-api.webhook.ts`. */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean {
    const signatureHeader = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
    return verifyMetaSignature(rawBody, signatureHeader, this.config.appSecret);
  }

  /**
   * The registry's Cloud API metadata (07-06's `WaTemplateDefinition.cloud`)
   * is out of this plan's dependency graph (07-07 depends only on 07-02 and
   * 07-05) — resolved directly from the command instead. All six Beta
   * templates are UTILITY-shaped (07-RESEARCH § Templates), and the Cloud
   * API template name is expected to match the registry key 1:1.
   */
  private resolveTemplateMeta(cmd: WaSendTemplateCommand): MetaTemplateMeta {
    return { name: cmd.templateKey, languageCode: cmd.languageCode, metaCategory: 'UTILITY' };
  }

  private messagesUrl(): string {
    return `https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`;
  }

  private mediaUrl(): string {
    return `https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/media`;
  }

  private async postMessage(body: unknown): Promise<MetaSendResponse> {
    const response = await this.fetchWithTimeout(this.messagesUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.throwForErrorResponse(response);
    }

    return this.parseJson<MetaSendResponse>(response);
  }

  /**
   * Wraps every outbound `fetch` with a request timeout (T-07-07-04) and
   * converts any network-level rejection (DNS, socket, timeout) into a
   * retryable `PROVIDER_UNAVAILABLE` — never the raw fetch error, which
   * could otherwise carry request internals into a log line.
   */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new WaSendError(
        'PROVIDER_UNAVAILABLE',
        null,
        true,
        'WhatsApp Cloud API request failed or timed out',
      );
    }
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new WaSendError('UNKNOWN', null, false, 'WhatsApp Cloud API returned an unparsable response body');
    }
  }

  /**
   * Routes a non-2xx response through `normalizeMetaError` when Meta
   * supplies a numeric error code; a 5xx is always retryable regardless of
   * body content (a server error is transient even if Meta happens to
   * report an error code that would otherwise be marked non-retryable).
   * Never includes the response body, the access token or the app secret
   * in the thrown message.
   */
  private async throwForErrorResponse(response: Response): Promise<never> {
    if (response.status >= 500) {
      throw new WaSendError(
        'PROVIDER_UNAVAILABLE',
        String(response.status),
        true,
        `WhatsApp Cloud API responded with status ${response.status}`,
      );
    }

    let errorPayload: MetaErrorPayload | undefined;
    try {
      const parsed = (await response.json()) as { error?: MetaErrorPayload };
      errorPayload = parsed?.error;
    } catch {
      // No parsable JSON body — fall through to the status-based fallback below.
    }

    if (errorPayload && typeof errorPayload.code === 'number') {
      const normalized = normalizeMetaError(errorPayload);
      throw new WaSendError(
        normalized.code,
        normalized.providerCode,
        normalized.retryable,
        `WhatsApp Cloud API rejected the request (code ${normalized.providerCode})`,
      );
    }

    if (response.status === 429) {
      throw new WaSendError(
        'RATE_LIMITED',
        String(response.status),
        true,
        'WhatsApp Cloud API rate limit exceeded',
      );
    }

    throw new WaSendError(
      'UNKNOWN',
      String(response.status),
      false,
      `WhatsApp Cloud API responded with status ${response.status}`,
    );
  }
}
