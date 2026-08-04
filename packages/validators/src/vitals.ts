import { z } from 'zod';

export const vitalsSchema = z.object({
  weightKg: z.number().positive('Weight must be positive').max(500, 'Weight cannot exceed 500kg').nullable().optional(),
  temperatureC: z.number().min(30, 'Temperature too low').max(50, 'Temperature too high').nullable().optional(),
  heartRateBpm: z.number().int('Heart rate must be whole number').positive('Heart rate must be positive').max(1000, 'Heart rate cannot exceed 1000').nullable().optional(),
  respiratoryRate: z.number().int('Respiratory rate must be whole number').positive('Respiratory rate must be positive').max(200, 'Respiratory rate cannot exceed 200').nullable().optional(),
});

export type VitalsInput = z.infer<typeof vitalsSchema>;
