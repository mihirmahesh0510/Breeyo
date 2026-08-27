/**
 * F2 (Phase 10 review-fix): `runReplayCycle` (syncCoordinator.ts) previously
 * had zero production callers -- nothing in the app ever subscribed to
 * connectivity and drove a replay cycle on reconnect. This module is the
 * RN-free transition-detection + in-flight-guard logic the real
 * `ConnectivityReplayProvider.tsx` wires unchanged to
 * `@react-native-community/netinfo`. Kept free of any `react-native`/NetInfo
 * import -- `apps/mobile` runs vitest in a plain `node` environment with no
 * Metro/Babel transform (see `queue-offline-utils.ts`'s header for the same
 * documented constraint) -- so it works over a minimal `ConnectivitySnapshot`
 * shape the provider maps NetInfo's own state into, and is the ONE place the
 * "is this a genuine reconnect" and "is a cycle already running" decisions
 * live.
 */

export interface ConnectivitySnapshot {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

/**
 * Mirrors NetInfo's own "online" heuristic: connected, and not explicitly
 * reported unreachable. `isInternetReachable` is `null` on some platforms
 * until NetInfo's own reachability probe resolves -- treated as "not yet
 * known to be unreachable", not as offline.
 */
export function isOnlineSnapshot(snapshot: ConnectivitySnapshot): boolean {
  return snapshot.isConnected === true && snapshot.isInternetReachable !== false;
}

export interface ConnectivityReplayDriverDeps {
  /** Runs exactly one replay cycle. The real caller wires this to
   *  `runReplayCycle(buildReplayCycleDeps(...))`. */
  runReplayCycle: () => Promise<unknown>;
  /** F9: checked ONLY on the very first connectivity snapshot this driver
   *  ever observes, and only when that snapshot is already online -- a cold
   *  app launch/login has no offline->online transition to detect, but an
   *  offline-captured op from a PRIOR session still needs to replay. The
   *  real caller wires this to `countPendingSyncOperations(db) > 0`. */
  hasPendingWork: () => Promise<boolean>;
}

export interface ConnectivityReplayDriver {
  handleConnectivityChange: (snapshot: ConnectivitySnapshot) => void;
}

/**
 * Fires `deps.runReplayCycle` exactly once per genuine offline->online
 * transition, and never again on a repeated online snapshot (e.g. from the
 * periodic re-check the real provider runs every 60s in case a reconnect
 * event from the OS is missed).
 *
 * The very first snapshot this driver ever observes has no prior state to
 * compare against, so it is never treated as an offline->online
 * "transition" -- but F9: if that first snapshot is already online, a
 * cold app launch/login can still be sitting on offline-captured work from
 * a PRIOR session that has no transition left to trigger its replay, so
 * `deps.hasPendingWork()` is checked once in that one case and a replay
 * cycle fires immediately if it resolves true.
 *
 * Also guards against overlapping cycles: a transition (or the first-
 * snapshot pending-work check) arriving while a previously-triggered cycle
 * is still in flight (the connection flapping offline/online mid-cycle) is
 * a no-op rather than a second concurrent `runReplayCycle` call.
 */
export function createConnectivityReplayDriver(deps: ConnectivityReplayDriverDeps): ConnectivityReplayDriver {
  let previousOnline: boolean | null = null;
  let cycleInFlight = false;

  function triggerReplayCycle(): void {
    if (cycleInFlight) return;
    cycleInFlight = true;
    Promise.resolve(deps.runReplayCycle()).finally(() => {
      cycleInFlight = false;
    });
  }

  return {
    handleConnectivityChange(snapshot: ConnectivitySnapshot): void {
      const online = isOnlineSnapshot(snapshot);
      const isFirstSnapshot = previousOnline === null;
      const wasOffline = previousOnline === false;
      previousOnline = online;

      if (online && wasOffline) {
        triggerReplayCycle();
        return;
      }

      if (online && isFirstSnapshot) {
        deps.hasPendingWork().then((hasPending) => {
          if (hasPending) triggerReplayCycle();
        });
      }
    },
  };
}
