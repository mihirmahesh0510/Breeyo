import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export default fp(async function socketPlugin(fastify: FastifyInstance) {
  const io = new Server(fastify.server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket'],
  });

  // Redis adapter for horizontal scaling (optional in dev/test)
  if (fastify.redis) {
    try {
      const pubClient = fastify.redis.duplicate();
      const subClient = fastify.redis.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
    } catch {
      // Redis adapter is optional — fall back to in-memory for dev/test
      fastify.log.warn('Socket.IO Redis adapter not available, using in-memory adapter');
    }
  }

  // Auth middleware: verify JWT, extract clinicId, auto-join clinic room
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = fastify.jwt.verify<{
        sub: string;
        clinicId: string;
        type: string;
      }>(token);

      if (decoded.type !== 'access') {
        return next(new Error('Invalid token type'));
      }

      socket.data.userId = decoded.sub;
      socket.data.clinicId = decoded.clinicId;

      // Auto-join clinic room
      socket.join(`clinic:${decoded.clinicId}`);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const { clinicId } = socket.data;

    // Re-join room on reconnect (Pitfall 2 from RESEARCH.md)
    socket.join(`clinic:${clinicId}`);

    socket.on('disconnect', () => {
      // Room membership cleaned up automatically by Socket.IO
    });
  });

  fastify.decorate('io', io);

  fastify.addHook('onClose', async () => {
    io.close();
  });
});
