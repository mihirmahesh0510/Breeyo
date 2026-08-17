/**
 * WHA-04/WHA-05 — the Cloud API webhook: the one route in the application
 * that carries no JWT and no login session (D-14/D-16, T-07-09-01..09).
 *
 * ## This plugin is registered on its own, and that is load-bearing
 *
 * Meta signs the RAW request body, so this route needs the bytes rather
 * than a parsed object, and the content-type parser installed below is
 * scoped to this plugin instance by Fastify's encapsulation — which only
 * holds while the plugin is registered as its own unit (see the identical
 * load-bearing comment on `apps/api/src/modules/billing/webhook.routes.ts`,
 * whose shape this file follows). Fold this into another registration, or
 * wrap it in `fastify-plugin`, and JSON body handling for every other route
 * in the app is affected — this is exactly what Pitfall 10 warns about, and
 * exactly what this plan's `tests/auth tests/queue tests/patient` regression
 * check exists to catch.
 *
 * ## Order of operations in the POST handler is mandatory
 *
 * `verifyMetaSignature` runs over `request.rawBody` FIRST, before anything
 * else touches the parsed body or the database — a 401 on failure costs one
 * HMAC comparison, never a query (T-07-09-01, the phase's highest-severity
 * control). Only after that succeeds does the handler read `request.body`
 * (already parsed alongside `rawBody` by the same content-type parser below
 * — see 07-RESEARCH § Pattern 11's own code example, which parses inside the
 * same callback for the same reason) or reach `DeliveryStatusService` /
 * `InboundRouterService`.
 *
 * ## Processing runs before the 200 reply, deliberately
 *
 * 07-RESEARCH's plan text describes replying 200 immediately and enqueuing
 * the rest — appropriate for Razorpay's webhook (`billing/webhook.worker.ts`),
 * where settling an invoice is a lock-heavy, multi-step operation that can
 * genuinely miss a five-second budget. Every event this handler can receive
 * is a single fast write (one status-ledger row, or one inbound message) —
 * exactly the kind of operation `DeliveryStatusService`/`InboundRouterService`
 * were built to do quickly — so this handler awaits processing before
 * replying rather than adding a third queue+worker pair whose only job would
 * be to do the same fast writes one hop later. The trade-off is deliberate
 * and documented: it keeps a redelivered webhook's effects deterministic and
 * observable within the same request (see `tests/whatsapp/webhook-idempotency.test.ts`),
 * at the cost of a slightly longer response than a bare acknowledgement —
 * still well inside Meta's response-time expectations for a single-row
 * write. `WHATSAPP_PROVIDER` stays `simulator` deploy-wide in Beta
 * (07-RESEARCH), so this route carries no live traffic yet regardless.
 *
 * ## Clinic resolution for owner-originated events is a documented Beta gap
 *
 * Meta's webhook is keyed by `phone_number_id`, and Beta's schema has no
 * table mapping a `phone_number_id` to a clinic (no pilot clinic has
 * completed Meta Business verification yet — `PROJECT.md`). `STATUS` events
 * need no such mapping (`DeliveryStatusService.apply` finds its message by
 * the globally-unique `providerMessageId`), so they are always processed.
 * Owner-originated events (TEXT/BUTTON_REPLY/LIST_REPLY/UNSUPPORTED) require
 * a `clinicId` to route through `InboundRouterService`, so this Beta build
 * resolves it from a single `WHATSAPP_WEBHOOK_CLINIC_ID` env var — correct
 * for the single pilot clinic Beta's Cloud API path is built to prove, and a
 * documented placeholder for the multi-clinic phone-number-id mapping a
 * later phase adds once more than one clinic actually onboards onto the real
 * API. If it is unset, those events are logged and dropped rather than
 * guessed at — never mis-attributed to the wrong clinic.
 *
 * ## `inboundRouter`/`deliveryStatusService` are injected, not built here
 *
 * Fix (closing a gap disclosed in 08-11-SUMMARY.md's owner-action-bridge
 * writeup): this plugin used to construct its OWN bare `InboundRouterService`
 * (`repository`/`prisma`/`deliveryStatusService` only), with none of
 * `bookingHandler`/`reminderHandler`/`appointmentActionHandler` injected —
 * meaning a REAL Meta Cloud API delivery could never dispatch a `BOOK`
 * keyword, a reminder reply, or an `appointment:keep|move|cancel:<uuid>`
 * payload to anything but the no-op defaults, unlike the simulator path
 * (`simulator.worker.ts`), which already routed through
 * `whatsapp.routes.ts`'s own fully-wired instance. Invisible until now
 * because `WHATSAPP_PROVIDER` stays `simulator` deploy-wide in Beta (this
 * route carries no live traffic yet) and no prior test posted a
 * TEXT/BUTTON_REPLY/LIST_REPLY event to this route over HTTP (only STATUS
 * events, in `webhook-idempotency.test.ts`). `whatsapp.routes.ts` now passes
 * its own `inboundRouter`/`deliveryStatusService` in as plugin options
 * instead.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { DeliveryStatusService } from './delivery-status.service.js';
import type { InboundRouterService } from './inbound-router.service.js';
import {
  handleVerification,
  parseMetaWebhook,
  verifyMetaSignature,
} from './providers/cloud-api/cloud-api.webhook.js';
import type { WaInboundEvent } from './providers/wa-provider.port.js';

export interface WhatsAppWebhookRoutesOptions {
  /** `whatsapp.routes.ts`'s own fully-wired instances — see the file header. */
  inboundRouter: InboundRouterService;
  deliveryStatusService: DeliveryStatusService;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

/** Real Meta payloads are a handful of KB; well beyond generous, still far below Fastify's 1 MiB default (T-07-09-03). */
const WEBHOOK_BODY_LIMIT_BYTES = 100 * 1024;

/**
 * Detects a byte-identical redelivery of a status notification already
 * recorded, so the transport-level retry case (see file header) costs one
 * lookup rather than a second ledger row for the same underlying event.
 * Looks up the message by `providerMessageId` first because
 * `WhatsAppMessageStatusEvent` has no `providerMessageId` column of its own
 * (it is keyed by the internal `messageId`, matching `whatsapp.repository.ts`).
 */
async function isDuplicateStatusDelivery(
  prisma: PrismaClient,
  event: Extract<WaInboundEvent, { kind: 'STATUS' }>,
): Promise<boolean> {
  const message = await prisma.whatsAppMessage.findFirst({
    where: { providerMessageId: event.providerMessageId },
  });
  if (!message) {
    return false;
  }

  const existing = await prisma.whatsAppMessageStatusEvent.findFirst({
    where: { messageId: message.id, status: event.status, occurredAt: event.occurredAt },
  });
  return existing !== null;
}

export default async function whatsappWebhookRoutes(
  fastify: FastifyInstance,
  opts: WhatsAppWebhookRoutesOptions,
): Promise<void> {
  const isTest = process.env.NODE_ENV === 'test';

  // Scoped to THIS plugin instance only (see file header) — capturing the
  // raw string alongside the parsed JSON in the same parser callback, per
  // 07-RESEARCH § Pattern 11's own code example.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request: FastifyRequest, body: string, done) => {
      request.rawBody = body;
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // D-30 exemption: this whole plugin runs before any JWT/tenantContext
  // middleware (see file header — Meta's webhook carries no login session),
  // so there is no `request.db` anywhere in this file to build from. Reuses
  // `whatsapp.routes.ts`'s own fully-wired instances (see file header)
  // rather than building bare-bones ones of its own.
  const { inboundRouter, deliveryStatusService } = opts;

  fastify.get(
    '/whatsapp/webhook',
    { config: { rateLimit: { max: isTest ? 10000 : 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '';
      const result = handleVerification(request.query as Record<string, string | undefined>, verifyToken);
      return reply.status(result.status).send(result.body);
    },
  );

  fastify.post(
    '/whatsapp/webhook',
    {
      bodyLimit: WEBHOOK_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: isTest ? 10000 : 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const rawBody = request.rawBody;
      const signature = request.headers['x-hub-signature-256'];
      const appSecret = process.env.WHATSAPP_APP_SECRET;

      // T-07-09-01: the FIRST thing this handler does. No parsing, no
      // database access, before this returns.
      if (
        rawBody === undefined ||
        typeof appSecret !== 'string' ||
        appSecret.length === 0 ||
        !verifyMetaSignature(rawBody, signature as string | undefined, appSecret)
      ) {
        return reply.status(401).send();
      }

      const events = parseMetaWebhook(request.body);
      const clinicId = process.env.WHATSAPP_WEBHOOK_CLINIC_ID;

      for (const event of events) {
        if (event.kind === 'STATUS') {
          // Meta retries a webhook DELIVERY (the transport-level HTTP POST)
          // whenever it does not see a fast 2xx — which means the exact
          // same notification (same providerMessageId + status + timestamp)
          // can arrive more than once, distinct from genuinely receiving two
          // DIFFERENT status events out of order (Pitfall 14, which
          // `DeliveryStatusService.apply` already handles correctly via
          // monotonic ranking — see its own append-every-call ledger
          // contract). This is the narrower, transport-level case: a
          // byte-identical redelivery of a notification already recorded is
          // detected here, BEFORE calling `apply`, so it costs one lookup
          // rather than a second ledger row for the same underlying event.
          // D-30 exemption: no `request.db` in this webhook plugin (see file
          // header and the construction block above).
          if (await isDuplicateStatusDelivery(fastify.prisma, event)) {
            continue;
          }

          await deliveryStatusService.apply(
            event.providerMessageId,
            event.status,
            event.failure,
            event.occurredAt,
          );
          continue;
        }

        if (!clinicId) {
          // Documented Beta gap — see file header.
          request.log.warn(
            { providerMessageId: event.providerMessageId },
            'WHATSAPP_WEBHOOK_CLINIC_ID is not set; dropping an inbound WhatsApp webhook event',
          );
          continue;
        }

        await inboundRouter.route(event, clinicId);
      }

      // Meta retries on any non-2xx response.
      return reply.status(200).send({ received: true });
    },
  );

  fastify.log.info('WhatsApp Cloud API webhook routes registered');
}
