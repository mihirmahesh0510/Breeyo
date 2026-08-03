import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type {
  Owner,
  Pet,
  OwnerWithPets,
  RegisterOwnerInput,
  RegisterPetInput,
} from '@breeyo/types';

// --- Response types matching API envelope ---

interface RegisterPatientResponse {
  data: {
    owner: Owner;
    pet: Pet;
  };
}

interface LookupOwnerResponse {
  data: OwnerWithPets;
}

interface AddPetResponse {
  data: Pet;
}

// --- Input types ---

interface RegisterPatientInput {
  owner: RegisterOwnerInput;
  pet: RegisterPetInput;
}

// --- Hooks ---

/**
 * Registers a new patient (owner + pet) in a single transaction.
 * On success, invalidates all patient-related queries so lists refresh.
 */
export function useRegisterPatient() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterPatientInput) => {
      const response = await apiClient<RegisterPatientResponse>(
        '/api/v1/patients/register',
        {
          method: 'POST',
          body: JSON.stringify(input),
          token: accessToken!,
        },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['owners'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

/**
 * Looks up an existing owner by Indian mobile number.
 * Only fires when `mobile` is a valid 10-digit Indian number (starts with 6-9).
 * Returns OwnerWithPets if found, undefined if not yet queried.
 */
export function useLookupOwner(mobile: string) {
  const { accessToken } = useAuth();
  const isValidMobile = /^[6-9]\d{9}$/.test(mobile.replace(/\s/g, ''));

  return useQuery({
    queryKey: ['owners', 'lookup', mobile.replace(/\s/g, '')],
    queryFn: async () => {
      const cleanMobile = mobile.replace(/\s/g, '');
      const response = await apiClient<LookupOwnerResponse>(
        `/api/v1/owners/lookup?mobile=${encodeURIComponent(cleanMobile)}`,
        { token: accessToken! },
      );
      return response.data;
    },
    enabled: !!accessToken && isValidMobile,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Adds a new pet to an existing owner.
 * On success, invalidates owner and patient queries so pet lists refresh.
 */
export function useAddPet(ownerId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterPetInput) => {
      const response = await apiClient<AddPetResponse>(
        `/api/v1/owners/${encodeURIComponent(ownerId)}/pets`,
        {
          method: 'POST',
          body: JSON.stringify(input),
          token: accessToken!,
        },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owners', ownerId] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}
