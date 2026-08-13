import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { disconnectAppPrisma } from '../lib/prisma-rls.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp(async function prismaPlugin(fastify: FastifyInstance) {
  const prisma = new PrismaClient();

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    // Both pooled clients must be closed: the admin client decorated above and
    // the app-role singleton that backs every request.db tenant handle.
    await Promise.all([prisma.$disconnect(), disconnectAppPrisma()]);
  });
});
