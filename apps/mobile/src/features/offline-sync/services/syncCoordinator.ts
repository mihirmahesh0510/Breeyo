import { REPLAY_PRIORITIES, ReplayPriority, type OfflineOperationEnvelope } from '@breeyo/types';

/**
 * One locally-queued operation the coordinator can send to the replay
 * ingress. `envelope` is the exact wire shape the API validates with
 * `offlineOperationEnvelopeSchema` -- the coordinator never mutates it.
 */
export interface ReplayableOperation {
  operationId: string;
  priority: ReplayPriority;
  envelope: OfflineOperationEnvelope;
}

export interface ReplayOperationOutcome {
  operationId: string;
  succeeded: boolean;
  errorCode?: string;
}

export interface ReplayPreemptionEvent {
  pausedPriority: ReplayPriority;
  resumedForPriority: ReplayPriority;
}

export interface ReplayCycleDeps {
  /**
   * Returns the operations still pending for one priority tier, in the
   * order they should be replayed (oldest first). Called repeatedly during
   * a single cycle so operations enqueued mid-cycle (D-14) are picked up
   * without waiting for the next full cycle.
   */
  getPendingOperations: (priority: ReplayPriority) => ReplayableOperation[] | Promise<ReplayableOperation[]>;
  /** Sends exactly one operation to the server and reports the outcome. */
  sendOperation: (operation: ReplayableOperation) => Promise<ReplayOperationOutcome>;
}

export interface ReplayCycleResult {
  processedOperationIds: string[];
  preemptions: ReplayPreemptionEvent[];
}

/**
 * Given the tier currently being drained and a map of how many operations
 * are pending in each tier, returns the highest tier ABOVE `currentPriority`
 * that has pending work -- or `null` if nothing higher is waiting.
 *
 * D-37: this is a pure priority-tier comparison. It never looks at conflict
 * severity, so a SAFETY_CRITICAL item sitting in CLINICAL_MEDIUM cannot
 * preempt QUEUE_HIGH -- it can only ever preempt a lower tier than its own
 * (INVENTORY_MEDIUM, ANCILLARY_LOW), the same as any other CLINICAL_MEDIUM
 * item would.
 */
export function preemptLowerPriorityReplay(
  currentPriority: ReplayPriority,
  pendingCountsByPriority: Partial<Record<ReplayPriority, number>>,
): ReplayPriority | null {
  const currentIndex = REPLAY_PRIORITIES.indexOf(currentPriority);
  for (let i = 0; i < currentIndex; i += 1) {
    const higherPriority = REPLAY_PRIORITIES[i];
    if ((pendingCountsByPriority[higherPriority] ?? 0) > 0) {
      return higherPriority;
    }
  }
  return null;
}

async function collectPendingCounts(
  deps: ReplayCycleDeps,
  priorities: readonly ReplayPriority[],
): Promise<Partial<Record<ReplayPriority, number>>> {
  const counts: Partial<Record<ReplayPriority, number>> = {};
  for (const priority of priorities) {
    // eslint-disable-next-line no-await-in-loop -- tiers must be checked in
    // ladder order so the first higher tier found is genuinely the highest.
    const pending = await deps.getPendingOperations(priority);
    counts[priority] = pending.length;
  }
  return counts;
}

/**
 * Drains the local replay backlog in queue-first tier order (D-12 to D-14):
 * `QUEUE_HIGH`, then `CLINICAL_MEDIUM`, then `INVENTORY_MEDIUM`, then
 * `ANCILLARY_LOW`. After every successfully-sent operation, it re-checks
 * every tier above the one currently being drained; if new work has arrived
 * there, the current tier is paused (its remaining items are left in place,
 * never dropped) and replay jumps back up to the newly-arrived higher tier.
 * This is what makes preemption immediate instead of "wait for the whole
 * backlog to drain" (D-14).
 *
 * If the head-of-line item in a tier fails, that tier is not retried within
 * this cycle -- the failed operation is left exactly where it was (the
 * failure-center / guided-retry flow owns retrying it) and the coordinator
 * moves on to the next tier so one stuck item cannot block every other tier
 * for the rest of the cycle.
 */
export async function runReplayCycle(deps: ReplayCycleDeps): Promise<ReplayCycleResult> {
  const processedOperationIds: string[] = [];
  const preemptions: ReplayPreemptionEvent[] = [];

  let priorityIndex = 0;

  while (priorityIndex < REPLAY_PRIORITIES.length) {
    const priority = REPLAY_PRIORITIES[priorityIndex];
    // eslint-disable-next-line no-await-in-loop -- each tier must be drained
    // (or found empty) before deciding whether to advance or preempt.
    const pending = await deps.getPendingOperations(priority);

    if (pending.length === 0) {
      priorityIndex += 1;
      continue;
    }

    const [nextOperation] = pending;
    // eslint-disable-next-line no-await-in-loop
    const outcome = await deps.sendOperation(nextOperation);

    if (!outcome.succeeded) {
      // Leave the failed operation in the backlog and stop trying this tier
      // for the rest of this cycle.
      priorityIndex += 1;
      continue;
    }

    processedOperationIds.push(outcome.operationId);

    // eslint-disable-next-line no-await-in-loop
    const higherTierCounts = await collectPendingCounts(deps, REPLAY_PRIORITIES.slice(0, priorityIndex));
    const preemptTo = preemptLowerPriorityReplay(priority, higherTierCounts);

    if (preemptTo) {
      preemptions.push({ pausedPriority: priority, resumedForPriority: preemptTo });
      priorityIndex = REPLAY_PRIORITIES.indexOf(preemptTo);
    }
    // Otherwise stay on the same tier and keep draining it.
  }

  return { processedOperationIds, preemptions };
}
