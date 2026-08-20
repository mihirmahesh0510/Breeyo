// Phase 9 (D-46..D-82, OWN-01..OWN-06): shared owner-portal contracts. This
// is the one canonical contract surface later owner-portal plans (09-05,
// 09-06, 09-07) build against instead of re-deriving magic-link, session, or
// checkout rules per module.

import { createHash } from 'node:crypto';

/** Overall validity state of a magic-link session (D-64, D-67, OWN-04, OWN-06). */
export type OwnerPortalSessionState = 'VALIDATING' | 'READY' | 'EXPIRED' | 'INVALID';

/** Top-level owner-portal tabs (D-57). */
export type OwnerPortalTabId = 'OVERVIEW' | 'RECORDS' | 'INVOICES';

/** What a WhatsApp deep link opens first (D-60, D-63). */
export type OwnerPortalDeepLinkType = 'OVERVIEW' | 'INVOICE' | 'VISIT';

export interface OwnerPortalDeepLinkTarget {
  type: OwnerPortalDeepLinkType;
  /** Required when `type` is `INVOICE` or `VISIT`; absent for `OVERVIEW`. */
  entityId?: string;
}

/** Pet-switcher card summary (D-49, D-58). */
export interface OwnerPortalPetSummary {
  petId: string;
  name: string;
  species: string;
  photoUrl: string | null;
  hasUnpaidInvoice: boolean;
}

/** One entry in the read-only visit timeline (D-61, D-73, D-75). */
export interface OwnerPortalVisitSummary {
  visitId: string;
  visitDate: string;
  diagnosisText: string | null;
  diagnosisGloss: string | null;
  visitReason: string | null;
}

/** Prescription rendered as a simple usage card, not a raw row (D-74, D-76). */
export interface OwnerPortalPrescriptionCard {
  prescriptionId: string;
  drugName: string;
  usageInstruction: string;
  plainLanguageGloss: string | null;
}

/** Pet-scoped invoice summary (D-51, D-54, D-59). */
export interface OwnerPortalInvoiceSummary {
  invoiceId: string;
  petId: string;
  invoiceNumber: string | null;
  status: string;
  grandTotalPaise: number;
  balancePaise: number;
  dueDate: string | null;
}

/** Combined-checkout selection across one or many pet-scoped invoices (D-59, D-69, D-70). */
export interface OwnerPortalCheckoutSelection {
  magicLinkId: string;
  selectedInvoiceIds: string[];
}

/** Post-payment / interrupted-payment return state shown to the owner (D-71, D-72). */
export type OwnerPortalCheckoutReturnState = 'success' | 'failed' | 'interrupted' | 'pending';

/**
 * D-64, OWN-04: magic links are valid for exactly 7 days. This is the single
 * source of truth for the expiry window — persistence, validation, and any
 * later reissue logic must derive from this constant rather than
 * re-declaring `7 * 24 * 60 * 60` inline.
 */
export const OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/** D-82: self-service WhatsApp reissue is capped at 3 requests/owner/day. */
export const OWNER_PORTAL_REISSUE_DAILY_LIMIT = 3;

/**
 * Hashes a raw magic-link token for persistence lookup. Raw tokens are never
 * stored (T-09-02) — only this hash is compared against `tokenHash` in
 * `OwnerPortalMagicLink`.
 */
export function hashMagicLinkToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Computes the exact 7-day expiry instant for a link issued at `issuedAt`. */
export function computeMagicLinkExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS * 1000);
}

export interface ResolveOwnerPortalSessionStateInput {
  /** Whether the presented token's hash matches the stored `tokenHash`. */
  matchesHash: boolean;
  revokedAt: Date | null | undefined;
  expiresAt: Date;
  /** Defaults to `new Date()`; pass explicitly in tests for determinism. */
  now?: Date;
}

/**
 * Server-authoritative session-state resolution (D-64, D-67, OWN-04,
 * OWN-06). A hash mismatch or a revoked link both resolve to `INVALID` —
 * OWN-06 requires that mismatched, tampered, revoked, or cross-clinic tokens
 * are indistinguishable to the caller, so both collapse to the same state
 * rather than leaking which check failed.
 */
export function resolveOwnerPortalSessionState(
  input: ResolveOwnerPortalSessionStateInput,
): OwnerPortalSessionState {
  if (!input.matchesHash) {
    return 'INVALID';
  }
  if (input.revokedAt) {
    return 'INVALID';
  }
  const now = input.now ?? new Date();
  if (now.getTime() >= input.expiresAt.getTime()) {
    return 'EXPIRED';
  }
  return 'READY';
}
