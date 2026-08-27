import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { QueueStatus, ReplayPriority } from '@breeyo/types';
import {
  QueueOfflineReplayService,
  QUEUE_CHECK_IN_ENTITY_TYPE,
  QUEUE_STATUS_TRANSITION_ENTITY_TYPE,
  type QueueOfflineReplayGateway,
  type QueueReplayReceiptStore,
  type QueueOperationalReviewTaskStore,
  type QueueEntryRecord,
} from '../services/queueOfflineReplay.service.js';
import type { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const PET_ID = '00000000-0000-0000-0000-000000000003';
const ENTRY_ID = '00000000-0000-0000-0000-000000000100';
const DEVICE_A = 'device-a';
const DEVICE_B = 'device-b';
const FIXED_NOW = new Date('2026-08-24T10:00:00.000Z');

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: DEVICE_A,
    operationId: 'op-1',
    clinicId: CLINIC_ID,
    userId: USER_ID,
    domain: 'queue',
    entityType: QUEUE_CHECK_IN_ENTITY_TYPE,
    entityId: ENTRY_ID,
    priority: ReplayPriority.QUEUE_HIGH,
    createdAt: FIXED_NOW.toISOString(),
    payload: {
      petId: PET_ID,
      isEmergency: false,
      checkedInAt: '2026-08-24T09:30:00.000Z',
    },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord {
  return {
    id: ENTRY_ID,
    clinicId: CLINIC_ID,
    petId: PET_ID,
    checkedInBy: USER_ID,
    status: 'WAITING',
    position: 1,
    isEmergency: false,
    visitReason: null,
    checkedInAt: FIXED_NOW,
    queuePriorityAt: FIXED_NOW,
    calledAt: null,
    completedAt: null,
    archivedAt: null,
    appointmentId: null,
    ...overrides,
  };
}

function createMockGateway(): QueueOfflineReplayGateway {
  return {
    findPetInClinic: vi.fn().mockResolvedValue({ id: PET_ID }),
    findTodayActiveEntryForPet: vi.fn().mockResolvedValue(null),
    findEntryById: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    countWaiting: vi.fn().mockResolvedValue(0),
  };
}

function createMockReceipts(): QueueReplayReceiptStore {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ operationId: 'op-1' }),
  };
}

function createMockReviewTasks(): QueueOperationalReviewTaskStore {
  return {
    create: vi.fn().mockResolvedValue({ id: 'review-task-1' }),
  };
}

const context = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_A };

describe('QueueOfflineReplayService', () => {
  let gateway: ReturnType<typeof createMockGateway>;
  let receipts: ReturnType<typeof createMockReceipts>;
  let reviewTasks: ReturnType<typeof createMockReviewTasks>;
  let service: QueueOfflineReplayService;

  beforeEach(() => {
    gateway = createMockGateway();
    receipts = createMockReceipts();
    reviewTasks = createMockReviewTasks();
    service = new QueueOfflineReplayService(gateway, receipts, reviewTasks, () => FIXED_NOW);
  });

  describe('idempotency (T-10-03)', () => {
    it('applies a new check-in operation exactly once and records a replay receipt', async () => {
      vi.mocked(gateway.createEntry).mockResolvedValue(makeEntry({ position: 1 }));

      const result = await service.replayQueueOperation(context, baseEnvelope());

      expect(result.status).toBe('APPLIED');
      expect(result.entryId).toBe(ENTRY_ID);
      expect(gateway.createEntry).toHaveBeenCalledTimes(1);
      expect(receipts.create).toHaveBeenCalledTimes(1);
    });

    it('acknowledges a duplicate/flapping replay of an already-processed operation as a no-op', async () => {
      vi.mocked(receipts.findUnique).mockResolvedValue({ operationId: 'op-1' });

      const result = await service.replayQueueOperation(context, baseEnvelope());

      expect(result.status).toBe('ACKNOWLEDGED_DUPLICATE');
      expect(gateway.createEntry).not.toHaveBeenCalled();
      expect(gateway.updateEntry).not.toHaveBeenCalled();
      expect(receipts.create).not.toHaveBeenCalled();
    });
  });

  describe('sync-idempotency race (WR-1)', () => {
    it('does not let a genuine P2002 receipt-create race propagate as an unhandled error -- returns the winning request\'s ack instead', async () => {
      vi.mocked(gateway.createEntry).mockResolvedValue(makeEntry({ position: 1 }));

      // Both concurrent replays' own `findUnique` (inside
      // `replayQueueOperation`) see no existing receipt -- so both run the
      // real mutation via `gateway.createEntry`. Only one `create` can win
      // the `[clinicId, deviceId, operationId]` unique constraint; this
      // request's `create` is the loser and hits P2002.
      vi.mocked(receipts.findUnique)
        .mockResolvedValueOnce(null) // initial existingReceipt check
        .mockResolvedValueOnce({ operationId: 'op-1' }); // re-fetch after P2002 -- the winner's row
      vi.mocked(receipts.create).mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      const result = await service.replayQueueOperation(context, baseEnvelope());

      expect(result.status).toBe('ACKNOWLEDGED_DUPLICATE');
      expect(result.operationId).toBe('op-1');
    });
  });

  describe('check-in replay preserves Phase 3 queue rules', () => {
    it('preserves the offline device\'s original check-in instant as queuePriorityAt rather than the replay instant', async () => {
      vi.mocked(gateway.countWaiting).mockResolvedValue(2);
      vi.mocked(gateway.createEntry).mockResolvedValue(makeEntry({ position: 3 }));

      await service.replayQueueOperation(context, baseEnvelope());

      expect(gateway.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: CLINIC_ID,
          petId: PET_ID,
          checkedInBy: USER_ID,
          status: 'WAITING',
          position: 3,
          queuePriorityAt: new Date('2026-08-24T09:30:00.000Z'),
        }),
      );
    });

    it('rejects (without creating an entry) when the pet does not belong to the clinic', async () => {
      vi.mocked(gateway.findPetInClinic).mockResolvedValue(null);

      const result = await service.replayQueueOperation(context, baseEnvelope());

      expect(result.status).toBe('REJECTED');
      expect(gateway.createEntry).not.toHaveBeenCalled();
    });
  });

  describe('D-34: duplicate offline check-in from two devices auto-merges into one queue entry', () => {
    it('merges the second device\'s check-in into the first device\'s already-created entry instead of creating a second live entry', async () => {
      // First device's check-in already landed and created the real entry --
      // simulated here as the current server state `findTodayActiveEntryForPet`
      // observes for the second device's replay.
      const existingEntry = makeEntry({ id: ENTRY_ID, position: 1 });
      vi.mocked(gateway.findTodayActiveEntryForPet).mockResolvedValue(existingEntry);

      const secondDeviceContext = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_B };
      const secondEnvelope = baseEnvelope({
        deviceId: DEVICE_B,
        operationId: 'op-2',
        payload: {
          petId: PET_ID,
          isEmergency: false,
          checkedInAt: '2026-08-24T09:31:00.000Z',
        },
      });

      const result = await service.replayQueueOperation(secondDeviceContext, secondEnvelope);

      expect(result.status).toBe('MERGED_DUPLICATE_CHECK_IN');
      expect(result.entryId).toBe(ENTRY_ID);
      // No second live queue entry is ever created for the duplicate.
      expect(gateway.createEntry).not.toHaveBeenCalled();
      // A lightweight operational review note is recorded (D-10), not a
      // blocking clinical-style conflict, and not silence either.
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
      expect(reviewTasks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clinicId: CLINIC_ID,
            severity: 'OPERATIONAL',
            entityId: ENTRY_ID,
          }),
        }),
      );
      expect(result.reviewTaskId).toBe('review-task-1');
      // The duplicate operation still gets its own replay receipt so it is
      // never reprocessed on a future flapping replay.
      expect(receipts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ operationId: 'op-2', deviceId: DEVICE_B }),
        }),
      );
    });

    it('two independent devices checking in the same patient resolve to exactly one queue entry end to end', async () => {
      // A tiny in-memory fake standing in for the real QueueRepository, so
      // this test proves the end state (one entry) rather than just which
      // mock methods were called.
      let entries: QueueEntryRecord[] = [];
      let nextPosition = 1;

      const fakeGateway: QueueOfflineReplayGateway = {
        findPetInClinic: vi.fn().mockResolvedValue({ id: PET_ID }),
        findTodayActiveEntryForPet: vi.fn(async () => entries.find((e) => e.petId === PET_ID) ?? null),
        findEntryById: vi.fn(async (entryId: string) => entries.find((e) => e.id === entryId) ?? null),
        createEntry: vi.fn(async (data: any) => {
          const entry = makeEntry({
            id: `entry-${entries.length + 1}`,
            petId: data.petId,
            position: nextPosition,
            queuePriorityAt: data.queuePriorityAt,
          });
          nextPosition += 1;
          entries.push(entry);
          return entry;
        }),
        updateEntry: vi.fn(),
        countWaiting: vi.fn(async () => entries.length),
      };

      const fakeReviewTasks: QueueOperationalReviewTaskStore = {
        create: vi.fn().mockResolvedValue({ id: 'review-task-1' }),
      };
      const fakeReceipts: QueueReplayReceiptStore = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ operationId: 'noop' }),
      };

      const fakeService = new QueueOfflineReplayService(fakeGateway, fakeReceipts, fakeReviewTasks, () => FIXED_NOW);

      const deviceAResult = await fakeService.replayQueueOperation(
        { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_A },
        baseEnvelope({ deviceId: DEVICE_A, operationId: 'op-device-a' }),
      );
      const deviceBResult = await fakeService.replayQueueOperation(
        { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_B },
        baseEnvelope({ deviceId: DEVICE_B, operationId: 'op-device-b' }),
      );

      expect(deviceAResult.status).toBe('APPLIED');
      expect(deviceBResult.status).toBe('MERGED_DUPLICATE_CHECK_IN');
      expect(deviceBResult.entryId).toBe(deviceAResult.entryId);
      expect(entries).toHaveLength(1);
    });

    it('keeps the chronologically earlier checkedInAt when it arrives at the server AFTER the later check-in already created the live entry (verify-fix 10.11)', async () => {
      // Operation A (payload checkedInAt = T2, the LATER instant) already
      // replayed and created the live entry -- its queuePriorityAt reflects
      // that later instant, per the "preserves the offline device's
      // original check-in instant as queuePriorityAt" rule above.
      const existingEntry = makeEntry({
        id: ENTRY_ID,
        checkedInAt: FIXED_NOW,
        queuePriorityAt: new Date('2026-08-24T09:35:00.000Z'), // T2, later
      });
      vi.mocked(gateway.findTodayActiveEntryForPet).mockResolvedValue(existingEntry);
      vi.mocked(gateway.updateEntry).mockResolvedValue(
        makeEntry({
          id: ENTRY_ID,
          checkedInAt: FIXED_NOW,
          queuePriorityAt: new Date('2026-08-24T09:30:00.000Z'),
        }),
      );

      // Operation B (payload checkedInAt = T1, the EARLIER instant) is only
      // replaying now, out of network-arrival order.
      const secondDeviceContext = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_B };
      const secondEnvelope = baseEnvelope({
        deviceId: DEVICE_B,
        operationId: 'op-2',
        payload: {
          petId: PET_ID,
          isEmergency: false,
          checkedInAt: '2026-08-24T09:30:00.000Z', // T1, earlier than existingEntry's T2
        },
      });

      const result = await service.replayQueueOperation(secondDeviceContext, secondEnvelope);

      expect(result.status).toBe('MERGED_DUPLICATE_CHECK_IN');
      expect(result.entryId).toBe(ENTRY_ID);
      // The chronologically-earlier operation's instant wins, correcting
      // the entry's queue-ordering timestamp even though it lost the race
      // to create the live row.
      expect(gateway.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({ queuePriorityAt: new Date('2026-08-24T09:30:00.000Z') }),
      );
    });

    it('does not touch the existing entry\'s timestamp when the newly-arriving operation is not actually earlier', async () => {
      const existingEntry = makeEntry({
        id: ENTRY_ID,
        checkedInAt: FIXED_NOW,
        queuePriorityAt: new Date('2026-08-24T09:30:00.000Z'),
      });
      vi.mocked(gateway.findTodayActiveEntryForPet).mockResolvedValue(existingEntry);

      const secondEnvelope = baseEnvelope({
        deviceId: DEVICE_B,
        operationId: 'op-2',
        payload: {
          petId: PET_ID,
          isEmergency: false,
          checkedInAt: '2026-08-24T09:31:00.000Z', // later than existingEntry's queuePriorityAt
        },
      });

      const result = await service.replayQueueOperation(
        { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_B },
        secondEnvelope,
      );

      expect(result.status).toBe('MERGED_DUPLICATE_CHECK_IN');
      expect(gateway.updateEntry).not.toHaveBeenCalled();
    });
  });

  describe('status transition replay preserves Phase 3 rules and reviews mismatches', () => {
    function statusEnvelope(status: QueueStatus, overrides: Record<string, unknown> = {}) {
      return baseEnvelope({
        entityType: QUEUE_STATUS_TRANSITION_ENTITY_TYPE,
        entityId: ENTRY_ID,
        payload: { entryId: ENTRY_ID, status },
        ...overrides,
      });
    }

    it('applies a valid transition (WAITING -> IN_CONSULT) and stamps treatingVetId/calledAt', async () => {
      vi.mocked(gateway.findEntryById).mockResolvedValue(makeEntry({ status: 'WAITING' }));
      vi.mocked(gateway.updateEntry).mockResolvedValue(makeEntry({ status: 'IN_CONSULT' }));

      const result = await service.replayQueueOperation(context, statusEnvelope(QueueStatus.IN_CONSULT));

      expect(result.status).toBe('APPLIED');
      expect(gateway.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({ status: QueueStatus.IN_CONSULT, treatingVetId: USER_ID, calledAt: FIXED_NOW }),
      );
    });

    it('creates an operational review task instead of silently overwriting when the target entry no longer exists', async () => {
      vi.mocked(gateway.findEntryById).mockResolvedValue(null);

      const result = await service.replayQueueOperation(context, statusEnvelope(QueueStatus.IN_CONSULT));

      expect(result.status).toBe('REVIEW_CREATED');
      expect(gateway.updateEntry).not.toHaveBeenCalled();
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
    });

    it('creates an operational review task instead of silently overwriting an already-archived entry', async () => {
      vi.mocked(gateway.findEntryById).mockResolvedValue(makeEntry({ archivedAt: FIXED_NOW }));

      const result = await service.replayQueueOperation(context, statusEnvelope(QueueStatus.DONE));

      expect(result.status).toBe('REVIEW_CREATED');
      expect(gateway.updateEntry).not.toHaveBeenCalled();
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
    });

    it('creates an operational review task instead of silently overwriting a conflicting/invalid status change', async () => {
      // Server state already moved to DONE while this device was offline;
      // its own queued WAITING -> IN_CONSULT is no longer a valid transition
      // from the server's current (DONE) status.
      vi.mocked(gateway.findEntryById).mockResolvedValue(makeEntry({ status: 'DONE' }));

      const result = await service.replayQueueOperation(context, statusEnvelope(QueueStatus.IN_CONSULT));

      expect(result.status).toBe('REVIEW_CREATED');
      expect(gateway.updateEntry).not.toHaveBeenCalled();
      expect(reviewTasks.create).toHaveBeenCalledTimes(1);
    });

    it('recomputes position and stamps checkedInAt for an early EXPECTED -> WAITING check-in replay', async () => {
      vi.mocked(gateway.findEntryById).mockResolvedValue(makeEntry({ status: 'EXPECTED', position: 0 }));
      vi.mocked(gateway.countWaiting).mockResolvedValue(4);
      vi.mocked(gateway.updateEntry).mockResolvedValue(makeEntry({ status: 'WAITING', position: 5 }));

      const result = await service.replayQueueOperation(context, statusEnvelope(QueueStatus.WAITING));

      expect(result.status).toBe('APPLIED');
      expect(gateway.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({ status: QueueStatus.WAITING, position: 5, checkedInAt: FIXED_NOW }),
      );
    });
  });

  describe('createOperationalReviewTask', () => {
    it('records a lightweight OPERATIONAL-severity review note (D-10), not a clinical-severity conflict', async () => {
      const taskId = await service.createOperationalReviewTask(context, {
        operationId: 'op-x',
        entryId: ENTRY_ID,
        note: 'test note',
      });

  expect(taskId).toBe('review-task-1');
      expect(reviewTasks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: 'OPERATIONAL',
            resolutionState: 'OPEN',
            entityId: ENTRY_ID,
            originatingUserId: USER_ID,
          }),
        }),
      );
    });
  });
});

// Verify-fix 10.3: `ReplayBroadcastService` was built but never called from
// `QueueOfflineReplayService` -- a real queue-board tab never heard about a
// mobile replay landing. These prove the broadcast fires from the same
// public method `queueSync.controller.ts`'s HTTP handler calls per operation.
describe('QueueOfflineReplayService replay-broadcast wiring (verify-fix 10.3)', () => {
  let gateway: ReturnType<typeof createMockGateway>;
  let receipts: ReturnType<typeof createMockReceipts>;
  let reviewTasks: ReturnType<typeof createMockReviewTasks>;
  let broadcast: { emitReplayApplied: ReturnType<typeof vi.fn>; emitReplayConflictOpened: ReturnType<typeof vi.fn>; emitReplayFailureEscalated: ReturnType<typeof vi.fn> };
  let service: QueueOfflineReplayService;

  beforeEach(() => {
    gateway = createMockGateway();
    receipts = createMockReceipts();
    reviewTasks = createMockReviewTasks();
    broadcast = {
      emitReplayApplied: vi.fn(),
      emitReplayConflictOpened: vi.fn(),
      emitReplayFailureEscalated: vi.fn(),
    };
    service = new QueueOfflineReplayService(gateway, receipts, reviewTasks, () => FIXED_NOW, broadcast as unknown as ReplayBroadcastService);
  });

  it('emits a clinic-scoped REPLAY_APPLIED broadcast after a new check-in is applied', async () => {
    vi.mocked(gateway.createEntry).mockResolvedValue(makeEntry({ position: 1 }));

    await service.replayQueueOperation(context, baseEnvelope());

    expect(broadcast.emitReplayApplied).toHaveBeenCalledWith({ clinicId: CLINIC_ID, domain: 'queue', entityIds: [ENTRY_ID] });
    expect(broadcast.emitReplayConflictOpened).not.toHaveBeenCalled();
  });

  it('emits a clinic-scoped REPLAY_CONFLICT_OPENED broadcast (not REPLAY_APPLIED) when a duplicate check-in auto-merges into a review task (D-34)', async () => {
    const existingEntry = makeEntry({ id: ENTRY_ID, position: 1 });
    vi.mocked(gateway.findTodayActiveEntryForPet).mockResolvedValue(existingEntry);

    await service.replayQueueOperation(context, baseEnvelope({ operationId: 'op-merge-broadcast' }));

    expect(broadcast.emitReplayConflictOpened).toHaveBeenCalledWith({ clinicId: CLINIC_ID, domain: 'queue', entityIds: [ENTRY_ID] });
    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
  });

  it('emits a clinic-scoped REPLAY_APPLIED broadcast after a valid status transition is applied', async () => {
    vi.mocked(gateway.findEntryById).mockResolvedValue(makeEntry({ status: 'WAITING' }));
    vi.mocked(gateway.updateEntry).mockResolvedValue(makeEntry({ status: 'IN_CONSULT' }));

    const statusEnvelope = baseEnvelope({
      entityType: QUEUE_STATUS_TRANSITION_ENTITY_TYPE,
      entityId: ENTRY_ID,
      payload: { entryId: ENTRY_ID, status: QueueStatus.IN_CONSULT },
    });

    await service.replayQueueOperation(context, statusEnvelope);

    expect(broadcast.emitReplayApplied).toHaveBeenCalledWith({ clinicId: CLINIC_ID, domain: 'queue', entityIds: [ENTRY_ID] });
  });

  it('emits REPLAY_CONFLICT_OPENED (not REPLAY_APPLIED) when a status transition creates a review task instead of overwriting', async () => {
    vi.mocked(gateway.findEntryById).mockResolvedValue(null);

    const statusEnvelope = baseEnvelope({
      entityType: QUEUE_STATUS_TRANSITION_ENTITY_TYPE,
      entityId: ENTRY_ID,
      payload: { entryId: ENTRY_ID, status: QueueStatus.IN_CONSULT },
    });

    await service.replayQueueOperation(context, statusEnvelope);

    expect(broadcast.emitReplayConflictOpened).toHaveBeenCalledWith({ clinicId: CLINIC_ID, domain: 'queue', entityIds: [ENTRY_ID] });
    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
  });

  it('does not emit any broadcast for a duplicate/flapping replay of an already-acknowledged operation', async () => {
    vi.mocked(receipts.findUnique).mockResolvedValue({ operationId: 'op-1' });

    await service.replayQueueOperation(context, baseEnvelope());

    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
    expect(broadcast.emitReplayConflictOpened).not.toHaveBeenCalled();
  });
});
