import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmrController } from '../emr.controller.js';
import type { EmrService } from '../emr.service.js';
import type { ConsultationLockService } from '../consultation-lock.service.js';
import type { NotificationBus } from '../../notifications/notification-bus.js';

function createMockEmrService() {
  return {
    getConsultation: vi.fn(),
  } as unknown as EmrService;
}

function createMockLockService() {
  return {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  } as unknown as ConsultationLockService;
}

function createMockNotificationBus() {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationBus;
}

function createMockReply() {
  const reply: any = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: { consultationId: 'consult-1' },
    user: { id: 'vet-1', activeClinicId: 'clinic-1' },
    userName: 'Dr. New',
    log: { error: vi.fn() },
    ...overrides,
  } as any;
}

describe('EMR controller — lock endpoints (Bug fix #5)', () => {
  let emrService: ReturnType<typeof createMockEmrService>;
  let lockService: ReturnType<typeof createMockLockService>;
  let notificationBus: ReturnType<typeof createMockNotificationBus>;
  let controller: ReturnType<typeof createEmrController>;

  beforeEach(() => {
    emrService = createMockEmrService();
    lockService = createMockLockService();
    notificationBus = createMockNotificationBus();
    controller = createEmrController(emrService, lockService, notificationBus);
  });

  describe('acquireLockHandler', () => {
    it('acquires the lock and returns takenOver: true when a stale lock is taken over', async () => {
      vi.mocked(lockService.acquireLock).mockResolvedValue({
        acquired: true,
        takenOver: true,
        previousVetId: 'vet-old',
      });
      vi.mocked(emrService.getConsultation).mockResolvedValue({
        id: 'consult-1',
        pet: { name: 'Buddy' },
      } as any);

      const request = createMockRequest();
      const reply = createMockReply();

      await controller.acquireLockHandler(request, reply);

      expect(lockService.acquireLock).toHaveBeenCalledWith('consult-1', 'vet-1', 'Dr. New');
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({
        data: { acquired: true, takenOver: true, previousVetId: 'vet-old' },
      });
    });

    it('fires a D-72 push notification to the previous vet on takeover', async () => {
      vi.mocked(lockService.acquireLock).mockResolvedValue({
        acquired: true,
        takenOver: true,
        previousVetId: 'vet-old',
      });
      vi.mocked(emrService.getConsultation).mockResolvedValue({
        id: 'consult-1',
        pet: { name: 'Buddy' },
      } as any);

      const request = createMockRequest();
      const reply = createMockReply();

      await controller.acquireLockHandler(request, reply);

      expect(notificationBus.emit).toHaveBeenCalledOnce();
      const event = vi.mocked(notificationBus.emit).mock.calls[0][0];
      expect(event.recipientUserIds).toEqual(['vet-old']);
      expect(event.clinicId).toBe('clinic-1');
      expect(event.body).toContain('Buddy');
      expect(event.body).toContain('Dr. New');
    });

    it('does not fire a notification when the lock is freshly acquired (no takeover)', async () => {
      vi.mocked(lockService.acquireLock).mockResolvedValue({ acquired: true });

      const request = createMockRequest();
      const reply = createMockReply();

      await controller.acquireLockHandler(request, reply);

      expect(notificationBus.emit).not.toHaveBeenCalled();
    });

    it('does not fail the request when the notification send throws', async () => {
      vi.mocked(lockService.acquireLock).mockResolvedValue({
        acquired: true,
        takenOver: true,
        previousVetId: 'vet-old',
      });
      vi.mocked(emrService.getConsultation).mockRejectedValue(new Error('lookup failed'));

      const request = createMockRequest();
      const reply = createMockReply();

      await controller.acquireLockHandler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(request.log.error).toHaveBeenCalled();
    });
  });

  describe('releaseLockHandler', () => {
    it('releases the lock for the calling vet', async () => {
      vi.mocked(lockService.releaseLock).mockResolvedValue(undefined);

      const request = createMockRequest();
      const reply = createMockReply();

      await controller.releaseLockHandler(request, reply);

      expect(lockService.releaseLock).toHaveBeenCalledWith('consult-1', 'vet-1');
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ data: { released: true } });
    });
  });
});
