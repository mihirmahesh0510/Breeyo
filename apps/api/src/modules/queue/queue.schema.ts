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

/**
 * Plan 09-04: browser queue board query. `knownVersion` is the highest
 * `staleVersion` (epoch ms) the browser last rendered -- omitted on first
 * load, present on every refetch so `BrowserSyncService.resolveStaleStatus`
 * can tell a genuinely fresh board from one that has fallen behind (D-40).
 */
export const webQueueBoardQuerySchema = z.object({
  knownVersion: z.coerce.number().int().nonnegative().optional(),
});

/** Params with `queueEntryId` -- the interface name the Plan 09-04 browser routes use, distinct from mobile's `entryId`. */
export const webQueueEntryParamsSchema = z.object({
  queueEntryId: z.string().uuid(),
});

export type CheckInBody = z.infer<typeof checkInBodySchema>;
