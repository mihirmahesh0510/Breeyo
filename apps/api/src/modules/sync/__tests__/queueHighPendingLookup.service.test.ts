import { describe, it, expect, vi } from 'vitest';
import { resolveQueueHighPendingCount, type QueueHighPendingLookupDb } from '../services/queueHighPendingLookup.service.js';

/**
 * WR-10: the domain-specific replay endpoints (`/inventory/sync/replay`,
 * `/consultations/sync/replay`) cannot pre-scan a mixed batch for QUEUE_HIGH
 * envelopes the way `replayIngest.service.ts` does (each domain-specific
 * call only ever carries that domain's own envelope(s)). Instead, the
 * calling device reports which QUEUE_HIGH operationIds it still considers
 * locally pending, and this helper verifies that claim against the real
 * `SyncReplayReceipt` ledger rather than trusting it verbatim.
 */
describe('resolveQueueHighPendingCount', () => {
  function fakeDb(receiptOperationIds: string[]): QueueHighPendingLookupDb {
    return {
      syncReplayReceipt: {
        findMany: vi.fn(async ({ where }) => {
          const ids = where.operationId.in;
          return receiptOperationIds.filter((id) => ids.includes(id)).map((operationId) => ({ operationId }));
        }),
      },
    };
  }

  it('returns 0 when the caller reports no candidate operationIds', async () => {
    const db = fakeDb([]);
    const count = await resolveQueueHighPendingCount(db, {
      clinicId: 'clinic-1',
      deviceId: 'device-1',
      candidateOperationIds: [],
    });
    expect(count).toBe(0);
    expect(db.syncReplayReceipt.findMany).not.toHaveBeenCalled();
  });

  it('counts a candidate operationId as pending when it has no receipt yet', async () => {
    const db = fakeDb([]);
    const count = await resolveQueueHighPendingCount(db, {
      clinicId: 'clinic-1',
      deviceId: 'device-1',
      candidateOperationIds: ['queue-op-1'],
    });
    expect(count).toBe(1);
  });

  it('does not count a candidate operationId that already has a receipt -- the server verifies, it does not trust the raw claim', async () => {
    const db = fakeDb(['queue-op-1']);
    const count = await resolveQueueHighPendingCount(db, {
      clinicId: 'clinic-1',
      deviceId: 'device-1',
      candidateOperationIds: ['queue-op-1'],
    });
    expect(count).toBe(0);
  });

  it('counts only the candidates still lacking a receipt when the claimed list is a mix', async () => {
    const db = fakeDb(['already-applied']);
    const count = await resolveQueueHighPendingCount(db, {
      clinicId: 'clinic-1',
      deviceId: 'device-1',
      candidateOperationIds: ['already-applied', 'still-pending-1', 'still-pending-2'],
    });
    expect(count).toBe(2);
  });

  it('de-duplicates repeated ids and ignores empty-string ids', async () => {
    const db = fakeDb([]);
    const count = await resolveQueueHighPendingCount(db, {
      clinicId: 'clinic-1',
      deviceId: 'device-1',
      candidateOperationIds: ['dup', 'dup', '', 'dup'],
    });
    expect(count).toBe(1);
  });
});
