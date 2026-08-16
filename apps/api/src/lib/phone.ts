/**
 * The single shared E.164 phone normalizer (07-RESEARCH § Don't Hand-Roll,
 * Pitfall 9). No other file may regex-clean a phone number.
 *
 * `PetOwner.mobile` is stored `+91`-prefixed (see `createTestClinic`'s
 * `contactPhone` convention). Meta's webhook `contacts[].wa_id` and inbound
 * `from` field both arrive WITHOUT a leading `+` — the plus-less form must
 * still resolve to the same thread as the `+`-prefixed one, which is why
 * `toWaId` and `phoneMatches` exist alongside `toE164`.
 */

import { WaSendError } from '../modules/whatsapp/providers/wa-provider.port.js';

/**
 * Normalizes a raw phone number to canonical E.164-with-plus.
 *
 * Accepts, after stripping whitespace/dashes/parens:
 * - a bare 10-digit Indian number (`9876543210`) — prefixed with `+91`
 * - a 12-digit `91`-prefixed number (`919876543210`) — given a leading `+`
 * - an already `+91`-prefixed 10-digit number — returned as-is
 * - any other already-E.164-shaped number (`+` followed by 8-15 digits) —
 *   returned as-is, so non-Indian numbers already in canonical form pass
 *   through unchanged
 *
 * Anything else throws `WaSendError('INVALID_NUMBER_FORMAT')`, non-retryable
 * — a malformed number is a data problem, not a transient provider failure.
 */
export function toE164(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');

  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (/^\+91\d{10}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^\+\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }

  throw new WaSendError(
    'INVALID_NUMBER_FORMAT',
    null,
    false,
    `"${raw}" is not a recognized phone number format`,
  );
}

/**
 * Mirrors Meta's `wa_id` form: the E.164 number without its leading `+`.
 * Used to compare against `contacts[].wa_id` / inbound `from`.
 */
export function toWaId(e164: string): string {
  return e164.replace(/^\+/, '');
}

/**
 * Compares two phone numbers after normalizing both through `toE164`, so a
 * `+`-prefixed thread key and Meta's plus-less `wa_id` form (Pitfall 9)
 * always match when they refer to the same number.
 */
export function phoneMatches(a: string, b: string): boolean {
  return toE164(a) === toE164(b);
}
