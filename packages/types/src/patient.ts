import type { Species } from './constants/species.js';

export interface Owner {
  id: string;
  clinicId: string;
  mobile: string;
  name: string;
  email: string | null;
  address: string | null;
  altPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Pet {
  id: string;
  clinicId: string;
  ownerId: string;
  name: string;
  species: Species;
  breed: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  weight: number | null;
  color: string | null;
  microchipId: string | null;
  photoUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PetWithOwner extends Pet {
  owner: Owner;
}

export interface OwnerWithPets extends Owner {
  pets: Pet[];
}

export interface RegisterOwnerInput {
  mobile: string;
  name: string;
  email?: string;
  address?: string;
  altPhone?: string;
}

export interface RegisterPetInput {
  name: string;
  species: Species;
  breed?: string;
  birthYear?: number;
  birthMonth?: number;
  weight?: number;
  color?: string;
  microchipId?: string;
  photoUrl?: string;
  notes?: string;
}

export interface PatientSearchResult {
  ownerId: string;
  ownerName: string;
  mobile: string;
  petId: string;
  petName: string;
  species: Species;
  relevance: number;
}
