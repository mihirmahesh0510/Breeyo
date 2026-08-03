import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError & { statusCode?: number },
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.errors.map((e) => e.message).join(', '),
        details: { issues: error.errors },
      },
    });
    return;
  }

  const statusCode = error.statusCode || 500;

  request.log.error(error);

  if (statusCode === 429) {
    reply.status(429).send({
      error: {
        code: error.code || 'RATE_LIMITED',
        message: error.message || 'Too many requests — please try again later',
      },
    });
    return;
  }

  if (statusCode >= 500) {
    reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
    return;
  }

  const errorResponse: Record<string, unknown> = {
    code: error.code || 'ERROR',
    message: error.message,
  };

  // Forward additional details (e.g., clinics list for CLINIC_SELECTION_REQUIRED)
  if ((error as any).clinics) {
    errorResponse.clinics = (error as any).clinics;
  }

  reply.status(statusCode).send({ error: errorResponse });
}
