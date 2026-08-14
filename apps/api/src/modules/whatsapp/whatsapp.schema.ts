/**
 * WHA-05 — Fastify-level param schemas for the WhatsApp module, following
 * `emr.schema.ts:1-20`'s shape: local Zod schemas for path params, plus
 * re-exports of the request-body/query schemas from `@breeyo/validators` so
 * `whatsapp.controller.ts` imports everything it needs from one place.
 */

import { z } from 'zod';
import {
  sendTemplateSchema,
  retryMessageSchema,
  ownerPreferenceSchema,
  consentSchema,
  clinicConfigSchema,
  bookingMoveSchema,
  bookingCancelSchema,
  inboxQuerySchema,
  threadQuerySchema,
  WA_TEMPLATE_VARIABLE_SCHEMAS,
  type SendTemplateBody,
  type RetryMessageBody,
  type OwnerPreferenceBody,
  type ConsentBody,
  type ClinicConfigBody,
  type BookingMoveBody,
  type BookingCancelBody,
  type InboxQuery,
  type ThreadQuery,
} from '@breeyo/validators';

export const threadParamsSchema = z.object({
  threadId: z.string().uuid(),
});

export const messageParamsSchema = z.object({
  messageId: z.string().uuid(),
});

export const bookingParamsSchema = z.object({
  bookingId: z.string().uuid(),
});

export type ThreadParams = z.infer<typeof threadParamsSchema>;
export type MessageParams = z.infer<typeof messageParamsSchema>;
export type BookingParams = z.infer<typeof bookingParamsSchema>;

// ─── Re-exports from @breeyo/validators (single import surface for the
// controller — see file header) ────────────────────────────────────────────

export {
  sendTemplateSchema,
  retryMessageSchema,
  ownerPreferenceSchema,
  consentSchema,
  clinicConfigSchema,
  bookingMoveSchema,
  bookingCancelSchema,
  inboxQuerySchema,
  threadQuerySchema,
  WA_TEMPLATE_VARIABLE_SCHEMAS,
};

export type {
  SendTemplateBody,
  RetryMessageBody,
  OwnerPreferenceBody,
  ConsentBody,
  ClinicConfigBody,
  BookingMoveBody,
  BookingCancelBody,
  InboxQuery,
  ThreadQuery,
};
