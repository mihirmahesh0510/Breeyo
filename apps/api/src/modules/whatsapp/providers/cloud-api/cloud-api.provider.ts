/**
 * WHA-04 — CloudApiProvider skeleton.
 *
 * Zero real Meta API calls happen in Beta (WHATSAPP_PROVIDER stays
 * `simulator` deploy-wide, and no pilot clinic's config row is set to
 * `CLOUD_API`), so this adapter is a type-safe stub: every method throws
 * `WaSendError('PROVIDER_UNAVAILABLE', ..., retryable: true, ...)`. Plan
 * 07-07 replaces these bodies with real `fetch` calls to
 * `graph.facebook.com` plus `cloud-api.mapper.ts` (domain <-> Meta JSON) and
 * `cloud-api.webhook.ts` (HMAC verification) — this task's job is only to
 * make the provider registry's cloud-api branch real and type-safe.
 */

import { SIMULATOR_CAPABILITIES } from '../simulator/simulator.provider.js';
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

const NOT_IMPLEMENTED_MESSAGE = 'Cloud API adapter not implemented in Beta';

export class CloudApiProvider implements WaProvider {
  readonly id = 'cloud-api' as const;
  readonly capabilities = CLOUD_API_CAPABILITIES;

  constructor(private readonly config: CloudApiProviderConfig) {
    // Credentials are read once, here, by the registry's `requireEnv` calls
    // before this constructor runs (fail loudly at construction, not
    // silently at send time). Stored only on this instance — never logged,
    // never included in a WaSendError message (T-07-05-02).
    void this.config;
  }

  async sendTemplate(_cmd: WaSendTemplateCommand): Promise<WaSendResult> {
    throw new WaSendError('PROVIDER_UNAVAILABLE', null, true, NOT_IMPLEMENTED_MESSAGE);
  }

  async sendFreeform(_cmd: WaSendFreeformCommand): Promise<WaSendResult> {
    throw new WaSendError('PROVIDER_UNAVAILABLE', null, true, NOT_IMPLEMENTED_MESSAGE);
  }

  async uploadMedia(_input: {
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
  }): Promise<WaMediaRef> {
    throw new WaSendError('PROVIDER_UNAVAILABLE', null, true, NOT_IMPLEMENTED_MESSAGE);
  }

  parseInbound(_rawBody: unknown): WaInboundEvent[] {
    throw new WaSendError('PROVIDER_UNAVAILABLE', null, true, NOT_IMPLEMENTED_MESSAGE);
  }

  verifyWebhook(_headers: Record<string, string | undefined>, _rawBody: string): boolean {
    throw new WaSendError('PROVIDER_UNAVAILABLE', null, true, NOT_IMPLEMENTED_MESSAGE);
  }
}
