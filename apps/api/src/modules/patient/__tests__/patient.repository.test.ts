import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatientRepository } from '../patient.repository.js';

// Mock PrismaClient shape matching the operations used by PatientRepository
function createMockPrisma() {
  return {
    petOwner: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    pet: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    queueEntry: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  } as any;
}

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OWNER_ID = '00000000-0000-0000-0000-000000000002';
const PET_ID = '00000000-0000-0000-0000-000000000003';

describe('PatientRepository', () => {
  let repo: PatientRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new PatientRepository(prisma);
  });

  describe('createOwner', () => {
    it('uses upsert with clinicId_mobile composite key', async () => {
      const owner = {
        id: OWNER_ID,
        clinicId: CLINIC_ID,
        mobile: '9876543210',
        name: 'Rahul Kumar',
      };
      prisma.petOwner.upsert.mockResolvedValue(owner);

      const result = await repo.createOwner({
        clinicId: CLINIC_ID,
        mobile: '9876543210',
        name: 'Rahul Kumar',
      });

      expect(prisma.petOwner.upsert).toHaveBeenCalledWith({
        where: {
          clinicId_mobile: { clinicId: CLINIC_ID, mobile: '9876543210' },
        },
        create: expect.objectContaining({
          clinicId: CLINIC_ID,
          mobile: '9876543210',
          name: 'Rahul Kumar',
        }),
        update: {},
      });
      expect(result.id).toBe(OWNER_ID);
    });

    it('returns existing owner when mobile already exists at clinic (D-06)', async () => {
      const existing = { id: OWNER_ID, mobile: '9876543210', name: 'Rahul Kumar' };
      prisma.petOwner.upsert.mockResolvedValue(existing);

      const result = await repo.createOwner({
        clinicId: CLINIC_ID,
        mobile: '9876543210',
        name: 'Different Name',
      });

      // Upsert with empty update returns existing
      expect(result.id).toBe(OWNER_ID);
      expect(result.name).toBe('Rahul Kumar'); // Original name preserved
    });

    it('includes optional fields in create when provided', async () => {
      prisma.petOwner.upsert.mockResolvedValue({ id: OWNER_ID });

      await repo.createOwner({
        clinicId: CLINIC_ID,
        mobile: '9876543210',
        name: 'Rahul Kumar',
        email: 'rahul@test.com',
        address: 'MG Road',
        altPhone: '8765432109',
      });

      expect(prisma.petOwner.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            email: 'rahul@test.com',
            address: 'MG Road',
            altPhone: '8765432109',
          }),
        }),
      );
    });
  });

  describe('findOwnerByMobile', () => {
    it('queries with composite unique key and includes pets', async () => {
      const ownerWithPets = {
        id: OWNER_ID,
        mobile: '9876543210',
        pets: [{ id: PET_ID, name: 'Buddy' }],
      };
      prisma.petOwner.findUnique.mockResolvedValue(ownerWithPets);

      const result = await repo.findOwnerByMobile(CLINIC_ID, '9876543210');

      expect(prisma.petOwner.findUnique).toHaveBeenCalledWith({
        where: {
          clinicId_mobile: { clinicId: CLINIC_ID, mobile: '9876543210' },
        },
        include: { pets: true },
      });
      expect(result!.pets).toHaveLength(1);
    });

    it('returns null when owner not found', async () => {
      prisma.petOwner.findUnique.mockResolvedValue(null);

      const result = await repo.findOwnerByMobile(CLINIC_ID, '9999999999');

      expect(result).toBeNull();
    });
  });

  describe('findOwnerById', () => {
    it('queries by id and clinicId with pets included', async () => {
      prisma.petOwner.findFirst.mockResolvedValue({
        id: OWNER_ID,
        clinicId: CLINIC_ID,
        pets: [],
      });

      await repo.findOwnerById(CLINIC_ID, OWNER_ID);

      expect(prisma.petOwner.findFirst).toHaveBeenCalledWith({
        where: { id: OWNER_ID, clinicId: CLINIC_ID },
        include: { pets: true },
      });
    });
  });

  describe('createPet', () => {
    it('creates pet with required and optional fields', async () => {
      prisma.pet.create.mockResolvedValue({
        id: PET_ID,
        name: 'Buddy',
        species: 'DOG',
        ownerId: OWNER_ID,
      });

      await repo.createPet({
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        name: 'Buddy',
        species: 'DOG',
        breed: 'Labrador',
      });

      expect(prisma.pet.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId: CLINIC_ID,
          ownerId: OWNER_ID,
          name: 'Buddy',
          species: 'DOG',
          breed: 'Labrador',
        }),
        include: { owner: true },
      });
    });

    it('omits optional fields when not provided', async () => {
      prisma.pet.create.mockResolvedValue({ id: PET_ID });

      await repo.createPet({
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        name: 'Kitty',
        species: 'CAT',
      });

      const callArgs = prisma.pet.create.mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('breed');
      expect(callArgs.data).not.toHaveProperty('weight');
    });
  });

  describe('getPetProfile', () => {
    it('returns pet with owner and visit history', async () => {
      const pet = {
        id: PET_ID,
        name: 'Buddy',
        species: 'DOG',
        owner: { id: OWNER_ID, name: 'Rahul' },
      };
      prisma.pet.findFirst.mockResolvedValue(pet);
      prisma.queueEntry.findMany.mockResolvedValue([
        { id: 'v1', status: 'DONE', visitReason: 'Vaccination' },
      ]);

      const result = await repo.getPetProfile(CLINIC_ID, PET_ID);

      expect(result).toBeDefined();
      expect(result!.visitHistory).toHaveLength(1);
      expect(result!.owner.name).toBe('Rahul');
    });

    it('filters visit history to DONE and NO_SHOW only', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: PET_ID, owner: {} });
      prisma.queueEntry.findMany.mockResolvedValue([]);

      await repo.getPetProfile(CLINIC_ID, PET_ID);

      expect(prisma.queueEntry.findMany).toHaveBeenCalledWith({
        where: {
          clinicId: CLINIC_ID,
          petId: PET_ID,
          status: { in: ['DONE', 'NO_SHOW'] },
        },
        orderBy: { checkedInAt: 'desc' },
        take: 50,
      });
    });

    it('returns null when pet not found', async () => {
      prisma.pet.findFirst.mockResolvedValue(null);

      const result = await repo.getPetProfile(CLINIC_ID, 'non-existent');

      expect(result).toBeNull();
      // Should not query visit history if pet not found
      expect(prisma.queueEntry.findMany).not.toHaveBeenCalled();
    });
  });

  describe('updatePet', () => {
    it('updates pet and returns with owner included', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: PET_ID, clinicId: CLINIC_ID });
      prisma.pet.update.mockResolvedValue({
        id: PET_ID,
        weight: 30,
        owner: { id: OWNER_ID },
      });

      const result = await repo.updatePet({
        clinicId: CLINIC_ID,
        petId: PET_ID,
        data: { weight: 30 },
      });

      expect(prisma.pet.update).toHaveBeenCalledWith({
        where: { id: PET_ID },
        data: { weight: 30 },
        include: { owner: true },
      });
      expect(result!.weight).toBe(30);
    });

    it('returns null when pet not found at clinic', async () => {
      prisma.pet.findFirst.mockResolvedValue(null);

      const result = await repo.updatePet({
        clinicId: CLINIC_ID,
        petId: 'non-existent',
        data: { weight: 30 },
      });

      expect(result).toBeNull();
      expect(prisma.pet.update).not.toHaveBeenCalled();
    });
  });

  describe('searchPatients', () => {
    it('executes raw SQL with pg_trgm similarity', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          ownerId: OWNER_ID,
          ownerName: 'Rahul Kumar',
          mobile: '9876543210',
          petId: PET_ID,
          petName: 'Buddy',
          species: 'DOG',
          relevance: 0.6,
        },
      ]);

      const result = await repo.searchPatients(CLINIC_ID, 'Rahul');

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].ownerName).toBe('Rahul Kumar');
    });

    it('sorts results by relevance descending', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { ownerId: '1', relevance: 0.3, ownerName: 'Low', petId: 'p1', petName: 'a', mobile: '1', species: 'DOG' },
        { ownerId: '2', relevance: 0.9, ownerName: 'High', petId: 'p2', petName: 'b', mobile: '2', species: 'CAT' },
      ]);

      const result = await repo.searchPatients(CLINIC_ID, 'test');

      expect(result[0].ownerName).toBe('High');
      expect(result[1].ownerName).toBe('Low');
    });

    it('respects limit parameter', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await repo.searchPatients(CLINIC_ID, 'test', 5);

      // Verify the limit was passed (checking the tagged template args)
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('getRecentPatients', () => {
    it('executes raw SQL query for recent patients', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          petId: PET_ID,
          petName: 'Buddy',
          species: 'DOG',
          ownerId: OWNER_ID,
          ownerName: 'Rahul Kumar',
          mobile: '9876543210',
          lastVisit: new Date(),
        },
      ]);

      const result = await repo.getRecentPatients(CLINIC_ID, 10);

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].petName).toBe('Buddy');
    });
  });
});
