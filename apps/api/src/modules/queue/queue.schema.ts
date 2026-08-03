import { z } from 'zod';
import { checkInSchema, queueStatusUpdateSchema } from '@breeyo/validators';

/** Body for check-in with optional re-check-in flag */
export const checkInBodySchema = checkInSchema.extend({
  reCheckIn: z.boolean().default(false),
});

/** Body for status update */
export { queueStatusUpdateSchema as statusUpdateBodySchema };

/** Params with entryId */
export const entryParamsSchema = z.object({
  entryId: z.string().uuid(),
});

/** Query params for queue board */
export const queueBoardQuerySchema = z.object({
  date: z.coerce.date().optional(),
});

export type CheckInBody = z.infer<typeof checkInBodySchema>;
