import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Queue } from 'bullmq';
import type { WhatsAppClinicConfig } from '@prisma/client';
import { WA_SIMULATOR_DEFAULTS } from '@breeyo/types';
import { SimulatorProvider, SIMULATOR_CAPABILITIES } from '../simulator/simulator.provider.js';
import { WaSendError, type WaSendTemplateCommand, type WaSendFreeformCommand } from '../wa-provider.port.js';

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

function createQueue(): { add: ReturnType<typeof vi.fn> } {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

function createTemplateCommand(overrides: Partial<WaSendTemplateCommand> = {}): WaSendTemplateCommand {
  return {
    to: '+919876543210',
    templateKey: 'follow_up_reminder',
    languageCode: 'en',
    variables: { pet_name: 'Bruno' },
    idempotencyKey: 'msg-1',
    ...overrides,
  };
}

function createFreeformCommand(overrides: Partial<WaSendFreeformCommand> = {}): WaSendFreeformCommand {
  return {
    to: '+919876543210',
    text: 'Thanks!',
    serviceWindowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    idempotencyKey: 'msg-2',
    ...overrides,
  };
}

describe('SIMULATOR_CAPABILITIES', () => {
  it('is deliberately identical to the real Cloud API limits (WHA-04)', () => {
    expect(SIMULATOR_CAPABILITIES).toEqual({
      requiresTemplateOutsideServiceWindow: true,
      serviceWindowHours: 24,
      requiresRegisteredTemplates: true,
      maxQuickReplyButtons: 3,
      maxButtonTitleChars: 20,
      maxListRows: 10,
      maxListRowTitleChars: 24,
      maxBodyChars: 1024,
      supportsInteractiveList: true,
      mediaMaxBytes: 104857600,
      mediaRequiresUpload: true,
    });
  });
});

describe('SimulatorProvider.sendTemplate', () => {
  it('throws WaSendError when 4 buttons are offered (delegates to assertButtonLimits)', async () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);
    const buttons = Array.from({ length: 4 }, (_, i) => ({ id: `booking:confirm:${i}`, title: 'Confirm' }));

    await expect(provider.sendTemplate(createTemplateCommand({ buttons }))).rejects.toThrow(WaSendError);
  });

  it('throws WaSendError TEMPLATE_NOT_AVAILABLE for an unregistered template key', async () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);

    let error: unknown;
    try {
      await provider.sendTemplate(createTemplateCommand({ templateKey: 'made_up' as never }));
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('TEMPLATE_NOT_AVAILABLE');
  });

  it('resolves with an ACCEPTED ACK, a sim.<idempotencyKey> id, and the plus-less resolvedWaId', async () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);

    const result = await provider.sendTemplate(createTemplateCommand({ idempotencyKey: 'msg-abc' }));

    expect(result.providerMessageId).toBe('sim.msg-abc');
    expect(result.acceptedStatus).toBe('ACCEPTED');
    expect(result.resolvedWaId).toBe('919876543210');
    expect(result.acceptedAt).toBeInstanceOf(Date);
  });

  it('never resolves with a DELIVERED status (Anti-Pattern A3)', async () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);
    const result = await provider.sendTemplate(createTemplateCommand());
    expect(result.acceptedStatus).not.toBe('DELIVERED');
  });

  it('on NORMAL mode enqueues SENT immediately and DELIVERED with delay 2000, deduped by jobId', async () => {
    const queue = createQueue();
    const provider = new SimulatorProvider(createConfig({ deliveryMode: 'NORMAL' }), queue as unknown as Queue);

    const result = await provider.sendTemplate(createTemplateCommand({ idempotencyKey: 'msg-normal' }));

    expect(queue.add).toHaveBeenCalledWith(
      'status-transition',
      { providerMessageId: result.providerMessageId, status: 'SENT' },
      expect.objectContaining({ jobId: `status:${result.providerMessageId}:SENT` }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'status-transition',
      { providerMessageId: result.providerMessageId, status: 'DELIVERED' },
      expect.objectContaining({
        delay: WA_SIMULATOR_DEFAULTS.normalDeliverMs,
        jobId: `status:${result.providerMessageId}:DELIVERED`,
      }),
    );
  });

  it('on DELAYED mode enqueues the DELIVERED transition with delay 60000 (D-16)', async () => {
    const queue = createQueue();
    const provider = new SimulatorProvider(createConfig({ deliveryMode: 'DELAYED' }), queue as unknown as Queue);

    const result = await provider.sendTemplate(createTemplateCommand({ idempotencyKey: 'msg-delayed' }));

    expect(queue.add).toHaveBeenCalledWith(
      'status-transition',
      { providerMessageId: result.providerMessageId, status: 'DELIVERED' },
      expect.objectContaining({
        delay: WA_SIMULATOR_DEFAULTS.delayedDeliverMs,
        jobId: `status:${result.providerMessageId}:DELIVERED`,
      }),
    );
  });

  it('on FAIL mode throws PROVIDER_UNAVAILABLE (SIM_500, retryable) and enqueues nothing (D-16)', async () => {
    const queue = createQueue();
    const provider = new SimulatorProvider(createConfig({ deliveryMode: 'FAIL' }), queue as unknown as Queue);

    let error: unknown;
    try {
      await provider.sendTemplate(createTemplateCommand());
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('PROVIDER_UNAVAILABLE');
    expect((error as WaSendError).providerCode).toBe('SIM_500');
    expect((error as WaSendError).retryable).toBe(true);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('on INVALID_NUMBER mode throws NOT_ON_WHATSAPP (SIM_131026, non-retryable) and enqueues nothing (D-16)', async () => {
    const queue = createQueue();
    const provider = new SimulatorProvider(createConfig({ deliveryMode: 'INVALID_NUMBER' }), queue as unknown as Queue);

    let error: unknown;
    try {
      await provider.sendTemplate(createTemplateCommand());
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('NOT_ON_WHATSAPP');
    expect((error as WaSendError).providerCode).toBe('SIM_131026');
    expect((error as WaSendError).retryable).toBe(false);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues an auto-reply job with the configured delay and a dedupe jobId when autoReplyEnabled (D-14)', async () => {
    const queue = createQueue();
    const provider = new SimulatorProvider(
      createConfig({ autoReplyEnabled: true, autoReplyDelaySeconds: 15 }),
      queue as unknown as Queue,
    );

    const result = await provider.sendTemplate(createTemplateCommand({ idempotencyKey: 'msg-auto' }));

    expect(queue.add).toHaveBeenCalledWith(
      'auto-reply',
      expect.objectContaining({ providerMessageId: result.providerMessageId, templateKey: 'follow_up_reminder' }),
      expect.objectContaining({ delay: 15_000, jobId: `auto-reply:${result.providerMessageId}` }),
    );
  });

  it('enqueues no auto-reply job when autoReplyEnabled is false', async () => {
    const queue = createQueue();
    const provider = new SimulatorProvider(createConfig({ autoReplyEnabled: false }), queue as unknown as Queue);

    await provider.sendTemplate(createTemplateCommand());

    const autoReplyCalls = queue.add.mock.calls.filter(([name]) => name === 'auto-reply');
    expect(autoReplyCalls).toHaveLength(0);
  });

  it('reads deliveryMode from the injected per-clinic config — two clinics behave independently', async () => {
    const queueA = createQueue();
    const queueB = createQueue();
    const providerA = new SimulatorProvider(createConfig({ clinicId: 'clinic-a', deliveryMode: 'FAIL' }), queueA as unknown as Queue);
    const providerB = new SimulatorProvider(createConfig({ clinicId: 'clinic-b', deliveryMode: 'NORMAL' }), queueB as unknown as Queue);

    await expect(providerA.sendTemplate(createTemplateCommand())).rejects.toThrow(WaSendError);
    await expect(providerB.sendTemplate(createTemplateCommand())).resolves.toMatchObject({ acceptedStatus: 'ACCEPTED' });

    expect(queueA.add).not.toHaveBeenCalled();
    expect(queueB.add).toHaveBeenCalled();
  });
});

describe('SimulatorProvider.sendFreeform', () => {
  it('throws OUTSIDE_SERVICE_WINDOW when the window is closed and the escape hatch is off', async () => {
    const provider = new SimulatorProvider(
      createConfig({ allowFreeformOutsideWindow: false }),
      createQueue() as unknown as Queue,
    );

    let error: unknown;
    try {
      await provider.sendFreeform(createFreeformCommand({ serviceWindowExpiresAt: null }));
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('OUTSIDE_SERVICE_WINDOW');
    expect((error as WaSendError).providerCode).toBe('SIM_131047');
    expect((error as WaSendError).retryable).toBe(false);
  });

  it('resolves when the escape hatch is on despite a closed window (explicit non-default)', async () => {
    const provider = new SimulatorProvider(
      createConfig({ allowFreeformOutsideWindow: true }),
      createQueue() as unknown as Queue,
    );

    await expect(
      provider.sendFreeform(createFreeformCommand({ serviceWindowExpiresAt: null })),
    ).resolves.toMatchObject({ acceptedStatus: 'ACCEPTED' });
  });

  it('resolves when the service window is open, without the escape hatch', async () => {
    const provider = new SimulatorProvider(
      createConfig({ allowFreeformOutsideWindow: false }),
      createQueue() as unknown as Queue,
    );

    await expect(
      provider.sendFreeform(createFreeformCommand({ serviceWindowExpiresAt: new Date(Date.now() + 60 * 60 * 1000) })),
    ).resolves.toMatchObject({ acceptedStatus: 'ACCEPTED' });
  });
});

describe('SimulatorProvider.uploadMedia', () => {
  it('returns a synthetic WaMediaRef and stores no bytes', async () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);

    const ref = await provider.uploadMedia({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
    });

    expect(ref.providerMediaId).toBeTruthy();
    expect(ref.filename).toBe('invoice.pdf');
    expect(ref.mimeType).toBe('application/pdf');
    expect(ref.expiresAt).toBeNull();
  });

  it('throws WaSendError when bytes exceed mediaMaxBytes', async () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);
    const oversized = new Uint8Array(SIMULATOR_CAPABILITIES.mediaMaxBytes + 1);

    await expect(
      provider.uploadMedia({ bytes: oversized, filename: 'big.pdf', mimeType: 'application/pdf' }),
    ).rejects.toThrow(WaSendError);
  });
});

describe('SimulatorProvider.verifyWebhook', () => {
  const ORIGINAL_SECRET = process.env.WHATSAPP_SIMULATOR_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.WHATSAPP_SIMULATOR_WEBHOOK_SECRET = 'test-simulator-secret';
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.WHATSAPP_SIMULATOR_WEBHOOK_SECRET;
    } else {
      process.env.WHATSAPP_SIMULATOR_WEBHOOK_SECRET = ORIGINAL_SECRET;
    }
  });

  it('returns true when the shared secret header matches', () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);
    expect(
      provider.verifyWebhook({ 'x-simulator-secret': 'test-simulator-secret' }, '{}'),
    ).toBe(true);
  });

  it('returns false when the header does not match', () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);
    expect(provider.verifyWebhook({ 'x-simulator-secret': 'wrong' }, '{}')).toBe(false);
  });

  it('returns false when the header is missing', () => {
    const provider = new SimulatorProvider(createConfig(), createQueue() as unknown as Queue);
    expect(provider.verifyWebhook({}, '{}')).toBe(false);
  });
});
