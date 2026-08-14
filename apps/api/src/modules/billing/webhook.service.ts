import { createHmac, timingSafeEqual } from 'node:crypto';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { decryptSecret } from '../../lib/crypto.js';

/**
 * Verification, durable capture and enqueueing for Razorpay webhooks (BIL-06).
 *
 * ## The three things a webhook endpoint must get right
 *
 * 1. **Verify against the bytes Razorpay actually sent.** The HMAC is computed
 *    over the raw request body. Re-serialising a parsed object does not
 *    reliably reproduce those bytes — key order and number formatting are both
 *    free to change — so verification would fail on real traffic while passing
 *    against a hand-built payload. Hence {@link verifyWebhookSignature} takes a
 *    `Buffer`, never an object and never a re-stringified one.
 *
 * 2. **Dedupe in the database, not in the application.** Razorpay documents
 *    duplicate delivery as normal behaviour. An application-level "have I seen
 *    this?" read followed by a write is a race that double-settles an invoice
 *    under concurrent delivery, which is the retry pattern Razorpay actually
 *    uses. {@link persistWebhookEventIfNew} relies on the UNIQUE index on
 *    `webhook_events.event_id` and treats the resulting conflict as the answer.
 *
 * 3. **Do the work somewhere else.** Razorpay disables a webhook that fails for
 *    24 hours, and a non-2xx or a response slower than five seconds counts as a
 *    failure. So the endpoint persists the event and enqueues its id; every
 *    application decision happens in `webhook.worker.ts`.
 *
 * ## Credential handling
 *
 * `decryptSecret` is called here and, apart from `razorpay.client.ts`, nowhere
 * else in this module. The plaintext lives in one local binding inside
 * {@link verifyWebhookSignature} and is never returned, stored, cached or
 * logged.
 *
 * Note there is deliberately **no cache** on the webhook secret. `razorpay.client.ts`
 * caches an SDK instance fingerprinted on `razorpayKeyId`, which cannot see a
 * secret-only rotation (T-06-54). Verification re-decrypts from the row it just
 * read on every request instead, so an Admin who rotates only the webhook
 * secret is protected from the moment the write commits — the cost is one AES
 * operation per webhook, which is nothing next to the database round trip that
 * fetched the row.
 */

/**
 * The BullMQ queue name, shared by the producer here and the consumer in
 * `webhook.worker.ts`. A literal typo'd in one of the two places produces a
 * silently idle worker, so it is declared once.
 */
export const BILLING_WEBHOOK_QUEUE = 'billing-webhook';

/** The BullMQ job name within that queue. */
const BILLING_WEBHOOK_JOB = 'apply-webhook-event';

/**
 * The entire job payload.
 *
 * Only the row id travels through Redis — never the Razorpay body. The durable
 * record is the `webhook_events` row, and a payload that can contain card
 * metadata has no business being duplicated into a queue backend with its own
 * retention and its own operators (ASVS V7).
 */
export interface BillingWebhookJob {
  webhookEventId: string;
}

/** Copied from `notification-bus.ts` so both queues retry identically. */
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export class BillingWebhookBus {
  constructor(private queue: Queue<BillingWebhookJob>) {}

  async emit(job: BillingWebhookJob): Promise<void> {
    await this.queue.add(BILLING_WEBHOOK_JOB, job, JOB_OPTIONS);
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBillingWebhookBus(redis: Redis): BillingWebhookBus {
  const queue = new Queue<BillingWebhookJob>(BILLING_WEBHOOK_QUEUE, { connection: redis });
  return new BillingWebhookBus(queue);
}

// ─── Clinic resolution (D-29) ───────────────────────────────────────────────

/**
 * The only two `Clinic` columns webhook verification needs.
 *
 * `razorpayKeyId` and `razorpayKeySecretEnc` are absent on purpose: the inbound
 * path never calls the Razorpay API, so the credentials that could move money
 * out of the account are not even read here.
 */
export interface WebhookClinic {
  id: string;
  razorpayWebhookSecretEnc: string | null;
}

/**
 * Resolves the clinic from the unguessable path token.
 *
 * D-29 gives every clinic its own Razorpay account and therefore its own
 * webhook secret, while the deployment has one URL. The body cannot be used to
 * pick the secret — it is unverified input at this point, and trusting it to
 * choose its own verification key defeats the verification. A per-clinic path
 * token resolves clinic → secret with one indexed lookup, no trial
 * verification against every clinic's secret, and no parsing of untrusted data.
 *
 * Takes the client as an argument rather than reaching for one, so the caller's
 * choice of handle stays visible at the call site.
 */
export async function resolveClinicByWebhookToken(
  prisma: PrismaClient,
  token: string,
): Promise<WebhookClinic | null> {
  // A token is generated as a 32-character hex string. Rejecting obviously
  // malformed values before the query keeps a junk flood off the database.
  if (!token || token.length < 16 || token.length > 128) return null;

  return prisma.clinic.findUnique({
    where: { razorpayWebhookToken: token },
    select: { id: true, razorpayWebhookSecretEnc: true },
  });
}

// ─── Signature (T-06-56) ────────────────────────────────────────────────────

/** Hex SHA-256 is always 64 characters. Anything else cannot be a signature. */
const HEX_SIGNATURE = /^[0-9a-f]{64}$/i;

/**
 * Whether `signature` is Razorpay's HMAC over `raw` under the clinic's secret.
 *
 * The comparison is `crypto.timingSafeEqual` after an explicit length check.
 * The Razorpay Node SDK ships its own helper for this and it is deliberately
 * NOT used: 06-RESEARCH.md verified that it compares with a plain `===`, which
 * short-circuits on the first differing byte and so leaks the position of that
 * byte through response timing. Recovering a valid signature one byte at a time
 * from such an oracle is a well-understood attack, and the endpoint it would
 * open marks invoices paid.
 *
 * The format check above it is not part of the secret-dependent comparison —
 * the expected length of a hex SHA-256 digest is public — so returning early on
 * it reveals nothing.
 *
 * A secret that fails to decrypt returns `false` rather than throwing: a
 * corrupted or wrongly-keyed envelope must reject the delivery, not turn into a
 * 500 that tells the caller something about our internals.
 */
export function verifyWebhookSignature(
  raw: Buffer,
  signature: string,
  encryptedSecret: string,
): boolean {
  if (!HEX_SIGNATURE.test(signature)) return false;

  let secret: string;
  try {
    secret = decryptSecret(encryptedSecret);
  } catch {
    return false;
  }

  const expected = createHmac('sha256', secret).update(raw).digest();
  const received = Buffer.from(signature, 'hex');

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

// ─── Persistence (T-06-57) ──────────────────────────────────────────────────

export interface WebhookEventInput {
  clinicId: string;
  eventId: string;
  eventType: string;
  rawPayload: string;
}

/**
 * Inserts the event, or reports that it was already delivered.
 *
 * Returns the new row's id, or `null` when the UNIQUE index on `event_id`
 * rejected the insert — which is precisely the duplicate-delivery case. The
 * caller must not enqueue on `null`: a second job for the same event is a
 * second attempt to settle the same invoice.
 *
 * `signatureVerified` is hardcoded true because this function is unreachable
 * before verification. Persisting an unverified payload would put attacker-
 * controlled bytes into a table the worker later trusts.
 */
export async function persistWebhookEventIfNew(
  db: TenantPrismaClient,
  input: WebhookEventInput,
): Promise<{ id: string } | null> {
  try {
    return await db.webhookEvent.create({
      data: {
        clinicId: input.clinicId,
        eventId: input.eventId,
        eventType: input.eventType,
        rawPayload: input.rawPayload,
        signatureVerified: true,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return null;
    }
    throw err;
  }
}

/**
 * The event type, for the indexed `event_type` column and for logging.
 *
 * Parsed defensively even though the payload is verified by this point: a
 * verified payload is authentic, not necessarily well-formed, and a parse
 * failure here must not cost the 200 that keeps the webhook enabled. The worker
 * parses it again for real and records a `processingError` if it cannot.
 */
export function readEventType(raw: Buffer): string {
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as { event?: unknown };
    return typeof parsed.event === 'string' ? parsed.event.slice(0, 100) : 'unknown';
  } catch {
    return 'unknown';
  }
}
