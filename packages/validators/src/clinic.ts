import { z } from 'zod';

export const createClinicSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(5).max(500),
  contactPhone: z.string().regex(/^\+91\d{10}$/),
});

export const switchClinicSchema = z.object({
  clinicId: z.string().uuid(),
});

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type SwitchClinicInput = z.infer<typeof switchClinicSchema>;
