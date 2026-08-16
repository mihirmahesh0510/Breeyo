/**
 * WHA-04 — the provider registry: the entirety of "swappable via
 * configuration."
 *
 * Selection order: a clinic's `WhatsAppClinicConfig.provider` row is
 * authoritative. `CLOUD_API` resolves to the real adapter; every other
 * value — including `SIMULATOR`, the schema default — resolves to the
 * simulator. See the `WHATSAPP_PROVIDER` doc comment on `resolveProvider`
 * below for why the deploy-wide env default can never override a clinic's
 * own pin in this Beta (T-07-05-01).
 *
 * No caller outside this file may branch on provider identity
 * (`provider.id === 'simulator'`) — callers read `provider.capabilities`
 * instead (07-RESEARCH § Pattern 1).
 */

import type { Queue } from 'bullmq';
import type { WhatsAppClinicConfig } from '@prisma/client';
import type { WaProviderId } from '@breeyo/types';
import { CloudApiProvider } from './cloud-api/cloud-api.provider.js';
import { SimulatorProvider } from './simulator/simulator.provider.js';
import type { WaProvider } from './wa-provider.port.js';

export interface ProviderRegistryDeps {
  /** For the simulator's delayed status-transition and auto-reply jobs. */
  simulatorQueue: Queue;
  loadClinicConfig: (clinicId: string) => Promise<WhatsAppClinicConfig>;
}

export interface ProviderRegistry {
  resolveProvider(clinicId: string): Promise<WaProvider>;
}

/**
 * `createX(deps): X` factory shape, following `createNotificationBus`
 * (`notification-bus.ts:34-37`) — a thin object wrapping `resolveProvider`
 * so a caller can hold one registry per request/worker rather than
 * threading `deps` through every call site.
 */
export function createProviderRegistry(deps: ProviderRegistryDeps): ProviderRegistry {
  return {
    resolveProvider: (clinicId: string) => resolveProvider(clinicId, deps),
  };
}

/**
 * `WHATSAPP_PROVIDER` names the deploy-wide default adapter
 * (`'simulator' | 'cloud-api'`). In this Beta, adapter *selection* below is
 * fully decided by each clinic's `WhatsAppClinicConfig.provider` row
 * instead: `CLOUD_API` always resolves to the real adapter, and every
 * other value (including the `SIMULATOR` default) always resolves to the
 * simulator — regardless of what `WHATSAPP_PROVIDER` says. This is what
 * lets a pilot clinic's config row keep demoing on the simulator even
 * after `WHATSAPP_PROVIDER` flips to `cloud-api` for the rest of the
 * deployment (T-07-05-01), and it is why an unset, missing, or typo'd
 * `WHATSAPP_PROVIDER` can never, by itself, cause a real send: the literal
 * string `'cloud-api'` is not, on its own, sufficient to select the real
 * adapter — only the per-clinic row is.
 */
export async function resolveProvider(
  clinicId: string,
  deps: ProviderRegistryDeps,
): Promise<WaProvider> {
  const cfg = await deps.loadClinicConfig(clinicId);

  const id: WaProviderId = cfg.provider === 'CLOUD_API' ? 'cloud-api' : 'simulator';

  if (id === 'cloud-api') {
    return new CloudApiProvider({
      phoneNumberId: requireEnv('WHATSAPP_PHONE_NUMBER_ID'),
      accessToken: requireEnv('WHATSAPP_ACCESS_TOKEN'),
      appSecret: requireEnv('WHATSAPP_APP_SECRET'),
      graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? 'v23.0',
    });
  }

  return new SimulatorProvider(cfg, deps.simulatorQueue);
}

/** Fails loudly at construction, not silently at send time. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — required to construct the cloud-api WhatsApp provider`);
  }
  return value;
}
