// Plan 09-04 Task 1: browser-only realtime sync metadata. D-40, D-42, D-43.
//
// BrowserSyncService is the one place that turns a raw record's
// updatedAt/actor into the four inline-refresh fields browser workbenches
// render (`staleVersion`, `changedByUser`, `changedAt`, `reviewPath`), and
// emits them on the browser-only socket events declared in
// `socket.events.ts` -- never the shared `@breeyo/types` `SOCKET_EVENTS`,
// which mobile also listens on and must not be widened just for a browser
// stale-state prompt (D-42: no blanket toast-only broadcast for every
// normal change).
import { describe, it, expect, vi } from 'vitest';
import { BrowserSyncService, staleWriteConflictError } from '../browser-sync.service.js';
import { BROWSER_SYNC_EVENTS } from '../socket.events.js';

const CLINIC_ID = 'clinic_1';

function makeIo() {
  const emit = vi.fn();
  const to = vi.fn().mockReturnValue({ emit });
  return { io: { to } as unknown as { to: typeof to }, to, emit };
}

describe('BrowserSyncService.buildChangeMetadata (D-40, D-43)', () => {
  it('returns staleVersion, changedByUser, changedAt, and reviewPath', () => {
    const service = new BrowserSyncService(null);
    const updatedAt = new Date('2026-08-20T10:00:00.000Z');

    const metadata = service.buildChangeMetadata({
      updatedAt,
      changedByName: 'Priya Sharma',
      reviewPath: '/queue?entryId=entry_1',
    });

    expect(metadata.staleVersion).toBe(updatedAt.getTime());
    expect(metadata.changedByUser).toBe('Priya Sharma');
    expect(metadata.changedAt).toBe(updatedAt.toISOString());
    expect(metadata.reviewPath).toBe('/queue?entryId=entry_1');
  });

  it('falls back to the user id when no display name is available', () => {
    const service = new BrowserSyncService(null);
    const updatedAt = new Date('2026-08-20T10:00:00.000Z');

    const metadata = service.buildChangeMetadata({
      updatedAt,
      changedByUserId: 'user_42',
      changedByName: null,
      reviewPath: '/billing?invoiceId=inv_1',
    });

    expect(metadata.changedByUser).toBe('user_42');
  });

  it('reports no actor as null rather than a placeholder string', () => {
    const service = new BrowserSyncService(null);
    const metadata = service.buildChangeMetadata({
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      reviewPath: '/queue',
    });

    expect(metadata.changedByUser).toBeNull();
  });
});

describe('BrowserSyncService.resolveStaleStatus (D-40)', () => {
  it('is fresh when the caller has never seen a version yet', () => {
    const service = new BrowserSyncService(null);
    expect(service.resolveStaleStatus(1000, undefined)).toBe('fresh');
  });

  it('is fresh when the caller already knows the current-or-newer version', () => {
    const service = new BrowserSyncService(null);
    expect(service.resolveStaleStatus(1000, 1000)).toBe('fresh');
    expect(service.resolveStaleStatus(1000, 2000)).toBe('fresh');
  });

  it('is stale when the caller is behind the server version, rather than silently overwriting it', () => {
    const service = new BrowserSyncService(null);
    expect(service.resolveStaleStatus(2000, 1000)).toBe('stale');
  });
});

describe('BrowserSyncService.checkWriteVersion (Plan 10-05: closing the browser optimistic-concurrency gap, D-05)', () => {
  it('is ok when the caller sent no expectedVersion at all (never a breaking change for existing callers)', () => {
    const service = new BrowserSyncService(null);
    expect(service.checkWriteVersion(2000, undefined)).toBe('ok');
    expect(service.checkWriteVersion(2000, null)).toBe('ok');
  });

  it('is ok when the caller\'s expectedVersion is current or newer', () => {
    const service = new BrowserSyncService(null);
    expect(service.checkWriteVersion(2000, 2000)).toBe('ok');
  });

  it('is stale when the caller\'s expectedVersion is behind the row\'s current version', () => {
    const service = new BrowserSyncService(null);
    expect(service.checkWriteVersion(2000, 1000)).toBe('stale');
  });
});

describe('staleWriteConflictError (mirrors SyncConflictEnvelope\'s shape for a rejected browser write)', () => {
  it('builds a 409 STALE_WRITE_CONFLICT error carrying domain/entity/version info', () => {
    const error = staleWriteConflictError({
      domain: 'queue',
      entityType: 'QUEUE_ENTRY',
      entityId: 'entry_1',
      currentVersion: 2000,
      expectedVersion: 1000,
    });

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('STALE_WRITE_CONFLICT');
    expect(error.conflict).toMatchObject({
      domain: 'queue',
      entityType: 'QUEUE_ENTRY',
      entityId: 'entry_1',
      currentVersion: 2000,
      expectedVersion: 1000,
      severity: 'OPERATIONAL',
    });
  });
});

describe('BrowserSyncService realtime emission (D-42)', () => {
  it('emits the queue browser-sync event into the clinic room, not a shared mobile event', () => {
    const { io, to, emit } = makeIo();
    const service = new BrowserSyncService(io as never);

    service.emitQueueSync(CLINIC_ID, {
      entryId: 'entry_1',
      staleVersion: 1000,
      changedByUser: 'Priya Sharma',
      changedAt: '2026-08-20T10:00:00.000Z',
      reviewPath: '/queue?entryId=entry_1',
    });

    expect(to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    expect(emit).toHaveBeenCalledWith(
      BROWSER_SYNC_EVENTS.QUEUE_BOARD_SYNC,
      expect.objectContaining({ entryId: 'entry_1', staleVersion: 1000 }),
    );
  });

  it('emits the billing browser-sync event on its own channel', () => {
    const { io, to, emit } = makeIo();
    const service = new BrowserSyncService(io as never);

    service.emitBillingSync(CLINIC_ID, {
      invoiceId: 'inv_1',
      staleVersion: 2000,
      changedByUser: null,
      changedAt: '2026-08-20T10:00:00.000Z',
      reviewPath: '/billing?invoiceId=inv_1',
    });

    expect(to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    expect(emit).toHaveBeenCalledWith(
      BROWSER_SYNC_EVENTS.BILLING_WORKBENCH_SYNC,
      expect.objectContaining({ invoiceId: 'inv_1' }),
    );
  });

  it('does not throw when no Socket.IO server is attached (unit-test / non-realtime contexts)', () => {
    const service = new BrowserSyncService(null);
    expect(() =>
      service.emitQueueSync(CLINIC_ID, {
        entryId: 'entry_1',
        staleVersion: 1000,
        changedByUser: null,
        changedAt: '2026-08-20T10:00:00.000Z',
        reviewPath: '/queue',
      }),
    ).not.toThrow();
  });
});
