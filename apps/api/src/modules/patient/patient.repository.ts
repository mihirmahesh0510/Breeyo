import type { DbClient } from '../../lib/prisma-rls.js';
import type { PatientSearchResult } from '@breeyo/types';
import type {
  RegisterOwnerParams,
  RegisterPetParams,
  UpdatePetParams,
} from './patient.types.js';

export class PatientRepository {
  constructor(private readonly prisma: DbClient) {}

  /**
   * Upserts owner: creates if new, returns existing if mobile already registered at clinic.
   * D-06: Mobile number as unique key per clinic.
   */
  async createOwner(params: RegisterOwnerParams) {
    const { clinicId, mobile, name, email, address, altPhone } = params;

    return this.prisma.petOwner.upsert({
      where: {
        clinicId_mobile: { clinicId, mobile },
      },
      create: {
        clinicId,
        mobile,
        name,
        ...(email && { email }),
        ...(address && { address }),
        ...(altPhone && { altPhone }),
      },
      update: {},
    });
  }

  /**
   * Finds owner by mobile number at a specific clinic, including all their pets.
   */
  async findOwnerByMobile(clinicId: string, mobile: string) {
    return this.prisma.petOwner.findUnique({
      where: {
        clinicId_mobile: { clinicId, mobile },
      },
      include: { pets: true },
    });
  }

  /**
   * Finds owner by ID with all their pets.
   */
  async findOwnerById(clinicId: string, ownerId: string) {
    return this.prisma.petOwner.findFirst({
      where: { id: ownerId, clinicId },
      include: { pets: true },
    });
  }

  /**
   * Creates a pet linked to an owner.
   */
  async createPet(params: RegisterPetParams) {
    const { clinicId, ownerId, name, species, ...optional } = params;

    return this.prisma.pet.create({
      data: {
        clinicId,
        ownerId,
        name,
        species,
        ...(optional.breed && { breed: optional.breed }),
        ...(optional.birthYear != null && { birthYear: optional.birthYear }),
        ...(optional.birthMonth != null && { birthMonth: optional.birthMonth }),
        ...(optional.weight != null && { weight: optional.weight }),
        ...(optional.color && { color: optional.color }),
        ...(optional.microchipId && { microchipId: optional.microchipId }),
        ...(optional.photoUrl && { photoUrl: optional.photoUrl }),
        ...(optional.notes && { notes: optional.notes }),
      },
      include: { owner: true },
    });
  }

  /**
   * Finds a pet by ID at a specific clinic, including owner.
   */
  async findPetWithOwner(clinicId: string, petId: string) {
    return this.prisma.pet.findFirst({
      where: { id: petId, clinicId },
      include: { owner: true },
    });
  }

  /**
   * Returns pet profile with owner info and visit history.
   * Visit history = completed QueueEntry records (DONE or NO_SHOW), newest first.
   * D-29: Scoped to current clinic only.
   */
  async getPetProfile(clinicId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, clinicId },
      include: { owner: true },
    });

    if (!pet) return null;

    const visitHistory = await this.prisma.queueEntry.findMany({
      where: {
        clinicId,
        petId,
        status: { in: ['DONE', 'NO_SHOW'] },
      },
      orderBy: { checkedInAt: 'desc' },
      take: 50,
    });

    return { ...pet, visitHistory };
  }

  /**
   * Updates pet optional fields. Does not allow changing ownerId.
   */
  async updatePet(params: UpdatePetParams) {
    const { clinicId, petId, data } = params;

    // Verify pet belongs to this clinic
    const existing = await this.prisma.pet.findFirst({
      where: { id: petId, clinicId },
    });

    if (!existing) return null;

    // Exclude ownerId from update data
    const { ...updateFields } = data;

    return this.prisma.pet.update({
      where: { id: petId },
      data: updateFields,
      include: { owner: true },
    });
  }

  /**
   * Searches patients using pg_trgm fuzzy matching.
   * Searches across owner name, mobile, and pet name.
   * Explicit clinicId in WHERE — raw queries bypass Prisma RLS extension.
   */
  async searchPatients(clinicId: string, query: string, limit: number = 20): Promise<PatientSearchResult[]> {
    const searchTerm = `%${query}%`;

    const results = await this.prisma.$queryRaw<PatientSearchResult[]>`
      SELECT DISTINCT ON (o.id, p.id)
        o.id::text AS "ownerId",
        o.name AS "ownerName",
        o.mobile,
        p.id::text AS "petId",
        p.name AS "petName",
        p.species::text AS "species",
        GREATEST(
          COALESCE(similarity(o.name, ${query}), 0),
          COALESCE(similarity(o.mobile, ${query}), 0),
          COALESCE(similarity(p.name, ${query}), 0)
        ) AS "relevance"
      FROM pet_owners o
      LEFT JOIN pets p ON p.owner_id = o.id AND p.clinic_id = ${clinicId}::uuid
      WHERE o.clinic_id = ${clinicId}::uuid
        AND (
          o.name ILIKE ${searchTerm}
          OR o.mobile ILIKE ${searchTerm}
          OR p.name ILIKE ${searchTerm}
        )
      ORDER BY o.id, p.id, "relevance" DESC
      LIMIT ${limit}
    `;

    // Re-sort by relevance descending (DISTINCT ON requires ORDER BY on its columns first)
    return results.sort((a, b) => Number(b.relevance) - Number(a.relevance));
  }

  /**
   * Returns recently visited pets with owners, ordered by most recent queue entry.
   */
  async getRecentPatients(clinicId: string, limit: number = 20) {
    const results = await this.prisma.$queryRaw<Array<{
      petId: string;
      petName: string;
      species: string;
      ownerId: string;
      ownerName: string;
      mobile: string;
      lastVisit: Date;
    }>>`
      SELECT
        p.id::text AS "petId",
        p.name AS "petName",
        p.species::text AS "species",
        o.id::text AS "ownerId",
        o.name AS "ownerName",
        o.mobile,
        MAX(q.checked_in_at) AS "lastVisit"
      FROM pets p
      JOIN pet_owners o ON o.id = p.owner_id
      JOIN queue_entries q ON q.pet_id = p.id
      WHERE p.clinic_id = ${clinicId}::uuid
      GROUP BY p.id, p.name, p.species, o.id, o.name, o.mobile
      ORDER BY "lastVisit" DESC
      LIMIT ${limit}
    `;

    return results;
  }
}
