import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;

export async function buildTestApp(): Promise<FastifyInstance> {
  if (app) {
    return app;
  }

  app = await buildApp({ logger: false });
  await app.ready();

  // Bind an ephemeral port here rather than letting supertest do it per request.
  //
  // `request(app.server)` checks `server.address()` and, finding none, calls
  // `server.listen(0)` itself. That is fine one request at a time. It is not
  // fine concurrently: several calls issued in the same tick all observe a null
  // address and all call `listen` on the *same* server object, and the losers of
  // that race have their sockets reset -- surfacing as `read ECONNRESET` on an
  // assertion that has nothing to do with networking.
  //
  // Two Phase 6 tests fire concurrent requests by design and are exactly the
  // ones that must not be flaky: the webhook 50-event burst (BIL-06 latency
  // budget) and the two-finalize oversell race (BIL-02 `concurrent`). Binding
  // once, here, means every later `request()` reuses this address instead of
  // competing to create one.
  await app.listen({ port: 0, host: '127.0.0.1' });

  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}
