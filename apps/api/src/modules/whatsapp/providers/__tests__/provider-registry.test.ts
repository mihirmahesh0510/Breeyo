import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Queue } from 'bullmq';
import type { WhatsAppClinicConfig } from '@prisma/client';
import { resolveProvider, createProviderRegistry, type ProviderRegistryDeps } from '../provider-registry.js';
import { SimulatorProvider, SIMULATOR_CAPABILITIES } from '../simulator/simulator.provider.js';
import { CloudApiProvider } from '../cloud-api/cloud-api.provider.js';
import type { WaProvider } from '../wa-provider.port.js';

function createConfig(overrides: Partial<WhatsAppClinicConfig> = {}): WhatsAppClinicConfig {
  return {
    id: 'cfg-1',
    clinicId: 'clinic-1',
    provider: 'SIMULATOR',
    deliveryMode: 'NORMAL',
    autoReplyEnabled: true,
    autoReplyDelaySeconds: 10,
    allowFreeformOutsideWindow: false,
    slotDurationMinutes: 30,
    escalationMaxAttempts: 2,
    escalationIntervalDays: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WhatsAppClinicConfig;
}

function createDeps(config: WhatsAppClinicConfig): ProviderRegistryDeps {
  return {
    simulatorQueue: { add: vi.fn() } as unknown as Queue,
    loadClinicConfig: vi.fn().mockResolvedValue(config),
  };
}

function stubCloudApiCredentials(): void {
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'phone-number-id');
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'access-token');
  vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveProvider', () => {
  it('returns the simulator when WHATSAPP_PROVIDER is unset and the clinic config is SIMULATOR', async () => {
    const deps = createDeps(createConfig({ provider: 'SIMULATOR' }));
    const provider = await resolveProvider('clinic-1', deps);
    expect(provider.id).toBe('simulator');
  });

  it("returns the simulator when WHATSAPP_PROVIDER='cloud-api' but the clinic config is SIMULATOR — the per-clinic row wins", async () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'cloud-api');
    const deps = createDeps(createConfig({ provider: 'SIMULATOR' }));

    const provider = await resolveProvider('clinic-1', deps);

    expect(provider.id).toBe('simulator');
  });

  it('returns cloud-api when the clinic config is CLOUD_API', async () => {
    stubCloudApiCredentials();
    const deps = createDeps(createConfig({ provider: 'CLOUD_API' }));

    const provider = await resolveProvider('clinic-1', deps);

    expect(provider.id).toBe('cloud-api');
  });

  it('throws an Error naming the missing variable when the clinic config is CLOUD_API and WHATSAPP_ACCESS_TOKEN is unset', async () => {
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'phone-number-id');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', undefined);
    vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret');
    const deps = createDeps(createConfig({ provider: 'CLOUD_API' }));

    await expect(resolveProvider('clinic-1', deps)).rejects.toThrow(/WHATSAPP_ACCESS_TOKEN/);
  });

  it('falls back to simulator for an unrecognized WHATSAPP_PROVIDER value (never cloud-api)', async () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'clowd-api-typo');
    const deps = createDeps(createConfig({ provider: 'SIMULATOR' }));

    const provider = await resolveProvider('clinic-1', deps);

    expect(provider.id).toBe('simulator');
  });
});

describe('createProviderRegistry', () => {
  it('wraps resolveProvider behind a factory-created registry object', async () => {
    const deps = createDeps(createConfig({ provider: 'SIMULATOR' }));
    const registry = createProviderRegistry(deps);

    const provider = await registry.resolveProvider('clinic-1');

    expect(provider.id).toBe('simulator');
  });
});

describe('CloudApiProvider capabilities', () => {
  it('equals SIMULATOR_CAPABILITIES field for field (WHA-04)', () => {
    const cloudApi = new CloudApiProvider({
      phoneNumberId: 'pn',
      accessToken: 'tok',
      appSecret: 'secret',
      graphVersion: 'v23.0',
    });
    expect(cloudApi.capabilities).toEqual(SIMULATOR_CAPABILITIES);
  });

  it("has id === 'cloud-api'", () => {
    const cloudApi = new CloudApiProvider({
      phoneNumberId: 'pn',
      accessToken: 'tok',
      appSecret: 'secret',
      graphVersion: 'v23.0',
    });
    expect(cloudApi.id).toBe('cloud-api');
  });
});

describe('WaProvider assignability (compile-time)', () => {
  it('both adapters satisfy the WaProvider type', () => {
    const simulator: WaProvider = new SimulatorProvider(
      createConfig(),
      { add: vi.fn() } as unknown as Queue,
    );
    const cloudApi: WaProvider = new CloudApiProvider({
      phoneNumberId: 'pn',
      accessToken: 'tok',
      appSecret: 'secret',
      graphVersion: 'v23.0',
    });

    expect(simulator.id).toBe('simulator');
    expect(cloudApi.id).toBe('cloud-api');
  });
});
