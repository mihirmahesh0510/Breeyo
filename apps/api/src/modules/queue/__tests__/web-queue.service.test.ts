// Plan 09-04 Task 1: browser queue workbench. D-07, D-40, D-41, D-43.
import { describe, it, expect, vi } from 'vitest';
import { WebQueueService } from '../web-queue.service.js';
import { BrowserSyncService } from '../../../realtime/browser-sync.service.js';

const CLINIC_ID = 'clinic_1';
const USER_ID = 'user_admin_1';

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry_1',
    petId: 'pet_1',
    checkedInBy: 'user_fd_1',
    treatingVetId: null,
    status: 'WAITING',
    isEmergency: false,
    visitReason: 'Annual checkup',
    checkedInAt: new Date('2026-08-20T09:00:00.000Z'),
    queuePriorityAt: new Date('2026-08-20T09:00:00.000Z'),
    updatedAt: new Date('2026-08-20T09:00:00.000Z'),
    pet: { name: 'Bruno', owner: { name: 'Asha Rao' } },
    ...overrides,
  };
}

function makeQueueService(board: {
  expected?: ReturnType<typeof makeEntry>[];
  waiting?: ReturnType<typeof makeEntry>[];
  inConsult?: ReturnType<typeof makeEntry>[];
  done?: ReturnType<typeof makeEntry>[];
}) {
  return {
    getQueueBoard: vi.fn().mockResolvedValue({
      expected: board.expected ?? [],
      waiting: (board.waiting ?? []).map((entry, index) => ({
        ...entry,
        computedPosition: index + 1,
        estimatedWaitSeconds: (index + 1) * 900,
      })),
      inConsult: board.inConsult ?? [],
      done: board.done ?? [],
    }),
    updateStatus: vi.fn().mockResolvedValue(makeEntry({ status: 'IN_CONSULT', updatedAt: new Date('2026-08-20T09:05:00.000Z') })),
  };
}

function makeDb(
  users: Array<{ id: string; fullName: string }> = [],
  queueEntry?: { updatedAt: Date } | null,
) {
  const liveRow = queueEntry ?? null;
  return {
    user: {
      findMany: vi.fn().mockResolvedValue(users),
    },
    queueEntry: {
      findUnique: vi.fn().mockResolvedValue(liveRow),
      // Verify-fix 10.10: mirrors the real atomic conditional UPDATE --
      // matches (and "claims" the version) only when the caller's
      // `expectedVersion` equals this row's live `updatedAt`, exactly like
      // Postgres's `WHERE id = ? AND updated_at = ?` would.
      updateMany: vi.fn().mockImplementation(({ where }: { where: { updatedAt: Date } }) => {
        if (liveRow && where.updatedAt.getTime() === liveRow.updatedAt.getTime()) {
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      }),
    },
  };
}

function buildService(opts: {
  db?: ReturnType<typeof makeDb>;
  queueService?: ReturnType<typeof makeQueueService>;
}) {
  const db = opts.db ?? makeDb();
  const queueService = opts.queueService ?? makeQueueService({});
  const browserSyncService = new BrowserSyncService(null);
  const service = new WebQueueService(db as never, queueService as never, browserSyncService);
  return { service, db, queueService, browserSyncService };
}

describe('WebQueueService.getBoard expected-arrival separation (D-07, D-41)', () => {
  it('keeps scheduled/expected arrivals in their own section, distinct from ordinary waiting entries', async () => {
    const expected = [makeEntry({ id: 'entry_expected_1', status: 'EXPECTED' })];
    const waiting = [makeEntry({ id: 'entry_waiting_1' })];
    const { service } = buildService({ queueService: makeQueueService({ expected, waiting }) });

    const board = await service.getBoard(CLINIC_ID, USER_ID);

    expect(board.expectedArrivals).toHaveLength(1);
    expect(board.expectedArrivals[0].id).toBe('entry_expected_1');
    expect(board.expectedArrivals.every((entry) => entry.isExpectedArrival)).toBe(true);

    expect(board.waiting).toHaveLength(1);
    expect(board.waiting[0].id).toBe('entry_waiting_1');
    expect(board.waiting.every((entry) => entry.isExpectedArrival)).toBe(false);
  });

  it('never merges expected arrivals into the waiting section (no week-calendar-style flattening)', async () => {
    const expected = [makeEntry({ id: 'entry_expected_1', status: 'EXPECTED' })];
    const { service } = buildService({ queueService: makeQueueService({ expected }) });

    const board = await service.getBoard(CLINIC_ID, USER_ID);

    expect(board.waiting.some((entry) => entry.id === 'entry_expected_1')).toBe(false);
  });
});

describe('WebQueueService.getBoard stale-version metadata (D-40, D-43)', () => {
  it('attaches per-entry change metadata with staleVersion, changedByUser, and reviewPath', async () => {
    const waiting = [makeEntry({ id: 'entry_1', checkedInBy: 'user_fd_1' })];
    const db = makeDb([{ id: 'user_fd_1', fullName: 'Priya Sharma' }]);
    const { service } = buildService({ db, queueService: makeQueueService({ waiting }) });

    const board = await service.getBoard(CLINIC_ID, USER_ID);
    const entry = board.waiting[0];

    expect(entry.changeMetadata.staleVersion).toBe(new Date('2026-08-20T09:00:00.000Z').getTime());
    expect(entry.changeMetadata.changedByUser).toBe('Priya Sharma');
    expect(entry.changeMetadata.reviewPath).toContain('entry_1');
  });

  it('reports the board as fresh when the caller has no known prior version', async () => {
    const { service } = buildService({ queueService: makeQueueService({ waiting: [makeEntry()] }) });

    const board = await service.getBoard(CLINIC_ID, USER_ID);

    expect(board.staleState).toBe('fresh');
  });

  it('reports the board as stale when the caller is behind the newest entry version, instead of silently applying stale data', async () => {
    const waiting = [makeEntry({ updatedAt: new Date('2026-08-20T09:30:00.000Z') })];
    const { service } = buildService({ queueService: makeQueueService({ waiting }) });

    const serverVersion = new Date('2026-08-20T09:30:00.000Z').getTime();
    const board = await service.getBoard(CLINIC_ID, USER_ID, serverVersion - 1000);

    expect(board.staleState).toBe('stale');
  });
});

describe('WebQueueService.updateEntryStatus (D-43)', () => {
  it('delegates to QueueService.updateStatus and returns entry change metadata', async () => {
    const queueService = makeQueueService({});
    const { service } = buildService({ queueService });

    const result = await service.updateEntryStatus(CLINIC_ID, USER_ID, 'entry_1', 'IN_CONSULT' as never);

    expect(queueService.updateStatus).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      entryId: 'entry_1',
      status: 'IN_CONSULT',
      userId: USER_ID,
    });
    expect(result.changeMetadata.staleVersion).toBe(new Date('2026-08-20T09:05:00.000Z').getTime());
  });
});

describe('WebQueueService.updateEntryStatus optimistic-concurrency enforcement (Plan 10-05, D-05)', () => {
  it('applies the write normally when expectedVersion is omitted (no breaking change for existing callers)', async () => {
    const queueService = makeQueueService({});
    const db = makeDb([], { updatedAt: new Date('2026-08-20T09:00:00.000Z') });
    const { service } = buildService({ db, queueService });

    const result = await service.updateEntryStatus(CLINIC_ID, USER_ID, 'entry_1', 'IN_CONSULT' as never);

    expect(queueService.updateStatus).toHaveBeenCalled();
    expect(result.changeMetadata.staleVersion).toBe(new Date('2026-08-20T09:05:00.000Z').getTime());
  });

  it('applies the write when expectedVersion is current (matches the row\'s live updatedAt)', async () => {
    const queueService = makeQueueService({});
    const liveUpdatedAt = new Date('2026-08-20T09:00:00.000Z');
    const db = makeDb([], { updatedAt: liveUpdatedAt });
    const { service } = buildService({ db, queueService });

    await service.updateEntryStatus(CLINIC_ID, USER_ID, 'entry_1', 'IN_CONSULT' as never, liveUpdatedAt.getTime());

    expect(queueService.updateStatus).toHaveBeenCalled();
  });

  it('rejects the write with a 409 STALE_WRITE_CONFLICT when expectedVersion is behind the row\'s live updatedAt, instead of silently applying it', async () => {
    const queueService = makeQueueService({});
    const liveUpdatedAt = new Date('2026-08-20T09:30:00.000Z');
    const db = makeDb([], { updatedAt: liveUpdatedAt });
    const { service } = buildService({ db, queueService });

    const staleExpectedVersion = liveUpdatedAt.getTime() - 60_000;

    await expect(
      service.updateEntryStatus(CLINIC_ID, USER_ID, 'entry_1', 'IN_CONSULT' as never, staleExpectedVersion),
    ).rejects.toMatchObject({ statusCode: 409, code: 'STALE_WRITE_CONFLICT' });

    expect(queueService.updateStatus).not.toHaveBeenCalled();
  });
});
