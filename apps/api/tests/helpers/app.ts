import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;

export async function buildTestApp(): Promise<FastifyInstance> {
  if (app) {
    return app;
  }

  app = await buildApp({ logger: false });
  await app.ready();

  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}
