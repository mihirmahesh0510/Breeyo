import { z } from 'zod';

export const checkInSchema = z.object({
  petId: z.string().uuid(),
  visitReason: z.string().max(100).optional(),
  isEmergency: z.boolean().default(false),
});

export const queueStatusUpdateSchema = z.object({
  status: z.enum(['EXPECTED', 'WAITING', 'IN_CONSULT', 'DONE', 'NO_SHOW']),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type QueueStatusUpdateInput = z.infer<typeof queueStatusUpdateSchema>;
