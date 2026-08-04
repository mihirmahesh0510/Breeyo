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

  // Midnight archive cron (skip in test environment)
  if (!isTest) {
    scheduleMidnightArchive(app.prisma, app.io);
  }

  return app;
}
