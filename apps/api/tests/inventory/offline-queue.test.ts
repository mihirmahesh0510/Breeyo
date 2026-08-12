import { describe, it } from 'vitest';

// INV-08: Offline scan queueing and sync replay
describe('Offline queue (INV-08)', () => {
  it.todo('queues an operation locally when the device is offline (D-19)');
  it.todo('replays queued operations in the order they were queued');
  it.todo('stops replay on the first failure and preserves the remaining queue');
  it.todo('routes replayed operations through the generic sync-operation endpoint (D-53)');
  it.todo('shows a retry banner for operations that failed to sync (D-59)');
});
