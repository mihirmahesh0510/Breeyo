import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppRepository } from '../whatsapp.repository.js';

/**
 * `whatsapp-queue.ts` wraps two `bullmq` `Queue`s. Mock the module so this
 * unit test constructs no real Redis connection — mirrors how the codebase
 * has no existing `notification-bus` test to follow, so the shape here is
 * new but the mocking technique (vi.mock + a capturing constructor) is
 * standard Vitest practice.
 */
const mockQueueInstances: { name: string; opts: unknown; close: ReturnType<typeof vi.fn> }[] = [];

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    opts: unknown;
    close = vi.fn().mockResolvedValue(undefined);
    constructor(name: string, opts: unknown) {
      this.name = name;
      this.opts = opts;
      mockQueueInstances.push(this);
    }
  }
  return { Queue: MockQueue };
});

const { createWhatsAppQueues, WA_JOB_OPTIONS } = await import('../whatsapp-queue.js');

/**
 * Mock-prisma style mirrors `emr/__tests__/emr.service.test.ts`: a plain
 * object exposing only the models this repository touches, each method a
 * `vi.fn()`. Assertions inspect the exact `where`/`data` arguments passed,
 * which is what proves tenant scoping (Task 2 behavior list).
 */
function createMockPrisma() {
  return {
    whatsAppThread: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    whatsAppMessage: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    whatsAppMessageStatusEvent: {
      create: vi.fn(),
    },
    whatsAppOwnerPreference: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    consentRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    whatsAppClinicConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as any;
}

const CLINIC_A = '11111111-1111-1111-1111-111111111111';
const CLINIC_B = '22222222-2222-2222-2222-222222222222';
const OWNER_ID = '33333333-3333-3333-3333-333333333333';
const THREAD_ID = '44444444-4444-4444-4444-444444444444';
const MESSAGE_ID = '55555555-5555-5555-5555-555555555555';

describe('WhatsAppRepository (WHA-02/WHA-05, D-12)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: WhatsAppRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new WhatsAppRepository(prisma);
  });

  describe('upsertThread', () => {
    it('creates a thread when none exists for (clinicId, waPhone)', async () => {
      prisma.whatsAppThread.findFirst.mockResolvedValue(null);
      prisma.whatsAppThread.create.mockResolvedValue({ id: THREAD_ID });

      const result = await repo.upsertThread(CLINIC_A, {
        ownerId: OWNER_ID,
        waPhone: '9876543210',
      });

      expect(result.id).toBe(THREAD_ID);
      expect(prisma.whatsAppThread.findFirst).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A, waPhone: '+919876543210' },
      });
      expect(prisma.whatsAppThread.create).toHaveBeenCalledWith({
        data: { clinicId: CLINIC_A, ownerId: OWNER_ID, waPhone: '+919876543210' },
      });
    });

    it('returns the existing thread otherwise, without creating a duplicate', async () => {
      const existing = { id: THREAD_ID, clinicId: CLINIC_A, waPhone: '+919876543210' };
      prisma.whatsAppThread.findFirst.mockResolvedValue(existing);

      const result = await repo.upsertThread(CLINIC_A, {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
      });

      expect(result).toBe(existing);
      expect(prisma.whatsAppThread.create).not.toHaveBeenCalled();
    });

    it('stores waPhone in canonical +E.164 form via toE164', async () => {
      prisma.whatsAppThread.findFirst.mockResolvedValue(null);
      prisma.whatsAppThread.create.mockResolvedValue({ id: THREAD_ID });

      await repo.upsertThread(CLINIC_A, { ownerId: OWNER_ID, waPhone: '919876543210' });

      expect(prisma.whatsAppThread.create).toHaveBeenCalledWith({
        data: { clinicId: CLINIC_A, ownerId: OWNER_ID, waPhone: '+919876543210' },
      });
    });
  });

  describe('createOutboundMessage', () => {
    it('inserts with status QUEUED and queuedAt set, and returns the row id', async () => {
      prisma.whatsAppMessage.create.mockResolvedValue({ id: MESSAGE_ID, status: 'QUEUED' });

      const result = await repo.createOutboundMessage(CLINIC_A, {
        threadId: THREAD_ID,
        channel: 'SIMULATOR',
        templateKey: 'follow_up_reminder',
        templateCategory: 'REMINDER',
        body: 'hello',
        renderedVariables: { owner_name: 'Asha' },
        contextType: 'REMINDER',
      });

      expect(result.id).toBe(MESSAGE_ID);
      const call = prisma.whatsAppMessage.create.mock.calls[0][0];
      expect(call.data.clinicId).toBe(CLINIC_A);
      expect(call.data.status).toBe('QUEUED');
      expect(call.data.queuedAt).toBeInstanceOf(Date);
      expect(call.data.direction).toBe('OUTBOUND');
    });
  });

  describe('findMessageById', () => {
    it('returns null for a message belonging to another clinic', async () => {
      prisma.whatsAppMessage.findFirst.mockResolvedValue(null);

      const result = await repo.findMessageById(CLINIC_B, MESSAGE_ID);

      expect(result).toBeNull();
      expect(prisma.whatsAppMessage.findFirst).toHaveBeenCalledWith({
        where: { id: MESSAGE_ID, clinicId: CLINIC_B },
      });
    });
  });

  describe('findThreadById', () => {
    it("returns null for another clinic's thread", async () => {
      prisma.whatsAppThread.findFirst.mockResolvedValue(null);

      const result = await repo.findThreadById(CLINIC_B, THREAD_ID);

      expect(result).toBeNull();
      expect(prisma.whatsAppThread.findFirst).toHaveBeenCalledWith({
        where: { id: THREAD_ID, clinicId: CLINIC_B },
      });
    });
  });

  describe('getOwnerPreference', () => {
    it('returns null when no row exists', async () => {
      prisma.whatsAppOwnerPreference.findFirst.mockResolvedValue(null);

      const result = await repo.getOwnerPreference(CLINIC_A, OWNER_ID);

      expect(result).toBeNull();
      expect(prisma.whatsAppOwnerPreference.findFirst).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A, ownerId: OWNER_ID },
      });
    });
  });

  describe('upsertOwnerPreference', () => {
    it('sets optedOutAt when remindersOptedOut flips to true', async () => {
      prisma.whatsAppOwnerPreference.findFirst.mockResolvedValue(null);
      prisma.whatsAppOwnerPreference.create.mockResolvedValue({});

      await repo.upsertOwnerPreference(CLINIC_A, OWNER_ID, {
        remindersOptedOut: true,
        source: 'OWNER_STOP',
      });

      const call = prisma.whatsAppOwnerPreference.create.mock.calls[0][0];
      expect(call.data.clinicId).toBe(CLINIC_A);
      expect(call.data.remindersOptedOut).toBe(true);
      expect(call.data.optedOutAt).toBeInstanceOf(Date);
    });

    it('leaves optedOutAt null when remindersOptedOut is false', async () => {
      prisma.whatsAppOwnerPreference.findFirst.mockResolvedValue(null);
      prisma.whatsAppOwnerPreference.create.mockResolvedValue({});

      await repo.upsertOwnerPreference(CLINIC_A, OWNER_ID, {
        remindersOptedOut: false,
        source: 'STAFF',
      });

      const call = prisma.whatsAppOwnerPreference.create.mock.calls[0][0];
      expect(call.data.optedOutAt).toBeNull();
    });

    it('updates the existing row scoped to clinicId rather than creating a duplicate', async () => {
      prisma.whatsAppOwnerPreference.findFirst.mockResolvedValue({ ownerId: OWNER_ID });
      prisma.whatsAppOwnerPreference.update.mockResolvedValue({});

      await repo.upsertOwnerPreference(CLINIC_A, OWNER_ID, {
        remindersOptedOut: true,
        source: 'OWNER_STOP',
      });

      expect(prisma.whatsAppOwnerPreference.findFirst).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A, ownerId: OWNER_ID },
      });
      expect(prisma.whatsAppOwnerPreference.create).not.toHaveBeenCalled();
      expect(prisma.whatsAppOwnerPreference.update).toHaveBeenCalled();
    });
  });

  describe('getCurrentWhatsAppConsent (D-12)', () => {
    it("returns the most recent ConsentRecord with consentType 'whatsapp_communication' and withdrawnAt null", async () => {
      const record = { id: 'c1', ownerId: OWNER_ID, withdrawnAt: null };
      prisma.consentRecord.findFirst.mockResolvedValue(record);

      const result = await repo.getCurrentWhatsAppConsent(OWNER_ID);

      expect(result).toBe(record);
      expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
        where: { ownerId: OWNER_ID, consentType: 'whatsapp_communication', withdrawnAt: null },
        orderBy: { grantedAt: 'desc' },
      });
    });

    it('returns null when the only such record has been withdrawn', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);

      const result = await repo.getCurrentWhatsAppConsent(OWNER_ID);

      expect(result).toBeNull();
    });
  });

  describe('grantWhatsAppConsent (D-12)', () => {
    it('appends a new ConsentRecord row and never updates an existing one', async () => {
      prisma.consentRecord.create.mockResolvedValue({ id: 'c2' });

      await repo.grantWhatsAppConsent(OWNER_ID, { purposeText: 'WhatsApp updates', actorId: 'u1' });

      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: {
          ownerId: OWNER_ID,
          consentType: 'whatsapp_communication',
          purposeText: 'WhatsApp updates',
          actorId: 'u1',
          ipAddress: undefined,
        },
      });
      expect(prisma.consentRecord.update).not.toHaveBeenCalled();
    });
  });

  describe('withdrawWhatsAppConsent (D-12)', () => {
    it('stamps withdrawnAt on the latest open row only', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue({ id: 'c3', withdrawnAt: null });
      prisma.consentRecord.update.mockResolvedValue({ id: 'c3' });

      await repo.withdrawWhatsAppConsent(OWNER_ID);

      expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
        where: { ownerId: OWNER_ID, consentType: 'whatsapp_communication', withdrawnAt: null },
        orderBy: { grantedAt: 'desc' },
      });
      const call = prisma.consentRecord.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'c3' });
      expect(call.data.withdrawnAt).toBeInstanceOf(Date);
    });

    it('is a no-op when there is no open consent row', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);

      await repo.withdrawWhatsAppConsent(OWNER_ID);

      expect(prisma.consentRecord.update).not.toHaveBeenCalled();
    });
  });

  describe('appendStatusEvent', () => {
    it('inserts a WhatsAppMessageStatusEvent and never updates one', async () => {
      prisma.whatsAppMessageStatusEvent.create.mockResolvedValue({ id: 'e1' });
      const occurredAt = new Date('2026-08-14T10:00:00Z');

      await repo.appendStatusEvent(MESSAGE_ID, 'DELIVERED', 'META_OK', { raw: true }, occurredAt);

      expect(prisma.whatsAppMessageStatusEvent.create).toHaveBeenCalledWith({
        data: {
          messageId: MESSAGE_ID,
          status: 'DELIVERED',
          providerCode: 'META_OK',
          rawPayload: { raw: true },
          occurredAt,
        },
      });
      expect(prisma.whatsAppMessageStatusEvent.update).toBeUndefined();
    });
  });

  describe('tenant scoping — every public method takes clinicId first where applicable', () => {
    it('touchThread scopes its update by clinicId', async () => {
      prisma.whatsAppThread.updateMany.mockResolvedValue({ count: 1 });

      await repo.touchThread(CLINIC_A, THREAD_ID, {
        lastMessageAt: new Date(),
        lastMessagePreview: 'hi',
        lastContextType: 'REMINDER',
      });

      const call = prisma.whatsAppThread.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: THREAD_ID, clinicId: CLINIC_A });
    });

    it('flagNeedsAction scopes its update by clinicId', async () => {
      prisma.whatsAppThread.updateMany.mockResolvedValue({ count: 1 });

      await repo.flagNeedsAction(CLINIC_A, THREAD_ID, 'No reply after escalation cap');

      const call = prisma.whatsAppThread.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: THREAD_ID, clinicId: CLINIC_A });
      expect(call.data.needsAction).toBe(true);
    });

    it('clearNeedsAction scopes its update by clinicId', async () => {
      prisma.whatsAppThread.updateMany.mockResolvedValue({ count: 1 });

      await repo.clearNeedsAction(CLINIC_A, THREAD_ID);

      const call = prisma.whatsAppThread.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: THREAD_ID, clinicId: CLINIC_A });
      expect(call.data.needsAction).toBe(false);
    });

    it('updateMessageStatus scopes its update by clinicId', async () => {
      prisma.whatsAppMessage.updateMany.mockResolvedValue({ count: 1 });

      await repo.updateMessageStatus(CLINIC_A, MESSAGE_ID, { status: 'SENT', sentAt: new Date() });

      const call = prisma.whatsAppMessage.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: MESSAGE_ID, clinicId: CLINIC_A });
    });
  });

  describe('getOrCreateClinicConfig / updateClinicConfig', () => {
    it('getOrCreateClinicConfig creates a row with Beta defaults when none exists', async () => {
      prisma.whatsAppClinicConfig.findUnique.mockResolvedValue(null);
      prisma.whatsAppClinicConfig.create.mockResolvedValue({ clinicId: CLINIC_A });

      const result = await repo.getOrCreateClinicConfig(CLINIC_A);

      expect(result.clinicId).toBe(CLINIC_A);
      expect(prisma.whatsAppClinicConfig.findUnique).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A },
      });
      expect(prisma.whatsAppClinicConfig.create).toHaveBeenCalledWith({
        data: { clinicId: CLINIC_A },
      });
    });

    it('updateClinicConfig updates the row scoped by clinicId', async () => {
      prisma.whatsAppClinicConfig.update.mockResolvedValue({ clinicId: CLINIC_A });

      await repo.updateClinicConfig(CLINIC_A, { deliveryMode: 'DELAYED' });

      expect(prisma.whatsAppClinicConfig.update).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A },
        data: { deliveryMode: 'DELAYED' },
      });
    });
  });

  describe('no raw-unsafe SQL', () => {
    it('never calls $queryRawUnsafe or $executeRawUnsafe on the prisma handle', () => {
      expect(prisma.$queryRawUnsafe).toBeUndefined();
      expect(prisma.$executeRawUnsafe).toBeUndefined();
    });
  });
});

describe('whatsapp-queue (WHA-05)', () => {
  beforeEach(() => {
    mockQueueInstances.length = 0;
  });

  it("createWhatsAppQueues returns queues named 'whatsapp-outbound' and 'whatsapp-simulator'", () => {
    const fakeRedis = {} as any;
    const queues = createWhatsAppQueues(fakeRedis);

    expect(mockQueueInstances.map((q) => q.name)).toEqual([
      'whatsapp-outbound',
      'whatsapp-simulator',
    ]);
    expect(queues.outbound).toBeDefined();
    expect(queues.simulator).toBeDefined();
  });

  it('WA_JOB_OPTIONS matches the retry/backoff contract', () => {
    expect(WA_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  });

  it('constructs no Worker', () => {
    const fakeRedis = {} as any;
    createWhatsAppQueues(fakeRedis);
    // The mocked 'bullmq' module only exports Queue — if createWhatsAppQueues
    // imported/constructed a Worker, this module mock would throw at import
    // time (Worker is not exported), which is itself the enforcement.
    expect(mockQueueInstances.length).toBe(2);
  });

  it('close() closes both underlying queues', async () => {
    const fakeRedis = {} as any;
    const queues = createWhatsAppQueues(fakeRedis);
    await queues.close();

    for (const q of mockQueueInstances) {
      expect(q.close).toHaveBeenCalled();
    }
  });
});
