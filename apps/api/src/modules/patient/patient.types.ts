import type { RegisterOwnerInput, RegisterPetInput } from '@breeyo/types';

export interface RegisterOwnerParams extends RegisterOwnerInput {
  clinicId: string;
}

export interface RegisterPetParams extends RegisterPetInput {
  clinicId: string;
  ownerId: string;
}

export interface RegisterPatientParams {
  clinicId: string;
  owner: RegisterOwnerInput;
  pet: RegisterPetInput;
}

export interface SearchParams {
  clinicId: string;
  query: string;
  limit?: number;
}

export interface GetPetProfileParams {
  clinicId: string;
  petId: string;
}

export interface UpdatePetParams {
  clinicId: string;
  petId: string;
  data: Partial<RegisterPetInput>;
}
