import type { FastifyInstance } from 'fastify';
import { createTenantClient, getBasePrisma } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLogSafe } from '../../lib/billing-audit-log.js';
import {
  createBillingWebhookBus,
  persistWebhookEventIfNew,
  readEventType,
  resolveClinicByWebhookToken,
  verifyWebhookSignature,
} from './webhook.service.js';

/**
 * The Razorpay webhook endpoint (BIL-06).
 *
 * ## This plugin is registered on its own, and that is load-bearing
 *
 * Razorpay signs the RAW request body, so this route needs the bytes rather
 * than a parsed object. The parser installed below is scoped to this plugin
 * instance by Fastify's encapsulation — which only holds while the plugin is
 * registered as its own unit. Fold it into another registration, or wrap it in
 * `fastify-plugin`, and every JSON endpoint in the API starts handing its
 * handlers a Buffer.
 *
 * ## Four constraints, four distinct failure modes
 *
 * - **Raw body.** `JSON.stringify` of a parsed object does not reliably
 *   reproduce the bytes that were signed, so verification would fail on 100% of
 *   real traffic while passing against a hand-crafted local payload (T-06-60).
 * - **Under five seconds.** A slower response is a failure to Razorpay; 24
 *   hours of failures and the webhook is disabled for that clinic, silently
 *   ending BIL-06 for them. So this handler verifies, persists, enqueues and
 *   returns — nothing else (T-06-59).
 * - **Exempt from the rate limit.** A retry storm past the global 200/min would
 *   answer 429, which Razorpay counts as a failure, which produces more
 *   retries. The compensating controls are the unguessable path token and the
 *   HMAC, both stronger than an IP limit against a caller whose IPs we do not
 *   own (T-06-58).
 * - **Idempotent.** Duplicate delivery is documented behaviour, so the dedupe
 *   is a UNIQUE index rather than a read-then-write (T-06-57).
 *
 * ## Information posture
 *
 * An unknown token, a clinic with no configured secret, and a bad signature all
 * answer with no body and no reason (T-06-61). The distinction is recorded in
 * the log and in the audit trail, where the clinic can see it and an attacker
 * cannot.
 *
 * Nothing here logs the payload. It can carry card metadata, and logs outlive
 * the incident that made anyone look at them (T-06-62, ASVS V7).
 */
export default async function webhookRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  const bus = createBillingWebhookBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await bus.close();
  });

  fastify.post<{ Params: { webhookToken: string } }>(
    '/webhooks/razorpay/:webhookToken',
    // Razorpay presents no JWT and belongs to no clinic session, so neither the
    // identity middleware nor the tenant middleware is applied here. The path
    // token below is the tenant assertion, and the HMAC is the identity proof.
    { config: { rateLimit: false } },
    async (request, reply) => {
      const raw = request.body as Buffer;
      const signature = request.headers['x-razorpay-signature'];
      const eventId = request.headers['x-razorpay-event-id'];

      // Before any database access: a malformed flood then costs one string
      // comparison rather than a connection from the pool.
      if (typeof signature !== 'string' || typeof eventId !== 'string' || eventId.length === 0) {
        return reply.status(400).send();
      }

      // Admin client by design: the webhook has no request context and the
      // clinic is resolved from the path token, which is a lookup across every
      // clinic and so cannot run under a bound tenant (D-30 exemption).
      const clinic = await resolveClinicByWebhookToken(
        getBasePrisma(),
        request.params.webhookToken,
      );

      // A clinic that has not configured a webhook secret answers exactly as an
      // unknown token does. Any other status would let a caller enumerate which
      // tokens are real.
      if (!clinic?.razorpayWebhookSecretEnc) {
        return reply.status(404).send();
      }

      // From here the clinic is known, so every write goes through the
      // RLS-bound handle rather than the admin client above.
      const db = createTenantClient(clinic.id);

      if (!verifyWebhookSignature(raw, signature, clinic.razorpayWebhookSecretEnc)) {
        request.log.warn({ clinicId: clinic.id, eventId }, 'razorpay webhook signature mismatch');

        // Outside a transaction, and best-effort: rejecting a forged delivery
        // must not depend on the audit insert succeeding.
        await writeBillingAuditLogSafe(
          db,
          BillingAuditEvent.WEBHOOK_SIGNATURE_REJECTED,
          {
            clinicId: clinic.id,
            ipAddress: request.ip,
            // The event id and nothing from the body.
            metadata: { eventId },
          },
          { error: (obj, msg) => request.log.error(obj, msg) },
        );

        return reply.status(400).send();
      }

      const eventType = readEventType(raw);

      const inserted = await persistWebhookEventIfNew(db, {
        clinicId: clinic.id,
        eventId,
        eventType,
        rawPayload: raw.toString('utf8'),
      });

      // Null means the UNIQUE index rejected it: we have this event already.
      // Answer 200 so Razorpay stops retrying, but do NOT enqueue — a second
      // job is a second attempt to settle the same invoice.
      if (!inserted) {
        request.log.info(
          { clinicId: clinic.id, eventId, eventType },
          'razorpay webhook duplicate delivery ignored',
        );
        return reply.status(200).send({ received: true });
      }

      await bus.emit({ webhookEventId: inserted.id });

      request.log.info(
        { clinicId: clinic.id, eventId, eventType, webhookEventId: inserted.id },
        'razorpay webhook accepted',
      );

      return reply.status(200).send({ received: true });
    },
  );
}
