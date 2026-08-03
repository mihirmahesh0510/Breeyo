import {
  ownerRegistrationSchema,
  petRegistrationSchema,
  patientSearchSchema,
} from '@breeyo/validators';
import { indianMobileSchema } from '@breeyo/validators';
import type { PatientSearchResult } from '@breeyo/types';
import type { PatientRepository } from './patient.repository.js';
import type {
  RegisterOwnerParams,
  RegisterPetParams,
  RegisterPatientParams,
  SearchParams,
  GetPetProfileParams,
  UpdatePetParams,
} from './patient.types.js';

export class PatientService {
  constructor(private readonly repository: PatientRepository) {}

  /**
   * Registers owner with mobile number as unique key per clinic.
   * D-06: Returns existing owner if mobile already registered.
   */
  async registerOwner(params: RegisterOwnerParams) {
    const parsed = ownerRegistrationSchema.parse({
      mobile: params.mobile,
      name: params.name,
      email: params.email,
      address: params.address,
      altPhone: params.altPhone,
    });

    return this.repository.createOwner({
      clinicId: params.clinicId,
      mobile: parsed.mobile,
      name: parsed.name,
      email: parsed.email,
      address: parsed.address,
      altPhone: parsed.altPhone,
    });
  }

  /**
   * Registers a pet linked to an owner.
   * Verifies owner exists at this clinic before creating.
   */
  async registerPet(params: RegisterPetParams) {
    const parsed = petRegistrationSchema.parse({
      name: params.name,
      species: params.species,
      breed: params.breed,
      birthYear: params.birthYear,
      birthMonth: params.birthMonth,
      weight: params.weight,
      color: params.color,
      microchipId: params.microchipId,
      photoUrl: params.photoUrl,
      notes: params.notes,
    });

    // Verify owner exists at this clinic
    const owner = await this.repository.findOwnerById(params.clinicId, params.ownerId);
    if (!owner) {
      const error = new Error('Owner not found at this clinic') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'OWNER_NOT_FOUND';
      throw error;
    }

    return this.repository.createPet({
      clinicId: params.clinicId,
      ownerId: params.ownerId,
      ...parsed,
    });
  }

  /**
   * Combined registration: creates owner (or returns existing) then creates pet.
   * D-01: Two-step wizard. D-12: Quick inline registration.
   */
  async registerPatient(params: RegisterPatientParams) {
    const owner = await this.registerOwner({
      clinicId: params.clinicId,
      ...params.owner,
    });

    const pet = await this.registerPet({
      clinicId: params.clinicId,
      ownerId: owner.id,
      ...params.pet,
    });

    return { owner, pet };
  }

  /**
   * Looks up owner and all their pets by mobile number.
   * QUE-06: Returning patient auto-fill.
   */
  async lookupByMobile(clinicId: string, mobile: string) {
    const parsed = indianMobileSchema.parse(mobile);
    return this.repository.findOwnerByMobile(clinicId, parsed);
  }

  /**
   * Returns owner with all their pets.
   */
  async getOwnerWithPets(clinicId: string, ownerId: string) {
    return this.repository.findOwnerById(clinicId, ownerId);
  }

  /**
   * Returns pet profile with owner info and visit history.
   * PAT-05: Pet profile with visit history.
   */
  async getPetProfile(params: GetPetProfileParams) {
    return this.repository.getPetProfile(params.clinicId, params.petId);
  }

  /**
   * Updates pet optional fields.
   * D-30: Explicit edit mode prevents accidental changes.
   */
  async updatePet(params: UpdatePetParams) {
    if (params.data.name || params.data.species) {
      // Validate changed fields if provided
      const partial: Record<string, unknown> = {};
      if (params.data.name) partial.name = params.data.name;
      if (params.data.species) partial.species = params.data.species;
      if (params.data.breed !== undefined) partial.breed = params.data.breed;

      petRegistrationSchema.partial().parse(params.data);
    }

    const result = await this.repository.updatePet(params);
    if (!result) {
      const error = new Error('Pet not found at this clinic') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'PET_NOT_FOUND';
      throw error;
    }
    return result;
  }

  /**
   * Searches patients by owner name, mobile, or pet name.
   * PAT-04: Trigram fuzzy matching.
   */
  async searchPatients(params: SearchParams): Promise<PatientSearchResult[]> {
    const parsed = patientSearchSchema.parse({
      q: params.query,
      limit: params.limit,
    });

    return this.repository.searchPatients(
      params.clinicId,
      parsed.q,
      parsed.limit,
    );
  }

  /**
   * Returns recently visited pets, ordered by most recent visit.
   * D-26: Default view on Patients tab.
   */
  async getRecentPatients(clinicId: string, limit: number = 20) {
    return this.repository.getRecentPatients(clinicId, limit);
  }
}
