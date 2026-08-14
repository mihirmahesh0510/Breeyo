import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface LockResult {
  acquired: boolean;
  lockedBy?: string;
  takenOver?: boolean;
  /** The vetId that previously held the lock, present only when takenOver is true. */
  previousVetId?: string;
}

export interface LockStatus {
  locked: boolean;
  vetName?: string;
  stale?: boolean;
}

export class ConsultationLockService {
  constructor(private readonly prisma: TenantPrismaClient) {}

  /**
   * Acquires a consultation lock. If stale lock exists, takes it over.
   * D-06: One active consultation per patient at a time.
   * D-72: Push notification to original vet on takeover.
   */
  async acquireLock(
    consultationId: string,
    vetId: string,
    vetName: string,
  ): Promise<LockResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

    const existing = await this.prisma.consultationLock.findUnique({
      where: { consultationId },
    });

    if (existing) {
      // Same vet re-acquiring — just refresh
      if (existing.vetId === vetId) {
        await this.prisma.consultationLock.update({
          where: { consultationId },
          data: { lastHeartbeat: now, expiresAt },
        });
        return { acquired: true };
      }

      // Different vet — check if stale
      if (existing.expiresAt > now) {
        return { acquired: false, lockedBy: existing.vetName };
      }

      // Stale lock — take over
      const previousVetId = existing.vetId;
      await this.prisma.consultationLock.update({
        where: { consultationId },
        data: {
          vetId,
          vetName,
          acquiredAt: now,
          lastHeartbeat: now,
          expiresAt,
        },
      });

      // D-72: Notify original vet (fire-and-forget)
      // Push notification handled by caller (see EMR controller/routes)
      return { acquired: true, takenOver: true, previousVetId };
    }

    // No existing lock — create new
    await this.prisma.consultationLock.create({
      data: {
        consultationId,
        vetId,
        vetName,
        acquiredAt: now,
        lastHeartbeat: now,
        expiresAt,
      },
    });

    return { acquired: true };
  }

  /**
   * Renews the lock heartbeat. Client should call every 60 seconds.
   */
  async heartbeat(consultationId: string, vetId: string): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

    try {
      const result = await this.prisma.consultationLock.updateMany({
        where: { consultationId, vetId },
        data: { lastHeartbeat: now, expiresAt },
      });
      return result.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Releases the lock when consultation is finalized or vet leaves.
   */
  async releaseLock(consultationId: string, vetId: string): Promise<void> {
    await this.prisma.consultationLock.deleteMany({
      where: { consultationId, vetId },
    });
  }

  /**
   * Checks current lock status for a consultation.
   */
  async isLocked(consultationId: string): Promise<LockStatus> {
    const lock = await this.prisma.consultationLock.findUnique({
      where: { consultationId },
    });

    if (!lock) {
      return { locked: false };
    }

    const now = new Date();
    const stale = lock.expiresAt <= now;

    return {
      locked: true,
      vetName: lock.vetName,
      stale,
    };
  }
}
