import { z } from 'zod';

export const consultationParamsSchema = z.object({
  consultationId: z.string().min(1),
});

export const petParamsSchema = z.object({
  petId: z.string().min(1),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const validateDosageBodySchema = z.object({
  dosageMg: z.number().positive(),
  petWeightKg: z.number().positive(),
  drugId: z.string().min(1),
  species: z.string().min(1),
});
