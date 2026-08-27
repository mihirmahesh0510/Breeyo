import { describe, it, expect } from 'vitest';
import { ReplayPriority, ConflictSeverity } from '@breeyo/types';
import { QueuePreemptionService } from '../services/queuePreemption.service.js';

/**
 * D-12 to D-14: queue replay always runs first and can interrupt (preempt)
 * lower-tier replay work that has not yet been sent. D-37: this ordering has
 * no severity-based exception -- a SAFETY_CRITICAL conflict sitting in
 * CLINICAL_MEDIUM still waits its own turn behind QUEUE_HIGH like any other
 * CLINICAL_MEDIUM item.
 */
describe('QueuePreemptionService', () => {
  const service = new QueuePreemptionService();

  describe('canRunQueueReplayNow', () => {
    it('is always true -- queue replay is never blocked by any other tier (D-12)', () => {
      expect(service.canRunQueueReplayNow()).toBe(true);
    });
  });

  describe('pauseLowerTierReplayForQueue', () => {
    it('never pauses QUEUE_HIGH itself, even if (nonsensically) asked to', () => {
      const result = service.pauseLowerTierReplayForQueue({
        currentTierPriority: ReplayPriority.QUEUE_HIGH,
        queueHighPendingCount: 5,
      });
      expect(result.shouldPause).toBe(false);
    });

    it.each([ReplayPriority.CLINICAL_MEDIUM, ReplayPriority.INVENTORY_MEDIUM, ReplayPriority.ANCILLARY_LOW])(
      'pauses %s replay while QUEUE_HIGH operations are still pending (D-14)',
      (currentTierPriority) => {
        const result = service.pauseLowerTierReplayForQueue({
          currentTierPriority,
          queueHighPendingCount: 2,
        });
        expect(result.shouldPause).toBe(true);
        expect(result.reason).toMatch(/QUEUE_HIGH/);
      },
    );

    it.each([ReplayPriority.CLINICAL_MEDIUM, ReplayPriority.INVENTORY_MEDIUM, ReplayPriority.ANCILLARY_LOW])(
      'does not pause %s replay once no QUEUE_HIGH operations remain pending',
      (currentTierPriority) => {
        const result = service.pauseLowerTierReplayForQueue({
          currentTierPriority,
          queueHighPendingCount: 0,
        });
        expect(result.shouldPause).toBe(false);
      },
    );

    it('D-37: a SAFETY_CRITICAL conflict in CLINICAL_MEDIUM still pauses behind pending QUEUE_HIGH work -- severity is not even an input the function can key off of', () => {
      // The function signature has no severity parameter at all: this test
      // documents that pauseLowerTierReplayForQueue structurally cannot let
      // a conflict's severity bypass queue-first ordering, closing off the
      // "just pass severity: SAFETY_CRITICAL and skip the pause" escape
      // hatch some other implementation might be tempted to add.
      const result = service.pauseLowerTierReplayForQueue({
        currentTierPriority: ReplayPriority.CLINICAL_MEDIUM,
        queueHighPendingCount: 1,
        // @ts-expect-error -- severity is intentionally not part of the input shape.
        severity: ConflictSeverity.SAFETY_CRITICAL,
      });
      expect(result.shouldPause).toBe(true);
    });
  });
});
