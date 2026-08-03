import { z } from 'zod';

export const clinicProfileUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().min(1).max(500).optional(),
  contactPhone: z.string().min(1).max(20).optional(),
  city: z.string().min(1).max(100).optional(),
  gstin: z.string().min(1).max(20).optional(),
});

const dayHoursSchema = z.object({
  open: z.string(),
  close: z.string(),
  closed: z.boolean(),
});

export const workingHoursBodySchema = z.object({
  hours: z.record(z.string(), dayHoursSchema),
});

export type ClinicProfileUpdateBody = z.infer<typeof clinicProfileUpdateSchema>;
export type WorkingHoursBody = z.infer<typeof workingHoursBodySchema>;
