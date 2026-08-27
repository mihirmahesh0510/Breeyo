import { describe, it, expect, vi } from 'vitest';
import { createConnectivityReplayDriver, isOnlineSnapshot, type ConnectivitySnapshot } from '../services/connectivityReplayDriver';

/**
 * Finding F2: `runReplayCycle` (syncCoordinator.ts) had zero production
 * callers -- nothing in the app ever subscribed to connectivity and drove a
 * replay cycle on reconnect. `createConnectivityReplayDriver` is the actual
 * production wiring the real `ConnectivityReplayProvider.tsx` mounts (it
 * imports this module unchanged and feeds it real NetInfo snapshots); this
 * file proves that wiring, not a reimplementation of it, genuinely invokes
 * the injected replay trigger on a real offline->online transition.
 *
 * `@react-native-community/netinfo` and `ConnectivityReplayProvider.tsx`
 * itself cannot be imported here -- apps/mobile runs vitest in a plain
 * `node` environment with no Metro/Babel transform (see
 * `queue-offline-utils.ts` / `SyncFailureCenterScreen.test.tsx` for the same
 * documented constraint) -- so this module and its test work over a minimal
 * `ConnectivitySnapshot` shape instead of NetInfo's own native state type.
 */

function offline(): ConnectivitySnapshot {
  return { isConnected: false, isInternetReachable: false };
}

function online(): ConnectivitySnapshot {
  return { isConnected: true, isInternetReachable: true };
}

describe('isOnlineSnapshot', () => {
  it('is true only when connected and not explicitly reported unreachable', () => {
    expect(isOnlineSnapshot({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnlineSnapshot({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnlineSnapshot({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnlineSnapshot({ isConnected: false, isInternetReachable: true })).toBe(false);
    expect(isOnlineSnapshot({ isConnected: null, isInternetReachable: true })).toBe(false);
  });
});

describe('createConnectivityReplayDriver', () => {
  it('fires the replay trigger exactly once on a genuine offline->online transition', async () => {
    const runReplayCycle = vi.fn().mockResolvedValue(undefined);
    const hasPendingWork = vi.fn().mockResolvedValue(false);
    const driver = createConnectivityReplayDriver({ runReplayCycle, hasPendingWork });

    driver.handleConnectivityChange(offline());
    driver.handleConnectivityChange(online());
    await Promise.resolve();

    expect(runReplayCycle).toHaveBeenCalledTimes(1);
  });

  it('does not fire on the very first snapshot when there is no pending offline work, even if it is already online', async () => {
    const runReplayCycle = vi.fn().mockResolvedValue(undefined);
    const hasPendingWork = vi.fn().mockResolvedValue(false);
    const driver = createConnectivityReplayDriver({ runReplayCycle, hasPendingWork });

    driver.handleConnectivityChange(online());
    await Promise.resolve();
    await Promise.resolve();

    expect(hasPendingWork).toHaveBeenCalledTimes(1);
    expect(runReplayCycle).not.toHaveBeenCalled();
  });

  it('fires immediately on the very first snapshot when it is already online AND there is pending offline work (cold app launch/login while already connected)', async () => {
    const runReplayCycle = vi.fn().mockResolvedValue(undefined);
    const hasPendingWork = vi.fn().mockResolvedValue(true);
    const driver = createConnectivityReplayDriver({ runReplayCycle, hasPendingWork });

    driver.handleConnectivityChange(online());
    await Promise.resolve();
    await Promise.resolve();

    expect(runReplayCycle).toHaveBeenCalledTimes(1);
  });

  it('never checks pending work when the very first snapshot is offline -- nothing can replay yet either way', async () => {
    const runReplayCycle = vi.fn().mockResolvedValue(undefined);
    const hasPendingWork = vi.fn().mockResolvedValue(true);
    const driver = createConnectivityReplayDriver({ runReplayCycle, hasPendingWork });

    driver.handleConnectivityChange(offline());
    await Promise.resolve();
    await Promise.resolve();

    expect(hasPendingWork).not.toHaveBeenCalled();
    expect(runReplayCycle).not.toHaveBeenCalled();
  });

  it('does not re-fire on repeated online snapshots (the periodic re-check while already online)', async () => {
    const runReplayCycle = vi.fn().mockResolvedValue(undefined);
    const hasPendingWork = vi.fn().mockResolvedValue(false);
    const driver = createConnectivityReplayDriver({ runReplayCycle, hasPendingWork });

    driver.handleConnectivityChange(offline());
    driver.handleConnectivityChange(online());
    driver.handleConnectivityChange(online());
    driver.handleConnectivityChange(online());
    await Promise.resolve();

    expect(runReplayCycle).toHaveBeenCalledTimes(1);
  });

  it('fires again on a later offline->online cycle once the previous cycle has resolved', async () => {
    const runReplayCycle = vi.fn().mockResolvedValue(undefined);
    const hasPendingWork = vi.fn().mockResolvedValue(false);
    const driver = createConnectivityReplayDriver({ runReplayCycle, hasPendingWork });

    driver.handleConnectivityChange(offline());
    driver.handleConnectivityChange(online());
    await Promise.resolve();
    await Promise.resolve();

    driver.handleConnectivityChange(offline());
    driver.handleConnectivityChange(online());
    await Promise.resolve();

    expect(runReplayCycle).toHaveBeenCalledTimes(2);
  });

  it('never starts a second cycle while one is still in flight, even if the connection flaps', async () => {
    let resolveFirstCycle: () => void = () => {};
    const firstCycle = new Promise<void>((resolve) => {
      resolveFirstCycle = resolve;
    });
    const runReplayCycle = vi.fn().mockReturnValueOnce(firstCycle).mockResolvedValue(undefined);
    const hasPendingWork = vi.fn().mockResolvedValue(false);
    const driver = createConnectivityReplayDriver({ runReplayCycle, hasPendingWork });

    driver.handleConnectivityChange(offline());
    driver.handleConnectivityChange(online());
    await Promise.resolve();
    expect(runReplayCycle).toHaveBeenCalledTimes(1);

    // The connection flaps while the first cycle is still in flight -- must
    // not start an overlapping second cycle.
    driver.handleConnectivityChange(offline());
    driver.handleConnectivityChange(online());
    await Promise.resolve();
    expect(runReplayCycle).toHaveBeenCalledTimes(1);

    resolveFirstCycle();
    await firstCycle;
    await Promise.resolve();

    // Now that the first cycle has resolved, a fresh transition triggers a
    // genuinely new cycle.
    driver.handleConnectivityChange(offline());
    driver.handleConnectivityChange(online());
    await Promise.resolve();
    expect(runReplayCycle).toHaveBeenCalledTimes(2);
  });
});
