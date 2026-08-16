import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processSimulatorJob, createSimulatorWorker } from '../workers/simulator.worker.js';
import { InboundRouterService } from '../inbound-router.service.js';

/**
 * WHA-04/WHA-05 — simulator.worker.ts (D-14, Pitfall 7).
 *
 * `bullmq`'s `Worker` is mocked so the `createSimulatorWorker` "otherwise"
 * branch can be asserted without a live Redis connection.
 */

vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return { ...actual, Worker: vi.fn().mockImplementation(() => ({ close: vi.fn() })) };
});

const { Worker } = await import('bullmq');

const CLINIC_ID = 'clinic-1';
const THREAD_ID = 'thread-1';
const OWNER_ID = 'owner-1';
const OUTBOUND_PROVIDER_MESSAGE_ID = 'sim.out-1';

function buildOutboundMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'msg-out-1',
    clinicId: CLINIC_ID,
    threadId: THREAD_ID,
    providerMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
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
    whatsAppMessage: { findFirst: vi.fn() },
    whatsAppThread: { findUnique: vi.fn() },
  };
}

function createMockDeliveryStatusService() {
  return { apply: vi.fn().mockResolvedValue({ applied: true }) };
}

function createMockInboundRouter() {
  return { route: vi.fn().mockResolvedValue(undefined) };
}

function createDeps() {
  return {
    prisma: createMockPrisma(),
    redis: {} as any,
    deliveryStatusService: createMockDeliveryStatusService(),
    inboundRouter: createMockInboundRouter(),
  };
}

describe('processSimulatorJob (WHA-04/05, D-14)', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    deps.prisma.whatsAppMessage.findFirst.mockResolvedValue(buildOutboundMessage());
    deps.prisma.whatsAppThread.findUnique.mockResolvedValue(buildThread());
  });

  it("processSimulatorJob({ name: 'status-transition', providerMessageId, status }) calls DeliveryStatusService.apply with that status", async () => {
    await processSimulatorJob(deps as any, {
      name: 'status-transition',
      providerMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
      status: 'DELIVERED',
    });

    expect(deps.deliveryStatusService.apply).toHaveBeenCalledWith(
      OUTBOUND_PROVIDER_MESSAGE_ID,
      'DELIVERED',
      null,
      expect.any(Date),
    );
    expect(deps.inboundRouter.route).not.toHaveBeenCalled();
  });

  it("processSimulatorJob({ name: 'auto-reply', ... }) builds a deterministic reply and routes it through InboundRouterService.route (D-14)", async () => {
    await processSimulatorJob(deps as any, {
      name: 'auto-reply',
      providerMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
      templateKey: 'follow_up_reminder',
      buttons: [],
    });

    expect(deps.inboundRouter.route).toHaveBeenCalledTimes(1);
    const [event, clinicId, channel] = deps.inboundRouter.route.mock.calls[0];
    expect(clinicId).toBe(CLINIC_ID);
    expect(channel).toBe('SIMULATOR');
    expect(event).toMatchObject({
      kind: 'TEXT',
      from: '919876543210',
      replyToProviderMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
    });
  });

  it('auto-reply picks the positive booking:confirm button when the outbound message offered buttons (D-15)', async () => {
    await processSimulatorJob(deps as any, {
      name: 'auto-reply',
      providerMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
      templateKey: 'booking_confirmation',
      buttons: [{ id: 'booking:confirm:1', title: 'Got it, thanks' }],
    });

    const [event] = deps.inboundRouter.route.mock.calls[0];
    expect(event).toMatchObject({ kind: 'BUTTON_REPLY', payload: 'booking:confirm:1' });
  });

  it("processSimulatorJob({ name: 'auto-reply', list, ... }) with no templateKey builds and routes a LIST_REPLY event (D-14/D-15)", async () => {
    await processSimulatorJob(deps as any, {
      name: 'auto-reply',
      providerMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
      buttons: [],
      list: {
        rows: [
          { id: 'booking:pet:11111111-1111-1111-1111-111111111111', title: 'Bruno' },
          { id: 'booking:pet:22222222-2222-2222-2222-222222222222', title: 'Milo' },
        ],
      },
    });

    expect(deps.inboundRouter.route).toHaveBeenCalledTimes(1);
    const [event, clinicId, channel] = deps.inboundRouter.route.mock.calls[0];
    expect(clinicId).toBe(CLINIC_ID);
    expect(channel).toBe('SIMULATOR');
    expect(event).toMatchObject({
      kind: 'LIST_REPLY',
      rowId: 'booking:pet:11111111-1111-1111-1111-111111111111',
      label: 'Bruno',
      replyToProviderMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
    });
  });

  it('does nothing when the outbound message no longer exists', async () => {
    deps.prisma.whatsAppMessage.findFirst.mockResolvedValue(null);

    await processSimulatorJob(deps as any, {
      name: 'auto-reply',
      providerMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
      templateKey: 'follow_up_reminder',
      buttons: [],
    });

    expect(deps.inboundRouter.route).not.toHaveBeenCalled();
  });

  it('auto-reply is idempotent through the real InboundRouterService: running the same job twice creates one inbound message', async () => {
    const p2002 = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const repository = {
      findThreadByPhone: vi.fn().mockResolvedValue(buildThread()),
      upsertThread: vi.fn(),
      createInboundMessage: vi.fn().mockResolvedValueOnce({ id: 'inbound-1' }).mockRejectedValueOnce(p2002),
      upsertOwnerPreference: vi.fn(),
      touchThread: vi.fn(),
    };
    const routerPrisma = {
      petOwner: { findFirst: vi.fn() },
      whatsAppThread: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      whatsAppMessage: { findFirst: vi.fn().mockResolvedValue(null) },
      whatsAppReminderTask: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const realRouter = new InboundRouterService({
      repository: repository as any,
      prisma: routerPrisma as any,
      deliveryStatusService: createMockDeliveryStatusService() as any,
    });

    const realDeps = { ...deps, inboundRouter: realRouter };
    const jobData = {
      name: 'auto-reply' as const,
      providerMessageId: OUTBOUND_PROVIDER_MESSAGE_ID,
      templateKey: 'follow_up_reminder' as const,
      buttons: [],
    };

    await processSimulatorJob(realDeps as any, jobData);
    await processSimulatorJob(realDeps as any, jobData);

    // Attempted twice (deterministic providerMessageId both times), but the
    // second attempt hit the UNIQUE constraint and was treated as
    // already-processed -- exactly one inbound message was ever created.
    expect(repository.createInboundMessage).toHaveBeenCalledTimes(2);
    await expect(repository.createInboundMessage.mock.results[0].value).resolves.toMatchObject({
      id: 'inbound-1',
    });
  });
});

describe('createSimulatorWorker (Pitfall 7)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns undefined when NODE_ENV is 'test'", () => {
    process.env.NODE_ENV = 'test';
    const worker = createSimulatorWorker(createDeps() as any);
    expect(worker).toBeUndefined();
    expect(Worker).not.toHaveBeenCalled();
  });

  it("returns a Worker when NODE_ENV is not 'test'", () => {
    process.env.NODE_ENV = 'production';
    const worker = createSimulatorWorker(createDeps() as any);
    expect(worker).toBeDefined();
    expect(Worker).toHaveBeenCalledWith('whatsapp-simulator', expect.any(Function), expect.anything());
  });
});
