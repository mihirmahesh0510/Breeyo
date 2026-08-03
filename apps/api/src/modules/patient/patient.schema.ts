import { z } from 'zod';
import {
  ownerRegistrationSchema,
  petRegistrationSchema,
  patientSearchSchema,
} from '@breeyo/validators';

/** Combined registration: owner + pet in one request */
export const registerPatientBodySchema = z.object({
  owner: ownerRegistrationSchema,
  pet: petRegistrationSchema,
});

/** Query params for mobile lookup */
export const mobileLookupQuerySchema = z.object({
  mobile: z.string().min(1, 'Mobile number is required'),
});

/** Query params for patient search */
export { patientSearchSchema as searchQuerySchema };

/** Query params for recent patients */
export const recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Params with ownerId */
export const ownerParamsSchema = z.object({
  ownerId: z.string().uuid(),
});

/** Params with petId */
export const petParamsSchema = z.object({
  petId: z.string().uuid(),
});

/** Update pet body — all fields optional */
export const updatePetBodySchema = petRegistrationSchema.partial();

export type RegisterPatientBody = z.infer<typeof registerPatientBodySchema>;
export type UpdatePetBody = z.infer<typeof updatePetBodySchema>;
