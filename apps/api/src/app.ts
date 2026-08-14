import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';

import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import socketPlugin from './realtime/socket.js';
import { errorHandler } from './middleware/error-handler.js';
import { scheduleMidnightArchive } from './jobs/midnight-archive.js';
import { scheduleExpiryCron } from './jobs/expiry-cron.job.js';
import { createNotificationBus } from './modules/notifications/notification-bus.js';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? process.env.NODE_ENV !== 'test',
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Plugins
  await app.register(prismaPlugin);
  await app.register(redisPlugin);

  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  });

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-in-production',
  });

  await app.register(fastifyCors, {
    origin: [
      process.env.WEB_URL || 'http://localhost:3001',
      process.env.MOBILE_URL || 'exp://localhost:8081',
    ],
    // Explicit rather than relying on @fastify/cors's own default (found via live
    // E2E testing: preflight responses only ever returned "GET,HEAD,POST" in this
    // app, blocking every PUT/PATCH/DELETE request from a browser origin -- native
    // apps never preflight, so this was invisible until tested through an actual
    // browser).
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const isTest = process.env.NODE_ENV === 'test';
  await app.register(fastifyRateLimit, {
    max: isTest ? 10000 : 200,
    timeWindow: '1 minute',
    redis: app.redis,
  });

  // Structured request logging
  app.addHook('onResponse', (request, reply, done) => {
    request.log.info({
      request_id: request.id,
      clinic_id: (request as any).clinicId ?? null,
      user_id: (request as any).userId ?? null,
      method: request.method,
      url: request.url,
      status_code: reply.statusCode,
      duration_ms: reply.elapsedTime,
    }, 'request completed');
    done();
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // Routes
  await app.register(import('./modules/auth/auth.routes.js'), {
    prefix: '/api/v1',
    config: { rateLimit: { max: isTest ? 10000 : 20, timeWindow: '1 minute' } },
  });
  await app.register(import('./modules/notifications/notification.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/clinic/clinic.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/patient/patient.routes.js'), { prefix: '/api/v1' });

  // Socket.IO and queue (depends on prisma + redis + jwt being registered)
  await app.register(socketPlugin);
  await app.register(import('./modules/queue/queue.routes.js'), { prefix: '/api/v1' });

  // Phase 4: EMR & Clinical Records
  await app.register(import('./modules/emr/emr.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/drug/drug.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/attachment/attachment.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/vaccination/vaccination.routes.js'), { prefix: '/api/v1' });

  // Phase 5: Inventory Management
  await app.register(import('./modules/inventory/inventory.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/inventory/dispense.routes.js'), { prefix: '/api/v1' });

  // Phase 6: Invoicing & Payments
  // No `config` override: billing keeps the global 200/min rate limit. The
  // Razorpay webhook route (plan 06-10) is the documented exception and is
  // registered as a separate plugin with its own limit.
  await app.register(import('./modules/billing/billing.routes.js'), { prefix: '/api/v1' });

  // D-04 Quick Sale. A separate plugin so the counter-sale path owns its own
  // file rather than growing `billing.routes.ts`; it shares the same gates and
  // the same global rate limit.
  await app.register(import('./modules/billing/quick-sale.routes.js'), { prefix: '/api/v1' });

  // BIL-06. Its own registration on purpose: the plugin installs a raw-buffer
  // body parser, and Fastify's encapsulation is what keeps that scoped to this
  // one route instead of breaking JSON parsing everywhere else.
  await app.register(import('./modules/billing/webhook.routes.js'), { prefix: '/api/v1' });

  // Midnight archive cron (skip in test environment)
  if (!isTest) {
    scheduleMidnightArchive(app.prisma, app.io);

    // D-56: daily expiry cron -- marks newly-expired batches at midnight IST
    // and notifies the clinic via the existing BullMQ notifications queue.
    const expiryNotificationBus = createNotificationBus(app.redis);
    app.addHook('onClose', async () => {
      await expiryNotificationBus.close();
    });
    scheduleExpiryCron(app.prisma, expiryNotificationBus);

    // BIL-06: the consumer for the queue the webhook route produces into. The
    // route acknowledges Razorpay inside its five-second budget; everything
    // that touches an invoice happens here.
    const { createBillingWebhookWorker } = await import('./modules/billing/webhook.worker.js');
    const billingWebhookWorker = createBillingWebhookWorker(app.redis, app.prisma, app.io);
    app.addHook('onClose', async () => {
      await billingWebhookWorker.close();
    });

    // D-23 and D-11. Imported at the call site rather than at module scope so
    // the two cron modules are not even loaded when the guard is false.
    (await import('./jobs/overdue-invoices.js')).scheduleOverdueInvoices(app.prisma, app.io);
    (await import('./jobs/expire-payment-links.js')).scheduleExpirePaymentLinks(app.prisma, app.io);
  }

  return app;
}
