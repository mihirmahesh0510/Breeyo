import { z } from 'zod';

export const indianMobileSchema = z
  .string()
  .transform((val) => val.replace(/\s/g, ''))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, 'Mobile number must be 10 digits starting with 6-9'),
  );

export const ownerRegistrationSchema = z.object({
  mobile: indianMobileSchema,
  name: z.string().min(1, 'Name is required').max(100),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  address: z.string().max(500).optional(),
  altPhone: z.union([indianMobileSchema, z.literal('')]).optional(),
});

export const petRegistrationSchema = z.object({
  name: z.string().min(1, 'Pet name is required').max(100),
  species: z.enum(['DOG', 'CAT', 'BIRD', 'RABBIT', 'FISH', 'REPTILE', 'OTHER']),
  breed: z.string().max(100).optional(),
  birthYear: z.number().int().min(1990).max(2030).optional(),
  birthMonth: z.number().int().min(1).max(12).optional(),
  weight: z.number().positive().max(500).optional(),
  color: z.string().max(50).optional(),
  microchipId: z.string().max(50).optional(),
  photoUrl: z.string().url().optional(),
  notes: z.string().max(1000).optional(),
});

export const patientSearchSchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type OwnerRegistrationInput = z.infer<typeof ownerRegistrationSchema>;
export type PetRegistrationInput = z.infer<typeof petRegistrationSchema>;
export type PatientSearchInput = z.infer<typeof patientSearchSchema>;
