import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { Pet, Owner, PetWithOwner, OwnerWithPets } from '@breeyo/types';

// --- Response types ---

interface Visit {
  id: string;
  petId: string;
  clinicId: string;
  visitReason: string | null;
  vetName: string | null;
  status: string;
  checkedInAt: string;
  completedAt: string | null;
}

interface PetProfileResponse {
  data: {
    pet: Pet;
    owner: Owner;
    visits: Visit[];
  };
}

interface OwnerDetailResponse {
  data: OwnerWithPets;
}

interface RecentPatientsResponse {
  data: PetWithOwner[];
}

interface UpdatePetResponse {
  data: Pet;
}

// --- Hooks ---

/**
 * Fetch a single pet's full profile including owner and visit history.
 */
export function usePetProfile(petId: string) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['pets', petId],
    queryFn: () =>
      apiClient<PetProfileResponse>(`/api/v1/pets/${petId}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!petId,
    staleTime: 60_000,
    select: (response) => response.data,
  });
}

/**
 * Fetch owner details with their list of pets.
 */
export function useOwnerDetail(ownerId: string) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['owners', ownerId],
    queryFn: () =>
      apiClient<OwnerDetailResponse>(`/api/v1/owners/${ownerId}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!ownerId,
    staleTime: 60_000,
    select: (response) => response.data,
  });
}

/**
 * Fetch recently visited patients, ordered by most recent visit.
 */
export function useRecentPatients(limit: number = 20) {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: ['patients', 'recent', activeClinicId, limit],
    queryFn: () =>
      apiClient<RecentPatientsResponse>(
        `/api/v1/patients/recent?limit=${limit}`,
        { token: accessToken! },
      ),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

/**
 * Mutation to update a pet's editable fields.
 * Invalidates the pet profile cache on success.
 */
export function useUpdatePet() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      petId,
      updates,
    }: {
      petId: string;
      updates: Partial<
        Pick<Pet, 'name' | 'species' | 'breed' | 'birthYear' | 'birthMonth' | 'weight' | 'color' | 'microchipId' | 'notes'>
      >;
    }) =>
      apiClient<UpdatePetResponse>(`/api/v1/pets/${petId}`, {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify(updates),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pets', variables.petId] });
      queryClient.invalidateQueries({ queryKey: ['patients', 'recent'] });
      queryClient.invalidateQueries({ queryKey: ['patients', 'search'] });
    },
  });
}

export type { Visit };
