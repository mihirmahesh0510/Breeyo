import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueService } from '../queue.service.js';
import type { QueueRepository } from '../queue.repository.js';
import type { Server } from 'socket.io';

function createMockRepository(): QueueRepository {
  return {
    // D-30: checkIn verifies the pet belongs to the calling clinic first.
    // Default to "found" so the existing check-in cases exercise the paths
    // they were written for; the not-found path is asserted explicitly below.
    findPetInClinic: vi.fn().mockResolvedValue({ id: PET_ID }),
    findTodayActiveEntryForPet: vi.fn(),
    findTodayDoneEntryForPet: vi.fn(),
    countWaiting: vi.fn(),
    createEntry: vi.fn(),
    findEntryById: vi.fn(),
    updateEntry: vi.fn(),
    findNextWaiting: vi.fn(),
    getQueueBoard: vi.fn(),
    getAverageConsultDuration: vi.fn(),
    archiveEntries: vi.fn(),
  } as unknown as QueueRepository;
}

function createMockIO(): Server {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
  } as unknown as Server;
}

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const PET_ID = '00000000-0000-0000-0000-000000000003';
const ENTRY_ID = '00000000-0000-0000-0000-000000000100';

const OWNER_ID = '00000000-0000-0000-0000-000000000002';
const now = new Date();

const mockOwner = {
  id: OWNER_ID,
  clinicId: CLINIC_ID,
  mobile: '9876543210',
  name: 'Rahul',
  email: null,
  address: null,
  altPhone: null,
  createdAt: now,
  updatedAt: now,
};

const mockPet = {
  id: PET_ID,
  clinicId: CLINIC_ID,
  ownerId: OWNER_ID,
  name: 'Buddy',
  species: 'DOG' as const,
  breed: null,
  birthYear: null,
  birthMonth: null,
  weight: null,
  color: null,
  microchipId: null,
  photoUrl: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
  owner: mockOwner,
};

const mockEntry = {
  id: ENTRY_ID,
  clinicId: CLINIC_ID,
  petId: PET_ID,
  checkedInBy: USER_ID,
  treatingVetId: null,
  status: 'WAITING' as const,
  position: 1,
  isEmergency: false,
  visitReason: 'Vaccination',
  checkedInAt: now,
  calledAt: null,
  completedAt: null,
  archivedAt: null,
  updatedAt: now,
  // Phase 8 (D-08, D-10): no schema default, NOT NULL.
  queuePriorityAt: now,
  appointmentId: null,
  pet: mockPet,
};

describe('QueueService', () => {
  let service: QueueService;
  let repo: ReturnType<typeof createMockRepository>;
  let io: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    repo = createMockRepository();
    io = createMockIO();
    service = new QueueService(repo, io);
  });

  describe('checkIn', () => {
    it('creates queue entry with correct position', async () => {
      vi.mocked(repo.findTodayActiveEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.findTodayDoneEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.countWaiting).mockResolvedValue(3);
      vi.mocked(repo.createEntry).mockResolvedValue({ ...mockEntry, position: 4 });

      const result = await service.checkIn({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        petId: PET_ID,
        visitReason: 'Vaccination',
        isEmergency: false,
      });

      expect(repo.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: CLINIC_ID,
          petId: PET_ID,
          checkedInBy: USER_ID,
          status: 'WAITING',
          position: 4,
          isEmergency: false,
          visitReason: 'Vaccination',
        }),
      );
      expect(result.position).toBe(4);
    });

    it('sets emergency flag when isEmergency is true (D-15)', async () => {
      vi.mocked(repo.findTodayActiveEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.findTodayDoneEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.countWaiting).mockResolvedValue(0);
      vi.mocked(repo.createEntry).mockResolvedValue({ ...mockEntry, isEmergency: true });

      await service.checkIn({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        petId: PET_ID,
        isEmergency: true,
      });

      expect(repo.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ isEmergency: true }),
      );
    });

    it('records checkedInBy user ID', async () => {
      vi.mocked(repo.findTodayActiveEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.findTodayDoneEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.countWaiting).mockResolvedValue(0);
      vi.mocked(repo.createEntry).mockResolvedValue(mockEntry);

      await service.checkIn({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        petId: PET_ID,
      });

      expect(repo.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ checkedInBy: USER_ID }),
      );
    });

    it('rejects if pet already in queue with WAITING or IN_CONSULT status', async () => {
      vi.mocked(repo.findTodayActiveEntryForPet).mockResolvedValue(mockEntry as any);

      await expect(
        service.checkIn({
          clinicId: CLINIC_ID,
          userId: USER_ID,
          petId: PET_ID,
        }),
      ).rejects.toThrow('Pet is already in today\'s queue');
    });

    it('rejects with PET_NOT_FOUND when the pet is not in the calling clinic (D-30)', async () => {
      vi.mocked(repo.findPetInClinic).mockResolvedValue(null);

      await expect(
        service.checkIn({
          clinicId: CLINIC_ID,
          userId: USER_ID,
          petId: PET_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'PET_NOT_FOUND' });

      // The clinic-scoped lookup runs before any queue state is touched.
      expect(repo.findPetInClinic).toHaveBeenCalledWith(CLINIC_ID, PET_ID);
      expect(repo.createEntry).not.toHaveBeenCalled();
    });

    it('returns SAME_DAY_RECHECK when pet has DONE entry today without flag (D-40)', async () => {
      vi.mocked(repo.findTodayActiveEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.findTodayDoneEntryForPet).mockResolvedValue({ ...mockEntry, status: 'DONE' } as any);

      try {
        await service.checkIn({
          clinicId: CLINIC_ID,
          userId: USER_ID,
          petId: PET_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('SAME_DAY_RECHECK');
      }
    });

    it('allows re-check-in when reCheckIn flag is set (D-40)', async () => {
      vi.mocked(repo.findTodayActiveEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.countWaiting).mockResolvedValue(0);
      vi.mocked(repo.createEntry).mockResolvedValue(mockEntry);

      // With reCheckIn=true, should NOT check for done entries
      await service.checkIn({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        petId: PET_ID,
        reCheckIn: true,
      });

      expect(repo.findTodayDoneEntryForPet).not.toHaveBeenCalled();
      expect(repo.createEntry).toHaveBeenCalled();
    });

    it('broadcasts PATIENT_CHECKED_IN event', async () => {
      vi.mocked(repo.findTodayActiveEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.findTodayDoneEntryForPet).mockResolvedValue(null);
      vi.mocked(repo.countWaiting).mockResolvedValue(0);
      vi.mocked(repo.createEntry).mockResolvedValue(mockEntry);

      await service.checkIn({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        petId: PET_ID,
      });

      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
      const emitFn = vi.mocked(io.to(CLINIC_ID)).emit;
      expect(emitFn).toHaveBeenCalledWith(
        'patient:checked-in',
        expect.objectContaining({ entry: mockEntry }),
      );
    });
  });

  describe('updateStatus', () => {
    it('validates transition using state machine', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'IN_CONSULT',
      } as any);

      await service.updateStatus({
        clinicId: CLINIC_ID,
        entryId: ENTRY_ID,
        status: 'IN_CONSULT' as any,
        userId: USER_ID,
      });

      expect(repo.updateEntry).toHaveBeenCalled();
    });

    it('rejects invalid transition WAITING -> DONE', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);

      await expect(
        service.updateStatus({
          clinicId: CLINIC_ID,
          entryId: ENTRY_ID,
          status: 'DONE' as any,
          userId: USER_ID,
        }),
      ).rejects.toThrow('Cannot transition from WAITING to DONE');
    });

    it('rejects invalid transition from terminal state DONE', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue({
        ...mockEntry,
        status: 'DONE',
      } as any);

      await expect(
        service.updateStatus({
          clinicId: CLINIC_ID,
          entryId: ENTRY_ID,
          status: 'WAITING' as any,
          userId: USER_ID,
        }),
      ).rejects.toThrow('Cannot transition from DONE to WAITING');
    });

    it('sets treatingVetId on transition to IN_CONSULT (D-37)', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'IN_CONSULT',
        treatingVetId: USER_ID,
      } as any);

      await service.updateStatus({
        clinicId: CLINIC_ID,
        entryId: ENTRY_ID,
        status: 'IN_CONSULT' as any,
        userId: USER_ID,
      });

      expect(repo.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({
          status: 'IN_CONSULT',
          treatingVetId: USER_ID,
          calledAt: expect.any(Date),
        }),
      );
    });

    it('sets calledAt timestamp on transition to IN_CONSULT', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'IN_CONSULT',
      } as any);

      await service.updateStatus({
        clinicId: CLINIC_ID,
        entryId: ENTRY_ID,
        status: 'IN_CONSULT' as any,
        userId: USER_ID,
      });

      expect(repo.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({ calledAt: expect.any(Date) }),
      );
    });

    it('sets completedAt timestamp on transition to DONE', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue({
        ...mockEntry,
        status: 'IN_CONSULT',
      } as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'DONE',
      } as any);

      await service.updateStatus({
        clinicId: CLINIC_ID,
        entryId: ENTRY_ID,
        status: 'DONE' as any,
        userId: USER_ID,
      });

      expect(repo.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({
          status: 'DONE',
          completedAt: expect.any(Date),
        }),
      );
    });

    it('sets completedAt timestamp on transition to NO_SHOW', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'NO_SHOW',
      } as any);

      await service.updateStatus({
        clinicId: CLINIC_ID,
        entryId: ENTRY_ID,
        status: 'NO_SHOW' as any,
        userId: USER_ID,
      });

      expect(repo.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({ completedAt: expect.any(Date) }),
      );
    });

    it('broadcasts QUEUE_UPDATED event', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'IN_CONSULT',
      } as any);

      await service.updateStatus({
        clinicId: CLINIC_ID,
        entryId: ENTRY_ID,
        status: 'IN_CONSULT' as any,
        userId: USER_ID,
      });

      expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    });

    it('throws 404 when entry not found', async () => {
      vi.mocked(repo.findEntryById).mockResolvedValue(null);

      await expect(
        service.updateStatus({
          clinicId: CLINIC_ID,
          entryId: 'non-existent',
          status: 'IN_CONSULT' as any,
          userId: USER_ID,
        }),
      ).rejects.toThrow('Queue entry not found');
    });
  });

  describe('callNext', () => {
    it('selects oldest WAITING entry', async () => {
      vi.mocked(repo.findNextWaiting).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'IN_CONSULT',
      } as any);

      await service.callNext({
        clinicId: CLINIC_ID,
        userId: USER_ID,
      });

      expect(repo.findNextWaiting).toHaveBeenCalled();
      expect(repo.updateEntry).toHaveBeenCalled();
    });

    it('selects emergency patients before non-emergency', async () => {
      const emergencyEntry = { ...mockEntry, isEmergency: true };
      vi.mocked(repo.findNextWaiting).mockResolvedValue(emergencyEntry as any);
      vi.mocked(repo.findEntryById).mockResolvedValue(emergencyEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...emergencyEntry,
        status: 'IN_CONSULT',
      } as any);

      await service.callNext({
        clinicId: CLINIC_ID,
        userId: USER_ID,
      });

      // findNextWaiting already orders by isEmergency desc
      expect(repo.findNextWaiting).toHaveBeenCalled();
    });

    it('assigns treating vet to the entry (D-37)', async () => {
      vi.mocked(repo.findNextWaiting).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.findEntryById).mockResolvedValue(mockEntry as any);
      vi.mocked(repo.updateEntry).mockResolvedValue({
        ...mockEntry,
        status: 'IN_CONSULT',
        treatingVetId: USER_ID,
      } as any);

      await service.callNext({
        clinicId: CLINIC_ID,
        userId: USER_ID,
      });

      expect(repo.updateEntry).toHaveBeenCalledWith(
        ENTRY_ID,
        expect.objectContaining({ treatingVetId: USER_ID }),
      );
    });

    it('throws 404 when no patients waiting', async () => {
      vi.mocked(repo.findNextWaiting).mockResolvedValue(null);

      await expect(
        service.callNext({
          clinicId: CLINIC_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow('No patients waiting in queue');
    });
  });

  describe('getQueueBoard', () => {
    it('returns entries grouped by status', async () => {
      vi.mocked(repo.getQueueBoard).mockResolvedValue({
        inConsult: [{ ...mockEntry, status: 'IN_CONSULT' }],
        waiting: [mockEntry],
        done: [{ ...mockEntry, status: 'DONE' }],
      } as any);
      vi.mocked(repo.getAverageConsultDuration).mockResolvedValue(600);

      const result = await service.getQueueBoard({
        clinicId: CLINIC_ID,
      });

      expect(result.inConsult).toHaveLength(1);
      expect(result.waiting).toHaveLength(1);
      expect(result.done).toHaveLength(1);
    });

    it('computes dynamic positions for waiting entries', async () => {
      vi.mocked(repo.getQueueBoard).mockResolvedValue({
        inConsult: [],
        waiting: [
          { ...mockEntry, id: 'e1' },
          { ...mockEntry, id: 'e2' },
          { ...mockEntry, id: 'e3' },
        ],
        done: [],
      } as any);
      vi.mocked(repo.getAverageConsultDuration).mockResolvedValue(600);

      const result = await service.getQueueBoard({ clinicId: CLINIC_ID });

      expect(result.waiting[0].computedPosition).toBe(1);
      expect(result.waiting[1].computedPosition).toBe(2);
      expect(result.waiting[2].computedPosition).toBe(3);
    });

    it('computes estimated wait using average consultation time', async () => {
      vi.mocked(repo.getQueueBoard).mockResolvedValue({
        inConsult: [],
        waiting: [mockEntry],
        done: [],
      } as any);
      vi.mocked(repo.getAverageConsultDuration).mockResolvedValue(600); // 10 minutes

      const result = await service.getQueueBoard({ clinicId: CLINIC_ID });

      // Position 1 * 600 seconds = 600
      expect(result.waiting[0].estimatedWaitSeconds).toBe(600);
    });

    it('defaults to 15 min per consultation when fewer than 5 data points', async () => {
      vi.mocked(repo.getQueueBoard).mockResolvedValue({
        inConsult: [],
        waiting: [mockEntry],
        done: [],
      } as any);
      vi.mocked(repo.getAverageConsultDuration).mockResolvedValue(null);

      const result = await service.getQueueBoard({ clinicId: CLINIC_ID });

      // Position 1 * 900 seconds (15 min default) = 900
      expect(result.waiting[0].estimatedWaitSeconds).toBe(900);
    });
  });
});
