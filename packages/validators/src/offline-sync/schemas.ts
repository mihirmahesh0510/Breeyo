import { z } from 'zod';
import { ConflictSeverity, ReplayPriority, ResolutionState, SyncVisibilityState } from '@breeyo/types';

const nonEmptyId = z.string().trim().min(1);

/**
 * `z.unknown()` alone would let a missing key through (zod treats `undefined`
 * as a valid `unknown` value), so conflict payloads use this instead of plain
 * `z.unknown()` to make "key omitted" a real rejection, not just "key
 * present with any type."
 */
const requiredPayload = z.unknown().refine((value) => value !== undefined, {
  message: 'payload is required',
});

export const replayPrioritySchema = z.nativeEnum(ReplayPriority);

export const syncVisibilityStateSchema = z.nativeEnum(SyncVisibilityState);

export const resolutionStateSchema = z.nativeEnum(ResolutionState);

/**
 * Boundary schema for every replayed offline operation (D-01 to D-04).
 * `clinicId`/`userId`/`deviceId` are required so replay ingress never has to
 * trust an envelope with missing ownership, and `priority` is locked to the
 * shared `ReplayPriority` enum so an unrecognized tier code cannot silently
 * bypass the queue-first replay ladder (D-12 to D-14).
 */
export const offlineOperationEnvelopeSchema = z.object({
  deviceId: nonEmptyId,
  operationId: nonEmptyId,
  clinicId: nonEmptyId,
  userId: nonEmptyId,
  domain: nonEmptyId,
  entityType: nonEmptyId,
  entityId: nonEmptyId,
  priority: replayPrioritySchema,
  createdAt: z.string().min(1),
  payload: z.unknown(),
});

export type OfflineOperationEnvelopeInput = z.infer<typeof offlineOperationEnvelopeSchema>;

/**
 * Boundary schema for a persisted conflict record (D-05 to D-10). Both
 * payload snapshots are mandatory -- a conflict record with only one side
 * captured cannot support the explicit local-vs-server comparison D-08
 * requires. SAFETY_CRITICAL conflicts additionally require a named
 * `resolutionOwnerUserId` per D-24/D-36: a recommended owner is not enough
 * for the most conflict-sensitive domain -- someone must be accountable.
 */
export const syncConflictEnvelopeSchema = z
  .object({
    conflictId: nonEmptyId,
    clinicId: nonEmptyId,
    deviceId: nonEmptyId,
    operationId: nonEmptyId,
    domain: nonEmptyId,
    entityType: nonEmptyId,
    entityId: nonEmptyId,
    severity: z.nativeEnum(ConflictSeverity),
    localPayload: requiredPayload,
    serverPayload: requiredPayload,
    recommendedOwnerUserId: nonEmptyId.optional(),
    resolutionOwnerUserId: nonEmptyId.optional(),
    resolutionState: resolutionStateSchema,
    createdAt: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.severity === ConflictSeverity.SAFETY_CRITICAL && !value.resolutionOwnerUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolutionOwnerUserId'],
        message: 'resolutionOwnerUserId is required when severity is SAFETY_CRITICAL',
      });
    }
  });

export type SyncConflictEnvelopeInput = z.infer<typeof syncConflictEnvelopeSchema>;
