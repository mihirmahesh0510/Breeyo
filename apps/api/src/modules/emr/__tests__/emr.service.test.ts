import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmrService } from '../emr.service.js';
import type { EmrRepository } from '../emr.repository.js';
import type { ConsultationLockService } from '../consultation-lock.service.js';
import type { DosageService } from '../dosage.service.js';
import {
  mockClinic,
  mockVet,
  mockVet2,
  mockPet,
  mockVitals,
  mockConsultation,
  mockConsultationDraft,
  mockSaveDraftInput,
  mockPrescriptionItem,
} from './emr.fixtures.js';

function createMockRepository(): {
  [K in keyof EmrRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    createConsultation: vi.fn(),
    findActiveConsultation: vi.fn(),
    saveDraft: vi.fn(),
    loadDraft: vi.fn(),
    finalizeConsultation: vi.fn(),
    updatePetWeight: vi.fn(),
    updateQueueEntryStatus: vi.fn(),
    getConsultation: vi.fn(),
    getHistory: vi.fn(),
    addAddendum: vi.fn(),
    savePrescriptions: vi.fn(),
  } as any;
}

function createMockLockService(): {
  [K in keyof ConsultationLockService]: ReturnType<typeof vi.fn>;
} {
  return {
    acquireLock: vi.fn(),
    heartbeat: vi.fn(),
    releaseLock: vi.fn(),
    isLocked: vi.fn(),
  } as any;
}

function createMockDosageService(): {
  [K in keyof DosageService]: ReturnType<typeof vi.fn>;
} {
  return {
    validateDosage: vi.fn(),
    generateOwnerInstructions: vi.fn(),
  } as any;
}

describe('EmrService', () => {
  let service: EmrService;
  let repository: ReturnType<typeof createMockRepository>;
  let lockService: ReturnType<typeof createMockLockService>;
  let dosageService: ReturnType<typeof createMockDosageService>;

  beforeEach(() => {
    repository = createMockRepository();
    lockService = createMockLockService();
    dosageService = createMockDosageService();
    service = new EmrService(repository as any, lockService as any, dosageService as any);
  });

  describe('createConsultation', () => {
    it('creates consultation and acquires lock on happy path', async () => {
      repository.findActiveConsultation.mockResolvedValue(null);
      const newConsult = { id: 'new-consult-1', status: 'draft', visitType: 'general' };
      repository.findActiveConsultation.mockResolvedValue(null);
      repository.createConsultation.mockResolvedValue(newConsult);
      lockService.acquireLock.mockResolvedValue({ acquired: true });

      const result = await service.createConsultation(
        mockClinic.id,
        mockPet.id,
        mockVet.id,
        mockVet.fullName,
        { petId: mockPet.id, visitType: 'general' },
      );

      expect(result.id).toBe('new-consult-1');
      expect(repository.createConsultation).toHaveBeenCalledWith(
        mockClinic.id,
        mockPet.id,
        mockVet.id,
        null,
        'general',
      );
      expect(lockService.acquireLock).toHaveBeenCalledWith(
        'new-consult-1',
        mockVet.id,
        mockVet.fullName,
      );
    });

    it('rejects when pet already has an active consultation (D-06)', async () => {
      repository.findActiveConsultation.mockResolvedValue({
        id: 'existing-consult',
        status: 'draft',
      });
      lockService.isLocked.mockResolvedValue({
        locked: true,
        vetName: mockVet2.fullName,
      });

      await expect(
        service.createConsultation(
          mockClinic.id,
          mockPet.id,
          mockVet.id,
          mockVet.fullName,
          { petId: mockPet.id, visitType: 'general' },
        ),
      ).rejects.toThrow(/already has an active consultation/);
    });

    it('rejects invalid visit type', async () => {
      await expect(
        service.createConsultation(
          mockClinic.id,
          mockPet.id,
          mockVet.id,
          mockVet.fullName,
          { petId: mockPet.id, visitType: 'emergency' as any },
        ),
      ).rejects.toThrow();
    });
  });

  describe('saveDraft', () => {
    it('saves draft data to draft table (not consultation)', async () => {
      lockService.isLocked.mockResolvedValue({ locked: true, vetName: mockVet.fullName });
      lockService.heartbeat.mockResolvedValue(true);
      repository.saveDraft.mockResolvedValue({});
      repository.getConsultation.mockResolvedValue(null);

      await service.saveDraft(
        'consult-1',
        mockClinic.id,
        mockVet.id,
        { assessment: 'Test assessment' },
      );

      expect(repository.saveDraft).toHaveBeenCalledWith(
        'consult-1',
        mockClinic.id,
        expect.objectContaining({ assessment: 'Test assessment' }),
      );
    });

    it('immediately updates pet weight if vitals.weightKg present (D-69)', async () => {
      lockService.isLocked.mockResolvedValue({ locked: true, vetName: mockVet.fullName });
      lockService.heartbeat.mockResolvedValue(true);
      repository.saveDraft.mockResolvedValue({});
      repository.getConsultation.mockResolvedValue({
        id: 'consult-1',
        petId: mockPet.id,
      });
      repository.updatePetWeight.mockResolvedValue({});

      await service.saveDraft(
        'consult-1',
        mockClinic.id,
        mockVet.id,
        { vitals: { weightKg: 26.5 } },
      );

      expect(repository.updatePetWeight).toHaveBeenCalledWith(mockPet.id, 26.5);
    });

    it('does not update pet weight when vitals.weightKg is not provided', async () => {
      lockService.isLocked.mockResolvedValue({ locked: true, vetName: mockVet.fullName });
      lockService.heartbeat.mockResolvedValue(true);
      repository.saveDraft.mockResolvedValue({});

      await service.saveDraft(
        'consult-1',
        mockClinic.id,
        mockVet.id,
        { assessment: 'No vitals change' },
      );

      expect(repository.updatePetWeight).not.toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('finalizes consultation, calculates duration, and releases lock', async () => {
      const startedAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      repository.getConsultation.mockResolvedValue({
        id: 'consult-1',
        clinicId: mockClinic.id,
        petId: mockPet.id,
        vetId: mockVet.id,
        queueEntryId: 'queue-1',
        status: 'draft',
        startedAt,
      });
      repository.loadDraft.mockResolvedValue({
        vitals: mockVitals,
        assessment: 'Test diagnosis',
      });
      repository.finalizeConsultation.mockResolvedValue({
        id: 'consult-1',
        status: 'finalized',
      });
      repository.updatePetWeight.mockResolvedValue({});
      repository.updateQueueEntryStatus.mockResolvedValue({});
      lockService.releaseLock.mockResolvedValue(undefined);

      const result = await service.finalize('consult-1', mockClinic.id, mockVet.id);

      expect(result.status).toBe('finalized');
      // D-70: Duration calculated from start to now
      expect(repository.finalizeConsultation).toHaveBeenCalledWith(
        'consult-1',
        mockClinic.id,
        expect.any(Object),
        expect.any(Number), // durationMinutes
        undefined,
        undefined,
      );
      // D-14: Pet weight updated
      expect(repository.updatePetWeight).toHaveBeenCalledWith(mockPet.id, mockVitals.weightKg);
      // D-04: Queue entry marked as DONE
      expect(repository.updateQueueEntryStatus).toHaveBeenCalledWith(
        'queue-1',
        'DONE',
        expect.any(Date),
      );
      // Lock released
      expect(lockService.releaseLock).toHaveBeenCalledWith('consult-1', mockVet.id);
    });

    it('stores follow-up date and reason when provided (D-09)', async () => {
      repository.getConsultation.mockResolvedValue({
        id: 'consult-1',
        clinicId: mockClinic.id,
        petId: mockPet.id,
        vetId: mockVet.id,
        queueEntryId: null,
        status: 'draft',
        startedAt: new Date(),
      });
      repository.loadDraft.mockResolvedValue({});
      repository.finalizeConsultation.mockResolvedValue({
        id: 'consult-1',
        status: 'finalized',
      });
      lockService.releaseLock.mockResolvedValue(undefined);

      await service.finalize('consult-1', mockClinic.id, mockVet.id, {
        followUpDate: '2026-08-10T00:00:00.000Z',
        followUpReason: 'Recheck symptoms',
      });

      expect(repository.finalizeConsultation).toHaveBeenCalledWith(
        'consult-1',
        mockClinic.id,
        expect.any(Object),
        expect.any(Number),
        '2026-08-10T00:00:00.000Z',
        'Recheck symptoms',
      );
    });

    it('rejects if consultation is already finalized', async () => {
      repository.getConsultation.mockResolvedValue({
        id: 'consult-1',
        status: 'finalized',
      });

      await expect(
        service.finalize('consult-1', mockClinic.id, mockVet.id),
      ).rejects.toThrow(/already finalized/);
    });

    it('rejects if consultation not found', async () => {
      repository.getConsultation.mockResolvedValue(null);

      await expect(
        service.finalize('consult-not-found', mockClinic.id, mockVet.id),
      ).rejects.toThrow(/not found/);
    });

    it('skips queue update when no queueEntryId', async () => {
      repository.getConsultation.mockResolvedValue({
        id: 'consult-1',
        clinicId: mockClinic.id,
        petId: mockPet.id,
        vetId: mockVet.id,
        queueEntryId: null,
        status: 'draft',
        startedAt: new Date(),
      });
      repository.loadDraft.mockResolvedValue({});
      repository.finalizeConsultation.mockResolvedValue({
        id: 'consult-1',
        status: 'finalized',
      });
      lockService.releaseLock.mockResolvedValue(undefined);

      await service.finalize('consult-1', mockClinic.id, mockVet.id);

      expect(repository.updateQueueEntryStatus).not.toHaveBeenCalled();
    });
  });

  describe('addAddendum', () => {
    it('appends addendum to finalized consultation', async () => {
      repository.getConsultation.mockResolvedValue({
        id: 'consult-1',
        status: 'finalized',
        addenda: [],
      });
      repository.addAddendum.mockResolvedValue({
        id: 'consult-1',
        addenda: [{ text: 'Additional note' }],
      });

      const result = await service.addAddendum(
        'consult-1',
        mockClinic.id,
        mockVet.id,
        mockVet.fullName,
        'Additional note',
      );

      expect(repository.addAddendum).toHaveBeenCalledWith(
        'consult-1',
        expect.objectContaining({
          text: 'Additional note',
          addedBy: mockVet.id,
          addedByName: mockVet.fullName,
        }),
      );
    });

    it('rejects addendum on draft consultation', async () => {
      repository.getConsultation.mockResolvedValue({
        id: 'consult-1',
        status: 'draft',
      });

      await expect(
        service.addAddendum(
          'consult-1',
          mockClinic.id,
          mockVet.id,
          mockVet.fullName,
          'Should fail',
        ),
      ).rejects.toThrow(/finalized/);
    });

    it('rejects empty addendum text', async () => {
      await expect(
        service.addAddendum(
          'consult-1',
          mockClinic.id,
          mockVet.id,
          mockVet.fullName,
          '',
        ),
      ).rejects.toThrow();
    });
  });

  describe('getHistory', () => {
    it('returns sorted consultation summaries for a pet', async () => {
      repository.getHistory.mockResolvedValue([
        {
          id: 'consult-2',
          visitType: 'vaccination',
          status: 'finalized',
          startedAt: new Date('2026-08-02'),
          finalizedAt: new Date('2026-08-02'),
          durationMinutes: 15,
          assessment: 'Rabies vaccination',
          vetId: mockVet.id,
          vet: { fullName: mockVet.fullName },
          _count: { prescriptions: 0, attachments: 0 },
        },
        {
          id: 'consult-1',
          visitType: 'general',
          status: 'finalized',
          startedAt: new Date('2026-08-01'),
          finalizedAt: new Date('2026-08-01'),
          durationMinutes: 30,
          assessment: 'Acute gastroenteritis',
          vetId: mockVet.id,
          vet: { fullName: mockVet.fullName },
          _count: { prescriptions: 2, attachments: 1 },
        },
      ]);

      const result = await service.getHistory(mockClinic.id, mockPet.id);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('consult-2');
      expect(result[0].vetName).toBe(mockVet.fullName);
      expect(result[0].prescriptionCount).toBe(0);
      expect(result[1].prescriptionCount).toBe(2);
      expect(result[1].attachmentCount).toBe(1);
    });
  });

  describe('dosage validation', () => {
    it('delegates dosage validation to DosageService', () => {
      dosageService.validateDosage.mockReturnValue(null);

      const result = service.validatePrescriptionDosage(250, 25, {
        id: 'dose-1',
        drugId: 'drug-1',
        species: 'DOG',
        minDoseMgPerKg: 10,
        maxDoseMgPerKg: 25,
        isFixedDose: false,
        fixedDoseMin: null,
        fixedDoseMax: null,
        notes: null,
      });

      expect(result).toBeNull();
      expect(dosageService.validateDosage).toHaveBeenCalledWith(
        250,
        25,
        expect.objectContaining({ species: 'DOG' }),
      );
    });

    it('returns warning when dose is outside range', () => {
      dosageService.validateDosage.mockReturnValue({
        level: 'warning',
        message: 'Dose outside recommended range',
        enteredDose: 1000,
        enteredDosePerKg: 40,
        recommendedMinMg: 250,
        recommendedMaxMg: 625,
      });

      const result = service.validatePrescriptionDosage(1000, 25, {
        id: 'dose-1',
        drugId: 'drug-1',
        species: 'DOG',
        minDoseMgPerKg: 10,
        maxDoseMgPerKg: 25,
        isFixedDose: false,
        fixedDoseMin: null,
        fixedDoseMax: null,
        notes: null,
      });

      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
    });
  });

  describe('owner instructions', () => {
    it('delegates instruction generation to DosageService', () => {
      dosageService.generateOwnerInstructions.mockReturnValue(
        '250mg tablet by mouth twice daily for 7 days',
      );

      const result = service.generateOwnerInstructions(mockPrescriptionItem);

      expect(result).toBe('250mg tablet by mouth twice daily for 7 days');
      expect(dosageService.generateOwnerInstructions).toHaveBeenCalledWith(mockPrescriptionItem);
    });
  });
});
