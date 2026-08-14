import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processOutboundJob, createOutboundWorker } from '../workers/outbound.worker.js';
import { WaSendError } from '../providers/wa-provider.port.js';

/**
 * WHA-04/WHA-05 — outbound.worker.ts (D-16, Anti-Pattern A5, Pitfall 7).
 *
 * `resolveProvider` is mocked so this suite exercises only the worker's own
 * replay-safety, funnel-integration and retryable/terminal-failure branching
 * — provider construction is covered by `provider-registry.test.ts`.
 * `bullmq`'s `Worker` is mocked so the `createOutboundWorker` "otherwise"
 * branch can be asserted without a live Redis connection.
 */

vi.mock('../providers/provider-registry.js', () => ({
  resolveProvider: vi.fn(),
}));

vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return { ...actual, Worker: vi.fn().mockImplementation(() => ({ close: vi.fn() })) };
});

const { resolveProvider } = await import('../providers/provider-registry.js');
const { Worker } = await import('bullmq');

const CLINIC_ID = 'clinic-1';
const MESSAGE_ID = 'message-1';
const THREAD_ID = 'thread-1';
const OWNER_ID = 'owner-1';

function buildMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MESSAGE_ID,
    clinicId: CLINIC_ID,
    threadId: THREAD_ID,
    status: 'QUEUED',
    templateKey: 'follow_up_reminder',
    renderedVariables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '20 Aug 2026' },
    ...overrides,
  };
}

function buildThread(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: THREAD_ID,
    clinicId: CLINIC_ID,
    ownerId: OWNER_ID,
    waPhone: '+919876543210',
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    whatsAppMessage: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    whatsAppThread: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function createMockRepository() {
  return {
    getOrCreateClinicConfig: vi.fn().mockResolvedValue({ provider: 'SIMULATOR' }),
    getOwnerPreference: vi.fn().mockResolvedValue(null),
    upsertOwnerPreference: vi.fn().mockResolvedValue({}),
  };
}

function createMockDeliveryStatusService() {
  return { apply: vi.fn().mockResolvedValue({ applied: true }) };
}

function createDeps() {
  return {
    prisma: createMockPrisma(),
    repository: createMockRepository(),
    deliveryStatusService: createMockDeliveryStatusService(),
    simulatorQueue: { add: vi.fn() } as any,
    redis: {} as any,
  };
}

describe('processOutboundJob (WHA-04/05, D-16, Anti-Pattern A5)', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    deps.prisma.whatsAppMessage.findUnique.mockResolvedValue(buildMessage());
    deps.prisma.whatsAppThread.findUnique.mockResolvedValue(buildThread());
  });

  it('loads the QUEUED message, resolves the provider, calls sendTemplate, and applies SENT through the funnel', async () => {
    const sendTemplate = vi.fn().mockResolvedValue({
      providerMessageId: 'sim.message-1',
      resolvedWaId: '919876543210',
      acceptedStatus: 'ACCEPTED',
      acceptedAt: new Date('2026-08-15T10:00:00Z'),
    });
    (resolveProvider as any).mockResolvedValue({ sendTemplate });

    await processOutboundJob(deps as any, { messageId: MESSAGE_ID });

    expect(resolveProvider).toHaveBeenCalledWith(CLINIC_ID, expect.objectContaining({ simulatorQueue: deps.simulatorQueue }));
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(deps.deliveryStatusService.apply).toHaveBeenCalledWith(
      'sim.message-1',
      'SENT',
      null,
      new Date('2026-08-15T10:00:00Z'),
    );
  });

  it('stores the returned providerMessageId on the message row and resolvedWaId on the thread', async () => {
    const sendTemplate = vi.fn().mockResolvedValue({
      providerMessageId: 'sim.message-1',
      resolvedWaId: '919876543210',
      acceptedStatus: 'ACCEPTED',
      acceptedAt: new Date(),
    });
    (resolveProvider as any).mockResolvedValue({ sendTemplate });

    await processOutboundJob(deps as any, { messageId: MESSAGE_ID });

    expect(deps.prisma.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: MESSAGE_ID },
      data: { providerMessageId: 'sim.message-1' },
    });
    expect(deps.prisma.whatsAppThread.update).toHaveBeenCalledWith({
      where: { id: THREAD_ID },
      data: { resolvedWaId: '919876543210' },
    });
  });

  it('on a message already past QUEUED, returns without calling the provider (idempotent replay)', async () => {
    deps.prisma.whatsAppMessage.findUnique.mockResolvedValue(buildMessage({ status: 'SENT' }));

    await processOutboundJob(deps as any, { messageId: MESSAGE_ID });

    expect(resolveProvider).not.toHaveBeenCalled();
    expect(deps.deliveryStatusService.apply).not.toHaveBeenCalled();
  });

  it('on a WaSendError with retryable true, rethrows so BullMQ retries with backoff', async () => {
    const sendTemplate = vi.fn().mockRejectedValue(
      new WaSendError('PROVIDER_UNAVAILABLE', 'SIM_500', true, 'Simulated: provider unavailable'),
    );
    (resolveProvider as any).mockResolvedValue({ sendTemplate });

    await expect(processOutboundJob(deps as any, { messageId: MESSAGE_ID })).rejects.toBeInstanceOf(
      WaSendError,
    );
    expect(deps.deliveryStatusService.apply).not.toHaveBeenCalled();
  });

  it('on a WaSendError with retryable false, applies FAILED with the normalized failure code and does NOT rethrow', async () => {
    const sendTemplate = vi.fn().mockRejectedValue(
      new WaSendError('TEMPLATE_NOT_AVAILABLE', null, false, 'not a registered template'),
    );
    (resolveProvider as any).mockResolvedValue({ sendTemplate });

    await expect(processOutboundJob(deps as any, { messageId: MESSAGE_ID })).resolves.toBeUndefined();

    expect(deps.deliveryStatusService.apply).toHaveBeenCalledTimes(1);
    const [, status, failure] = deps.deliveryStatusService.apply.mock.calls[0];
    expect(status).toBe('FAILED');
    expect(failure).toMatchObject({ code: 'TEMPLATE_NOT_AVAILABLE' });
  });

  it('on a NOT_ON_WHATSAPP failure, also sets the owner preference numberStatus to INVALID (D-16)', async () => {
    const sendTemplate = vi.fn().mockRejectedValue(
      new WaSendError('NOT_ON_WHATSAPP', 'SIM_131026', false, 'Simulated: recipient is not on WhatsApp'),
    );
    (resolveProvider as any).mockResolvedValue({ sendTemplate });

    await processOutboundJob(deps as any, { messageId: MESSAGE_ID });

    expect(deps.repository.upsertOwnerPreference).toHaveBeenCalledWith(
      CLINIC_ID,
      OWNER_ID,
      expect.objectContaining({ numberStatus: 'INVALID' }),
    );
  });

  it('on a non-existent messageId, returns without throwing', async () => {
    deps.prisma.whatsAppMessage.findUnique.mockResolvedValue(null);

    await expect(processOutboundJob(deps as any, { messageId: 'does-not-exist' })).resolves.toBeUndefined();
    expect(resolveProvider).not.toHaveBeenCalled();
  });
});

describe('createOutboundWorker (Pitfall 7)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns undefined when NODE_ENV is 'test'", () => {
    process.env.NODE_ENV = 'test';
    const worker = createOutboundWorker(createDeps() as any);
    expect(worker).toBeUndefined();
    expect(Worker).not.toHaveBeenCalled();
  });

  it("returns a Worker when NODE_ENV is not 'test'", () => {
    process.env.NODE_ENV = 'production';
    const worker = createOutboundWorker(createDeps() as any);
    expect(worker).toBeDefined();
    expect(Worker).toHaveBeenCalledWith(
      'whatsapp-outbound',
      expect.any(Function),
      expect.objectContaining({ limiter: expect.anything() }),
    );
  });
});
