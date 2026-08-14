import Razorpay from 'razorpay';
import { decryptSecret } from '../../lib/crypto.js';

/**
 * Per-clinic Razorpay SDK factory (D-29, BIL-05).
 *
 * ## This file is the credential boundary
 *
 * `decryptSecret` is called here and NOWHERE else in the billing module. Every
 * other file — `payment.service.ts`, the controllers, the webhook worker —
 * takes a configured client from this factory and never sees a plaintext
 * secret. Grep gates in plan 06-09 enforce that:
 *
 *     grep -rn 'decryptSecret' apps/api/src/modules/billing/
 *
 * must show occurrences only in this file (and, from plan 06-10, in
 * `webhook.service.ts`, which needs the webhook secret to verify a signature).
 *
 * Nothing in this file logs. Not the key id, not the secret, not the clinic id.
 * A credential path with a log statement on it is one stray `log.error(err)`
 * away from putting a live payment key into a retained log stream (T-06-49,
 * ASVS V7).
 *
 * ## D-29: one SDK instance per clinic, not one per process
 *
 * Each clinic holds its OWN Razorpay account, so there is no such thing as a
 * process-wide client. Instances are cached by clinic id and fingerprinted by
 * `razorpayKeyId`, because the failure mode of a stale client is silent and
 * severe: after an Admin rotates credentials, a cached instance would keep
 * authenticating against the previous account and collect money into it.
 */

// The project idiom (`invoice.repository.ts`, `emr.service.ts`): an ordinary
// Error carrying `statusCode` and `code`, mapped by `middleware/error-handler.ts`.
type DomainError = Error & { statusCode: number; code: string };

/**
 * 409, not 500: a clinic with no Razorpay credentials is an unfinished settings
 * page, not a server fault. The distinct status is what lets the mobile sheet
 * say "Ask your Admin to add Razorpay keys in Billing Settings" instead of
 * showing a generic failure the front desk cannot act on.
 */
function razorpayNotConfigured(): DomainError {
  const error = new Error(
    'This clinic has not finished setting up online payments. An Admin must add the Razorpay key id and secret in Billing Settings.',
  ) as DomainError;
  error.statusCode = 409;
  error.code = 'RAZORPAY_NOT_CONFIGURED';
  return error;
}

function paymentGatewayError(message: string): DomainError {
  const error = new Error(message) as DomainError;
  error.statusCode = 502;
  error.code = 'PAYMENT_GATEWAY_ERROR';
  return error;
}

/**
 * The SDK's own property name for the secret, referenced exactly here.
 *
 * Naming it once keeps the credential audit trivial: grepping this file for the
 * SDK's secret property returns exactly the declaration below, so a reviewer can
 * confirm at a glance that the secret is never interpolated into a string,
 * placed on a returned object, or handed to a logger.
 */
const SDK_SECRET_PROPERTY = 'key_secret' as const;

/**
 * The `Clinic` columns this factory needs (plan 06-03's D-29 block).
 *
 * Deliberately a narrow structural type rather than the Prisma `Clinic` model:
 * a caller that passes a whole clinic row is passing more credential-adjacent
 * data around than it needs to, and the narrow shape makes the SELECT list at
 * every call site self-documenting.
 *
 * `razorpayWebhookSecretEnc` is absent on purpose — webhook verification is
 * plan 06-10's concern and has no business being reachable from the outbound
 * payment path.
 */
export interface ClinicRazorpayConfig {
  id: string;
  razorpayKeyId: string | null;
  razorpayKeySecretEnc: string | null;
  razorpayTestMode: boolean;
}

/**
 * Razorpay documents a **15-minute minimum** for `expire_by` on a Payment Link
 * and rejects anything closer with a 400 at request time, not at send time.
 *
 * Computing an expiry of exactly fifteen minutes from now therefore produces a
 * value that is already under the minimum by the time the request reaches
 * Razorpay's edge, once request latency and clock skew are added. The failure
 * is intermittent and
 * environment-dependent — it passes locally and fails in production under load,
 * which is the worst possible shape for a money bug.
 *
 * So the wire value is `now + 16 * 60`. This buffer is a transport concern and
 * changes nothing the user sees: the front-desk countdown still reads 15:00,
 * and plan 06-10's sweep still expires the pending payment server-side at
 * exactly 15 minutes (`PAYMENT_LINK_TIMEOUT_MINUTES`). Razorpay's own expiry is
 * the backstop, never the primary deadline.
 */
export const RAZORPAY_EXPIRY_BUFFER_SECONDS = 16 * 60;

interface CachedClient {
  instance: Razorpay;
  /**
   * The `razorpayKeyId` the cached instance was built with. Comparing it on
   * every lookup is what turns a credential rotation into a rebuild instead of
   * a silent misdirection of funds (T-06-54).
   */
  keyIdFingerprint: string;
}

const clientCache = new Map<string, CachedClient>();

/**
 * Drops a clinic's cached SDK instance.
 *
 * **Plan 06-12's billing-settings endpoint MUST call this** in the same request
 * that writes new `razorpayKeyId` / `razorpayKeySecretEnc` values. The
 * fingerprint check below catches a rotated *key id* on its own, but a merchant
 * who regenerates only the *secret* keeps the same key id, and that rotation is
 * invisible to the fingerprint — the cached instance would go on signing with a
 * revoked secret until the process restarted.
 */
export function invalidateRazorpayCache(clinicId: string): void {
  clientCache.delete(clinicId);
}

/**
 * Returns the clinic's configured Razorpay client, decrypting its secret at
 * call time.
 *
 * Throws a 409 `RAZORPAY_NOT_CONFIGURED` rather than a 500 when credentials are
 * missing: this is not a server fault, it is an unfinished billing settings
 * page, and 409 lets the mobile client show "Ask your Admin to add Razorpay
 * keys in Billing Settings" instead of a generic failure.
 */
export function getRazorpayForClinic(clinic: ClinicRazorpayConfig): Razorpay {
  const keyId = clinic.razorpayKeyId;
  const secretEnc = clinic.razorpayKeySecretEnc;

  if (!keyId || !secretEnc) {
    throw razorpayNotConfigured();
  }

  const cached = clientCache.get(clinic.id);
  if (cached && cached.keyIdFingerprint === keyId) {
    return cached.instance;
  }

  // The only decryption site in the outbound payment path. The plaintext lives
  // in this local binding and in the SDK's own closure, and nowhere else.
  const secret = decryptSecret(secretEnc);

  const instance = new Razorpay({ key_id: keyId, [SDK_SECRET_PROPERTY]: secret });

  // The SDK constructor assigns the secret as a plain ENUMERABLE own property,
  // so `JSON.stringify(client)` on an untouched instance emits the live
  // plaintext. Any future code that logs a client, embeds one in an error
  // payload, or serialises a context object that happens to hold one would leak
  // it. Redefining the property non-enumerable closes that whole class of leak
  // at the source, instead of relying on every future caller to remember
  // (T-06-49).
  //
  // The SDK reads the property only in its own constructor — the axios instance
  // on `client.api` already holds its own copy behind a function value, which
  // `JSON.stringify` skips — so hiding it here changes no behaviour.
  Object.defineProperty(instance, SDK_SECRET_PROPERTY, {
    value: secret,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  // Only the instance is cached. The decrypted secret is never held in the map
  // itself, so the cache's own contents carry nothing worth stealing.
  clientCache.set(clinic.id, { instance, keyIdFingerprint: keyId });

  return instance;
}

/** The error shape the Razorpay Node SDK rejects with. */
interface RazorpaySdkError {
  statusCode?: number;
  error?: {
    code?: string;
    description?: string;
    field?: string;
    source?: string;
    step?: string;
    reason?: string;
  };
  message?: string;
}

/**
 * Converts any Razorpay SDK rejection into a 502 `PAYMENT_GATEWAY_ERROR` whose
 * message still names the gateway's own reason. Always throws.
 *
 * **Why 502 and not the SDK's own status.** `middleware/error-handler.ts`
 * replaces the message on every response at or above 500 so that internal
 * detail cannot leak. A raw SDK rejection therefore reaches the front desk as
 * "An unexpected error occurred", which makes D-11 — "the failed payment shows
 * the reason, and staff choose retry or mark unpaid" — literally unachievable.
 * Raising a distinct, explicitly-safe `PAYMENT_GATEWAY_ERROR` gives the error
 * handler a narrow, reviewed allow-list entry to forward, rather than opening
 * the 5xx message channel in general.
 *
 * Only the gateway's `description` is forwarded. It is merchant-facing copy
 * Razorpay writes for exactly this purpose ("The amount must be atleast INR
 * 1.00", "expire_by should be at least 15 minutes from now") and carries no
 * credential material. The stack, the request body and the auth header are not
 * forwarded.
 */
export function normalizeRazorpayError(err: unknown): never {
  const sdkError = (err ?? {}) as RazorpaySdkError;

  const description =
    sdkError.error?.description ??
    sdkError.error?.reason ??
    (err instanceof Error ? err.message : undefined) ??
    sdkError.message;

  const gatewayCode = sdkError.error?.code;
  const gatewayStatus = sdkError.statusCode;

  const reason = description ?? 'the payment gateway rejected the request';

  const error = paymentGatewayError(`Razorpay: ${reason}`);

  // Structured detail for the client's error banner. `error-handler.ts`
  // forwards `details` on the allow-listed gateway error; nothing here is
  // derived from a credential.
  (error as DomainError & { details: Record<string, unknown> }).details = {
    gatewayCode: gatewayCode ?? null,
    gatewayStatus: gatewayStatus ?? null,
    field: sdkError.error?.field ?? null,
  };

  throw error;
}

/**
 * The `expire_by` value to send with a Payment Link, in Unix seconds.
 *
 * See {@link RAZORPAY_EXPIRY_BUFFER_SECONDS} for why the buffer is 16 minutes
 * rather than the documented 15-minute minimum.
 */
export function toRazorpayExpiry(now: Date): number {
  return Math.floor(now.getTime() / 1000) + RAZORPAY_EXPIRY_BUFFER_SECONDS;
}
