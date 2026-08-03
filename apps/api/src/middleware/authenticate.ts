import type { FastifyRequest, FastifyReply } from 'fastify';
import { AUTH_ERRORS } from '@breeyo/types';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; clinicId: string; type: string };
    user: { id: string; activeClinicId: string };
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const decoded = await request.jwtVerify<{
      sub: string;
      clinicId: string;
      type: string;
    }>();

    if (decoded.type !== 'access') {
      return reply.status(401).send({ error: AUTH_ERRORS.SESSION_EXPIRED });
    }

    request.user = {
      id: decoded.sub,
      activeClinicId: decoded.clinicId,
    };
  } catch {
    return reply.status(401).send({ error: AUTH_ERRORS.SESSION_EXPIRED });
  }
}
