import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatientService } from '../patient.service.js';
import type { PatientRepository } from '../patient.repository.js';

function createMockRepository(): PatientRepository {
  return {
    createOwner: vi.fn(),
    findOwnerByMobile: vi.fn(),
    findOwnerById: vi.fn(),
    createPet: vi.fn(),
    findPetWithOwner: vi.fn(),
    getPetProfile: vi.fn(),
    updatePet: vi.fn(),
    searchPatients: vi.fn(),
    getRecentPatients: vi.fn(),
  } as unknown as PatientRepository;
}

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OWNER_ID = '00000000-0000-0000-0000-000000000002';
const PET_ID = '00000000-0000-0000-0000-000000000003';

const mockOwner = {
  id: OWNER_ID,
  clinicId: CLINIC_ID,
  mobile: '9876543210',
  name: 'Rahul Kumar',
  email: null,
  address: null,
  altPhone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPet = {
  id: PET_ID,
  clinicId: CLINIC_ID,
  ownerId: OWNER_ID,
  name: 'Buddy',
  species: 'DOG' as const,
  breed: 'Labrador Retriever',
  birthYear: 2022,
  birthMonth: null,
  weight: null,
  color: null,
  microchipId: null,
  photoUrl: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: mockOwner,
};

describe('PatientService', () => {
  let service: PatientService;
  let repo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    repo = createMockRepository();
    service = new PatientService(repo);
  });

  describe('registerOwner', () => {
    it('creates owner with mobile number and name for a clinic', async () => {
      vi.mocked(repo.createOwner).mockResolvedValue(mockOwner);

      const result = await service.registerOwner({
        clinicId: CLINIC_ID,
        mobile: '9876543210',
        name: 'Rahul Kumar',
      });

      expect(repo.createOwner).toHaveBeenCalledWith({
        clinicId: CLINIC_ID,
        mobile: '9876543210',
        name: 'Rahul Kumar',
        email: undefined,
        address: undefined,
        altPhone: undefined,
      });
      expect(result.id).toBe(OWNER_ID);
    });

    it('strips spaces from mobile number before saving', async () => {
      vi.mocked(repo.createOwner).mockResolvedValue(mockOwner);

      await service.registerOwner({
        clinicId: CLINIC_ID,
        mobile: '98765 43210',
        name: 'Rahul Kumar',
      });

      expect(repo.createOwner).toHaveBeenCalledWith(
        expect.objectContaining({ mobile: '9876543210' }),
      );
    });

    it('rejects invalid mobile number format', async () => {
      await expect(
        service.registerOwner({
          clinicId: CLINIC_ID,
          mobile: '12345',
          name: 'Rahul Kumar',
        }),
      ).rejects.toThrow();
    });

    it('rejects mobile not starting with 6-9', async () => {
      await expect(
        service.registerOwner({
          clinicId: CLINIC_ID,
          mobile: '5876543210',
          name: 'Rahul Kumar',
        }),
      ).rejects.toThrow();
    });

    it('accepts optional email, address, altPhone', async () => {
      vi.mocked(repo.createOwner).mockResolvedValue({
        ...mockOwner,
        email: 'rahul@test.com',
        address: 'MG Road, Mumbai',
        altPhone: '8765432109',
      });

      await service.registerOwner({
        clinicId: CLINIC_ID,
        mobile: '9876543210',
        name: 'Rahul Kumar',
        email: 'rahul@test.com',
        address: 'MG Road, Mumbai',
        altPhone: '8765432109',
      });

      expect(repo.createOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'rahul@test.com',
          address: 'MG Road, Mumbai',
          altPhone: '8765432109',
        }),
      );
    });
  });

  describe('registerPet', () => {
    it('creates pet linked to owner with required fields', async () => {
      vi.mocked(repo.findOwnerById).mockResolvedValue({ ...mockOwner, pets: [] });
      vi.mocked(repo.createPet).mockResolvedValue(mockPet);

      const result = await service.registerPet({
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        name: 'Buddy',
        species: 'DOG',
      });

      expect(repo.createPet).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: CLINIC_ID,
          ownerId: OWNER_ID,
          name: 'Buddy',
          species: 'DOG',
        }),
      );
      expect(result.id).toBe(PET_ID);
    });

    it('accepts all optional fields', async () => {
      vi.mocked(repo.findOwnerById).mockResolvedValue({ ...mockOwner, pets: [] });
      vi.mocked(repo.createPet).mockResolvedValue(mockPet);

      await service.registerPet({
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        name: 'Buddy',
        species: 'DOG',
        breed: 'Labrador Retriever',
        birthYear: 2022,
        birthMonth: 6,
        weight: 25.5,
        color: 'Golden',
        microchipId: 'MC123',
        notes: 'Friendly dog',
      });

      expect(repo.createPet).toHaveBeenCalled();
    });

    it('rejects pet for non-existent owner', async () => {
      vi.mocked(repo.findOwnerById).mockResolvedValue(null);

      await expect(
        service.registerPet({
          clinicId: CLINIC_ID,
          ownerId: 'non-existent-id',
          name: 'Buddy',
          species: 'DOG',
        }),
      ).rejects.toThrow('Owner not found at this clinic');
    });
  });

  describe('registerPatient', () => {
    it('registers owner and pet in a single call', async () => {
      vi.mocked(repo.createOwner).mockResolvedValue(mockOwner);
      vi.mocked(repo.findOwnerById).mockResolvedValue({ ...mockOwner, pets: [] });
      vi.mocked(repo.createPet).mockResolvedValue(mockPet);

      const result = await service.registerPatient({
        clinicId: CLINIC_ID,
        owner: { mobile: '9876543210', name: 'Rahul Kumar' },
        pet: { name: 'Buddy', species: 'DOG' },
      });

      expect(result.owner.id).toBe(OWNER_ID);
      expect(result.pet.id).toBe(PET_ID);
    });

    it('returns existing owner and new pet if mobile exists', async () => {
      // createOwner upserts — returns existing owner
      vi.mocked(repo.createOwner).mockResolvedValue(mockOwner);
      vi.mocked(repo.findOwnerById).mockResolvedValue({ ...mockOwner, pets: [] });
      vi.mocked(repo.createPet).mockResolvedValue(mockPet);

      const result = await service.registerPatient({
        clinicId: CLINIC_ID,
        owner: { mobile: '9876543210', name: 'Rahul Kumar' },
        pet: { name: 'Coco', species: 'CAT' },
      });

      expect(result.owner.id).toBe(OWNER_ID);
      expect(repo.createOwner).toHaveBeenCalledTimes(1);
    });
  });

  describe('lookupByMobile', () => {
    it('finds owner and all pets by mobile number', async () => {
      const ownerWithPets = { ...mockOwner, pets: [mockPet] };
      vi.mocked(repo.findOwnerByMobile).mockResolvedValue(ownerWithPets);

      const result = await service.lookupByMobile(CLINIC_ID, '9876543210');

      expect(result).toBeDefined();
      expect(result!.mobile).toBe('9876543210');
      expect(result!.pets).toHaveLength(1);
    });

    it('returns null for unregistered mobile', async () => {
      vi.mocked(repo.findOwnerByMobile).mockResolvedValue(null);

      const result = await service.lookupByMobile(CLINIC_ID, '9876543210');

      expect(result).toBeNull();
    });

    it('strips spaces from mobile before lookup', async () => {
      vi.mocked(repo.findOwnerByMobile).mockResolvedValue(null);

      await service.lookupByMobile(CLINIC_ID, '98765 43210');

      expect(repo.findOwnerByMobile).toHaveBeenCalledWith(CLINIC_ID, '9876543210');
    });

    it('rejects invalid mobile format', async () => {
      await expect(
        service.lookupByMobile(CLINIC_ID, '12345'),
      ).rejects.toThrow();
    });
  });

  describe('getPetProfile', () => {
    it('returns pet with owner info and visit history', async () => {
      vi.mocked(repo.getPetProfile).mockResolvedValue({
        ...mockPet,
        visitHistory: [
          {
            id: 'visit-1',
            clinicId: CLINIC_ID,
            petId: PET_ID,
            checkedInBy: 'user-1',
            treatingVetId: 'vet-1',
            status: 'DONE' as const,
            position: 1,
            isEmergency: false,
            visitReason: 'Vaccination',
            checkedInAt: new Date('2024-01-15'),
            calledAt: new Date('2024-01-15'),
            completedAt: new Date('2024-01-15'),
            archivedAt: null,
            updatedAt: new Date('2024-01-15'),
          },
        ],
      });

      const result = await service.getPetProfile({
        clinicId: CLINIC_ID,
        petId: PET_ID,
      });

      expect(result).toBeDefined();
      expect(result!.visitHistory).toHaveLength(1);
    });

    it('returns null for non-existent pet', async () => {
      vi.mocked(repo.getPetProfile).mockResolvedValue(null);

      const result = await service.getPetProfile({
        clinicId: CLINIC_ID,
        petId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('updatePet', () => {
    it('updates pet optional fields', async () => {
      vi.mocked(repo.updatePet).mockResolvedValue({
        ...mockPet,
        weight: 30,
        color: 'Brown',
      });

      const result = await service.updatePet({
        clinicId: CLINIC_ID,
        petId: PET_ID,
        data: { weight: 30, color: 'Brown' },
      });

      expect(result.weight).toBe(30);
      expect(result.color).toBe('Brown');
    });

    it('throws when pet not found', async () => {
      vi.mocked(repo.updatePet).mockResolvedValue(null);

      await expect(
        service.updatePet({
          clinicId: CLINIC_ID,
          petId: 'non-existent',
          data: { weight: 30 },
        }),
      ).rejects.toThrow('Pet not found at this clinic');
    });
  });

  describe('searchPatients', () => {
    it('calls repository with validated params', async () => {
      vi.mocked(repo.searchPatients).mockResolvedValue([
        {
          ownerId: OWNER_ID,
          ownerName: 'Rahul Kumar',
          mobile: '9876543210',
          petId: PET_ID,
          petName: 'Buddy',
          species: 'DOG',
          relevance: 0.8,
        },
      ]);

      const result = await service.searchPatients({
        clinicId: CLINIC_ID,
        query: 'Rahul',
      });

      expect(result).toHaveLength(1);
      expect(result[0].ownerName).toBe('Rahul Kumar');
    });

    it('respects limit parameter', async () => {
      vi.mocked(repo.searchPatients).mockResolvedValue([]);

      await service.searchPatients({
        clinicId: CLINIC_ID,
        query: 'test',
        limit: 10,
      });

      expect(repo.searchPatients).toHaveBeenCalledWith(CLINIC_ID, 'test', 10);
    });

    it('rejects search query shorter than 2 characters', async () => {
      await expect(
        service.searchPatients({
          clinicId: CLINIC_ID,
          query: 'a',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getRecentPatients', () => {
    it('calls repository with clinicId and limit', async () => {
      vi.mocked(repo.getRecentPatients).mockResolvedValue([]);

      await service.getRecentPatients(CLINIC_ID, 10);

      expect(repo.getRecentPatients).toHaveBeenCalledWith(CLINIC_ID, 10);
    });

    it('defaults limit to 20', async () => {
      vi.mocked(repo.getRecentPatients).mockResolvedValue([]);

      await service.getRecentPatients(CLINIC_ID);

      expect(repo.getRecentPatients).toHaveBeenCalledWith(CLINIC_ID, 20);
    });
  });
});
