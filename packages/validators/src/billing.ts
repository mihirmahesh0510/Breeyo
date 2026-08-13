import { z } from 'zod';

export const serviceCatalogSchema = z.object({
  name: z.string().min(1).max(100),
  category: z
    .enum([
      'consultation',
      'vaccination',
      'surgery',
      'diagnostic',
      'dental',
      'grooming',
      'preventive',
      'emergency',
      'other',
    ])
    .default('other'),
  price: z.number().int().nonnegative(),
  sacCode: z.string().max(10).optional(),
  hsnCode: z.string().max(10).optional(),
  gstRateOverride: z.number().min(0).max(100).optional(),
  isActive: z.boolean().default(true),
});

export type ServiceCatalogInput = z.infer<typeof serviceCatalogSchema>;
