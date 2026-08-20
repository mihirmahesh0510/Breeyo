import { z } from 'zod';

const uuidSchema = z.string().uuid();
const ownerPortalTabIdSchema = z.enum(['OVERVIEW', 'RECORDS', 'INVOICES']);
const ownerPortalCheckoutReturnStateSchema = z.enum(['success', 'failed', 'interrupted', 'pending']);

const ownerPortalReadySessionDataSchema = z
  .object({
    magicLinkId: uuidSchema,
    defaultTab: ownerPortalTabIdSchema,
  })
  .passthrough();

/**
 * D-64, D-67, OWN-04, OWN-06: `INVALID` and `EXPIRED` carry no data payload —
 * a mismatched, tampered, revoked, or expired link must not leak owner/pet
 * scope in the response body (T-09-02). Only `READY` may carry `data`.
 */
export const ownerPortalSessionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('VALIDATING') }).strict(),
  z.object({ state: z.literal('READY'), data: ownerPortalReadySessionDataSchema }).strict(),
  z.object({ state: z.literal('EXPIRED') }).strict(),
  z.object({ state: z.literal('INVALID') }).strict(),
]);

const magicLinkScopeDataSchema = z
  .object({
    magicLinkId: uuidSchema,
    allowedPetIds: z.array(uuidSchema),
    allowedInvoiceIds: z.array(uuidSchema),
    defaultTab: ownerPortalTabIdSchema,
  })
  .strict();

/**
 * Result of validating a presented magic-link token against stored scope.
 * Same no-data-unless-READY rule as `ownerPortalSessionSchema`, but carries
 * the explicit allow-lists a repository query filters on (OWN-06).
 */
export const magicLinkValidationResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('VALIDATING') }).strict(),
  z.object({ state: z.literal('READY'), data: magicLinkScopeDataSchema }).strict(),
  z.object({ state: z.literal('EXPIRED') }).strict(),
  z.object({ state: z.literal('INVALID') }).strict(),
]);

/**
 * D-59, D-69, D-70: owners may pay one invoice or combine several
 * pet-scoped invoices into a single checkout. At least one invoice is
 * required and duplicates are rejected outright.
 */
export const ownerPortalCheckoutSchema = z.object({
  magicLinkId: uuidSchema,
  selectedInvoiceIds: z
    .array(uuidSchema)
    .min(1, 'selectedInvoiceIds must include at least one invoice')
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'selectedInvoiceIds must not contain duplicate invoice ids',
    ),
});

/** D-60: a deep link opens a specific target first; only INVOICE/VISIT require an entity id. */
export const deepLinkRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('OVERVIEW') }).strict(),
  z.object({ type: z.literal('INVOICE'), entityId: uuidSchema }).strict(),
  z.object({ type: z.literal('VISIT'), entityId: uuidSchema }).strict(),
]);

/** D-53: within a valid link window, the portal restores exactly this last-viewed state. */
export const sessionRestoreStateSchema = z.object({
  lastTab: ownerPortalTabIdSchema.nullable(),
  lastPetId: uuidSchema.nullable(),
  lastInvoiceId: uuidSchema.nullable(),
  lastVisitId: uuidSchema.nullable(),
  lastCheckoutSessionId: uuidSchema.nullable(),
  lastReturnState: ownerPortalCheckoutReturnStateSchema.nullable(),
});

/**
 * D-67, D-82: self-service reissue request. Takes no fields — the raw
 * `:token` in the route itself is the sole identifier once hash-validated
 * server-side (`MagicLinkService.validate`), the same as every other
 * portal route. A body-level `expiredMagicLinkId` field was considered and
 * rejected: it added no security the token doesn't already provide, while
 * requiring the client to know an id that OWN-04/OWN-06 forbid the EXPIRED
 * session response from ever carrying.
 */
export const reissueRequestSchema = z.object({}).strict();
