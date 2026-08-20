import { createHash } from 'node:crypto';

/**
 * Hashes a raw magic-link token for persistence lookup. Raw tokens are never
 * stored (T-09-02) — only this hash is compared against `tokenHash` in
 * `OwnerPortalMagicLink`.
 *
 * Deliberately server-only (`apps/api/src/lib`, not `@breeyo/types`): `node:crypto`
 * cannot be bundled into the `apps/web` client build, and `@breeyo/types` is barrel-
 * exported into every consumer including browser code.
 */
export function hashMagicLinkToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
