import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaccinationService } from '../vaccination.service.js';
import type { VaccinationRepository } from '../vaccination.repository.js';
import { DRUG_SEED_DATA } from '../../drug/drug-seed.js';

// D-42: the 6 seeded vaccine names, each paired with one species it's dosed for,
// derived straight from drug-seed.ts so this test tracks the real seed data.
const SEEDED_VACCINE_SPECIES_PAIRS = DRUG_SEED_DATA.filter(
  (d) => d.category === 'vaccine',
).map((d) => ({ vaccineName: d.name, species: d.dosageRanges[0].species }));

function createMockRepository(): VaccinationRepository {
  return {
    createVaccination: vi.fn(),
    createDeworming: vi.fn(),
    getVaccinationRecords: vi.fn(),
    getDewormingRecords: vi.fn(),
    getLatestVaccinationByName: vi.fn(),
    getLatestDeworming: vi.fn(),
    getOverdueVaccinations: vi.fn(),
    getDueSoonVaccinations: vi.fn(),
    getVaccinationById: vi.fn(),
  } as unknown as VaccinationRepository;
}

function createMockPrisma() {
  return {
    authAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('VaccinationService', () => {
  let service: VaccinationService;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockPrisma = createMockPrisma();
    service = new VaccinationService(mockRepo, mockPrisma);
  });

  describe('createVaccination', () => {
    it('should auto-calculate nextDueDate for known vaccines', async () => {
      const spy = vi.mocked(mockRepo.createVaccination).mockResolvedValue({ id: 'vax_1' } as any);

      await service.createVaccination(
        'clinic_1', 'pet_1', 'consult_1',
        'DOG', 100, // 100 days old
        { vaccineName: 'DHPPi', administeredBy: 'vet_1' },
      );

      expect(spy).toHaveBeenCalledOnce();
      const callArgs = spy.mock.calls[0];
      expect(callArgs[3].nextDueDate).toBeInstanceOf(Date);
    });

    it('should use provided nextDueDate when given', async () => {
      const customDate = new Date('2027-01-01');
      vi.mocked(mockRepo.createVaccination).mockResolvedValue({ id: 'vax_1' } as any);

      await service.createVaccination(
        'clinic_1', 'pet_1', null,
        'DOG', 365,
        { vaccineName: 'DHPPi', administeredBy: 'vet_1', nextDueDate: customDate },
      );

      const callArgs = vi.mocked(mockRepo.createVaccination).mock.calls[0];
      expect(callArgs[3].nextDueDate).toEqual(customDate);
    });

    it('should return null nextDueDate for unknown vaccines', async () => {
      vi.mocked(mockRepo.createVaccination).mockResolvedValue({ id: 'vax_1' } as any);

      await service.createVaccination(
        'clinic_1', 'pet_1', null,
        'DOG', 365,
        { vaccineName: 'Unknown-Vaccine', administeredBy: 'vet_1' },
      );

      const callArgs = vi.mocked(mockRepo.createVaccination).mock.calls[0];
      expect(callArgs[3].nextDueDate).toBeNull();
    });

    it('writes a VACCINATION_RECORDED audit log entry on success (EMR-07 / D-62)', async () => {
      vi.mocked(mockRepo.createVaccination).mockResolvedValue({ id: 'vax_1' } as any);

      await service.createVaccination(
        'clinic_1', 'pet_1', 'consult_1',
        'DOG', 100,
        { vaccineName: 'DHPPi', administeredBy: 'vet_1' },
      );

      expect(mockPrisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'VACCINATION_RECORDED',
            userId: 'vet_1',
            clinicId: 'clinic_1',
            metadata: expect.objectContaining({
              petId: 'pet_1',
              vaccineName: 'DHPPi',
              recordId: 'vax_1',
            }),
          }),
        }),
      );
    });

    // D-42: The drug catalog's seeded vaccine names must resolve a non-null
    // next-due-date. This guards against a name mismatch between drug-seed.ts
    // and the interval table breaking auto-due-date calculation silently.
    it('drug-seed.ts vaccine fixtures cover the 6 expected (name, species) pairs', () => {
      expect(SEEDED_VACCINE_SPECIES_PAIRS.length).toBe(6);
    });

    it.each(SEEDED_VACCINE_SPECIES_PAIRS)(
      'resolves a non-null nextDueDate for seeded vaccine "$vaccineName" ($species)',
      async ({ vaccineName, species }) => {
        vi.mocked(mockRepo.createVaccination).mockResolvedValue({ id: 'vax_1' } as any);

        await service.createVaccination(
          'clinic_1', 'pet_1', null,
          species, 400, // adult
          { vaccineName, administeredBy: 'vet_1' },
        );

        const callArgs = vi.mocked(mockRepo.createVaccination).mock.calls.at(-1)!;
        expect(callArgs[3].nextDueDate).toBeInstanceOf(Date);
      },
    );
  });

  describe('createDeworming', () => {
    it('should auto-calculate nextDueDate for puppies (14-day interval)', async () => {
      vi.mocked(mockRepo.createDeworming).mockResolvedValue({ id: 'dew_1' } as any);

      await service.createDeworming(
        'clinic_1', 'pet_1', null,
        'DOG', 30, // 30 days old = puppy
        { drugName: 'Fenbendazole', administeredBy: 'vet_1' },
      );

      const callArgs = vi.mocked(mockRepo.createDeworming).mock.calls[0];
      const nextDue = callArgs[3].nextDueDate as Date;
      const now = new Date();
      const diffDays = Math.round((nextDue.getTime() - now.getTime()) / (86400000));
      expect(diffDays).toBe(14);
    });

    it('should auto-calculate nextDueDate for adults (90-day interval)', async () => {
      vi.mocked(mockRepo.createDeworming).mockResolvedValue({ id: 'dew_1' } as any);

      await service.createDeworming(
        'clinic_1', 'pet_1', null,
        'DOG', 365, // adult
        { drugName: 'Fenbendazole', administeredBy: 'vet_1' },
      );

      const callArgs = vi.mocked(mockRepo.createDeworming).mock.calls[0];
      const nextDue = callArgs[3].nextDueDate as Date;
      const now = new Date();
      const diffDays = Math.round((nextDue.getTime() - now.getTime()) / (86400000));
      expect(diffDays).toBe(90);
    });
  });

  describe('getPreventiveCareStatus', () => {
    it('should return upToDate when no overdue or due-soon records', async () => {
      vi.mocked(mockRepo.getOverdueVaccinations).mockResolvedValue([]);
      vi.mocked(mockRepo.getDueSoonVaccinations).mockResolvedValue([]);
      vi.mocked(mockRepo.getLatestDeworming).mockResolvedValue({
        id: 'dew_1',
        nextDueDate: new Date(Date.now() + 30 * 86400000), // 30 days from now
      } as any);

      const status = await service.getPreventiveCareStatus('clinic_1', 'pet_1');

      expect(status.vaccinationStatus).toBe('upToDate');
      expect(status.vaccinationOverdueItems).toEqual([]);
      expect(status.dewormingStatus).toBe('upToDate');
    });

    it('should return overdue when vaccines are past due', async () => {
      vi.mocked(mockRepo.getOverdueVaccinations).mockResolvedValue([
        { vaccineName: 'DHPPi', nextDueDate: new Date(Date.now() - 86400000) },
        { vaccineName: 'Anti-Rabies', nextDueDate: new Date(Date.now() - 172800000) },
      ] as any[]);
      vi.mocked(mockRepo.getDueSoonVaccinations).mockResolvedValue([]);
      vi.mocked(mockRepo.getLatestDeworming).mockResolvedValue(null);

      const status = await service.getPreventiveCareStatus('clinic_1', 'pet_1');

      expect(status.vaccinationStatus).toBe('overdue');
      expect(status.vaccinationOverdueItems).toEqual(['DHPPi', 'Anti-Rabies']);
      expect(status.dewormingStatus).toBe('overdue');
    });

    it('should return dueSoon when vaccines due within 7 days', async () => {
      vi.mocked(mockRepo.getOverdueVaccinations).mockResolvedValue([]);
      vi.mocked(mockRepo.getDueSoonVaccinations).mockResolvedValue([
        { vaccineName: 'Anti-Rabies', nextDueDate: new Date(Date.now() + 3 * 86400000) },
      ] as any[]);
      vi.mocked(mockRepo.getLatestDeworming).mockResolvedValue({
        id: 'dew_1',
        nextDueDate: new Date(Date.now() + 5 * 86400000), // 5 days = due soon
      } as any);

      const status = await service.getPreventiveCareStatus('clinic_1', 'pet_1');

      expect(status.vaccinationStatus).toBe('dueSoon');
      expect(status.dewormingStatus).toBe('dueSoon');
    });
  });

  describe('getCertificateData', () => {
    it('should throw VACCINATION_NOT_FOUND for missing record', async () => {
      vi.mocked(mockRepo.getVaccinationById).mockResolvedValue(null);

      await expect(
        service.getCertificateData('clinic_1', 'pet_1', 'vax_missing'),
      ).rejects.toMatchObject({ code: 'VACCINATION_NOT_FOUND', statusCode: 404 });
    });

    it('should throw VACCINATION_NOT_FOUND for wrong clinic', async () => {
      vi.mocked(mockRepo.getVaccinationById).mockResolvedValue({
        id: 'vax_1',
        clinicId: 'other_clinic',
        petId: 'pet_1',
        clinic: { name: 'Test' },
        pet: { name: 'Buddy', owner: { name: 'Owner' } },
      } as any);

      await expect(
        service.getCertificateData('clinic_1', 'pet_1', 'vax_1'),
      ).rejects.toMatchObject({ code: 'VACCINATION_NOT_FOUND' });
    });

    it('should return certificate data for valid record', async () => {
      vi.mocked(mockRepo.getVaccinationById).mockResolvedValue({
        id: 'vax_1',
        clinicId: 'clinic_1',
        petId: 'pet_1',
        vaccineName: 'Anti-Rabies',
        batchNumber: 'B123',
        manufacturer: 'Nobivac',
        expiryDate: new Date('2027-06-01'),
        administeredAt: new Date('2026-08-01'),
        administeredBy: 'vet_1',
        nextDueDate: new Date('2027-08-01'),
        clinic: { name: 'Happy Paws', address: '123 Main St', contactPhone: '9876543210', logoUrl: null },
        pet: {
          name: 'Buddy', species: 'DOG', breed: 'Labrador',
          birthYear: 2022, birthMonth: 3, weight: 25,
          microchipId: 'CHIP123',
          owner: { name: 'Rahul', mobile: '9876543210' },
        },
      } as any);

      const result = await service.getCertificateData('clinic_1', 'pet_1', 'vax_1');

      expect(result.clinic.name).toBe('Happy Paws');
      expect(result.pet.name).toBe('Buddy');
      expect(result.vaccine.name).toBe('Anti-Rabies');
      expect(result.vaccine.batchNumber).toBe('B123');
    });
  });
});
