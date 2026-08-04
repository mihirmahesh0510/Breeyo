import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsultationLockService } from '../consultation-lock.service.js';

function createMockPrisma() {
  return {
    consultationLock: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  } as any;
}

describe('ConsultationLockService', () => {
  let service: ConsultationLockService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ConsultationLockService(prisma);
  });

  describe('acquireLock', () => {
    it('creates a new lock when none exists', async () => {
      prisma.consultationLock.findUnique.mockResolvedValue(null);
      prisma.consultationLock.create.mockResolvedValue({});

      const result = await service.acquireLock('consult-1', 'vet-1', 'Dr. Test');

      expect(result.acquired).toBe(true);
      expect(result.takenOver).toBeUndefined();
      expect(prisma.consultationLock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          consultationId: 'consult-1',
          vetId: 'vet-1',
          vetName: 'Dr. Test',
        }),
      });
    });

    it('rejects when fresh lock exists from different vet', async () => {
      const futureDate = new Date(Date.now() + 300000); // 5 min from now
      prisma.consultationLock.findUnique.mockResolvedValue({
        consultationId: 'consult-1',
        vetId: 'vet-2',
        vetName: 'Dr. Other',
        expiresAt: futureDate,
      });

      const result = await service.acquireLock('consult-1', 'vet-1', 'Dr. Test');

      expect(result.acquired).toBe(false);
      expect(result.lockedBy).toBe('Dr. Other');
      expect(prisma.consultationLock.create).not.toHaveBeenCalled();
    });

    it('allows same vet to re-acquire (refreshes lock)', async () => {
      const futureDate = new Date(Date.now() + 300000);
      prisma.consultationLock.findUnique.mockResolvedValue({
        consultationId: 'consult-1',
        vetId: 'vet-1',
        vetName: 'Dr. Test',
        expiresAt: futureDate,
      });
      prisma.consultationLock.update.mockResolvedValue({});

      const result = await service.acquireLock('consult-1', 'vet-1', 'Dr. Test');

      expect(result.acquired).toBe(true);
      expect(prisma.consultationLock.update).toHaveBeenCalled();
    });

    it('takes over stale lock from different vet', async () => {
      const pastDate = new Date(Date.now() - 60000); // 1 min ago (expired)
      prisma.consultationLock.findUnique.mockResolvedValue({
        consultationId: 'consult-1',
        vetId: 'vet-2',
        vetName: 'Dr. Other',
        expiresAt: pastDate,
      });
      prisma.consultationLock.update.mockResolvedValue({});

      const result = await service.acquireLock('consult-1', 'vet-1', 'Dr. Test');

      expect(result.acquired).toBe(true);
      expect(result.takenOver).toBe(true);
      expect(prisma.consultationLock.update).toHaveBeenCalledWith({
        where: { consultationId: 'consult-1' },
        data: expect.objectContaining({
          vetId: 'vet-1',
          vetName: 'Dr. Test',
        }),
      });
    });
  });

  describe('heartbeat', () => {
    it('updates lock expiry on successful heartbeat', async () => {
      prisma.consultationLock.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.heartbeat('consult-1', 'vet-1');

      expect(result).toBe(true);
      expect(prisma.consultationLock.updateMany).toHaveBeenCalledWith({
        where: { consultationId: 'consult-1', vetId: 'vet-1' },
        data: expect.objectContaining({
          lastHeartbeat: expect.any(Date),
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('returns false when lock not found or wrong vet', async () => {
      prisma.consultationLock.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.heartbeat('consult-1', 'vet-wrong');

      expect(result).toBe(false);
    });
  });

  describe('releaseLock', () => {
    it('deletes the lock record', async () => {
      prisma.consultationLock.deleteMany.mockResolvedValue({ count: 1 });

      await service.releaseLock('consult-1', 'vet-1');

      expect(prisma.consultationLock.deleteMany).toHaveBeenCalledWith({
        where: { consultationId: 'consult-1', vetId: 'vet-1' },
      });
    });
  });

  describe('isLocked', () => {
    it('returns locked: false when no lock exists', async () => {
      prisma.consultationLock.findUnique.mockResolvedValue(null);

      const result = await service.isLocked('consult-1');

      expect(result.locked).toBe(false);
    });

    it('returns locked: true with vetName for fresh lock', async () => {
      const futureDate = new Date(Date.now() + 300000);
      prisma.consultationLock.findUnique.mockResolvedValue({
        vetName: 'Dr. Test',
        expiresAt: futureDate,
      });

      const result = await service.isLocked('consult-1');

      expect(result.locked).toBe(true);
      expect(result.vetName).toBe('Dr. Test');
      expect(result.stale).toBe(false);
    });

    it('returns stale: true for expired lock', async () => {
      const pastDate = new Date(Date.now() - 60000);
      prisma.consultationLock.findUnique.mockResolvedValue({
        vetName: 'Dr. Test',
        expiresAt: pastDate,
      });

      const result = await service.isLocked('consult-1');

      expect(result.locked).toBe(true);
      expect(result.stale).toBe(true);
    });
  });
});
