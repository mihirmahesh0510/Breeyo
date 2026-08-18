import { z } from 'zod';
import { WA_TEMPLATE_KEYS, WA_INBOX_FILTERS, type WaTemplateKey } from '@breeyo/types';

/**
 * Zod schemas for every Phase 7 request body and every template's variable
 * set (WHA-02, WHA-03, WHA-05). Every `.max()` cap below is the mitigation
 * for template-variable injection (07-02-PLAN threat T-07-02-01): staff-
 * supplied variable text becomes owner-visible message content, so no
 * template variable may be an uncapped `z.string()`.
 */

// ─── Shared length caps ──────────────────────────────────────────────────────

const NAME_MAX = 120;
const DATE_MAX = 40;
const AMOUNT_MAX = 20;
const REFERENCE_MAX = 40;
const LINK_MAX = 512;
const REASON_MAX = 300;
const LABEL_MAX = 60;

/** E.164 with a mandatory leading '+', matching the mobile input contract. */
const WA_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

/** The template-key enum, derived from `WA_TEMPLATE_KEYS` so the two files
 * cannot drift (WHA-04). */
const templateKeySchema = z.enum(WA_TEMPLATE_KEYS as [WaTemplateKey, ...WaTemplateKey[]]);

// ─── Per-template variable schemas (WHA-02, D-18, D-23) ─────────────────────

/**
 * `invoice_delivery` is link-only in Beta (D-18) — no pdf/media variable.
 * `payment_link` is optional (D-23): omitted when the invoice is already
 * paid, present when it is unpaid.
 */
const invoiceDeliveryVariablesSchema = z.object({
  owner_name: z.string().max(NAME_MAX),
  pet_name: z.string().max(NAME_MAX),
  invoice_number: z.string().max(REFERENCE_MAX),
  amount: z.string().max(AMOUNT_MAX),
  payment_link: z.string().max(LINK_MAX).optional(),
});

const paymentReminderVariablesSchema = z.object({
  owner_name: z.string().max(NAME_MAX),
  pet_name: z.string().max(NAME_MAX),
  invoice_number: z.string().max(REFERENCE_MAX),
  amount: z.string().max(AMOUNT_MAX),
  due_date: z.string().max(DATE_MAX),
  payment_link: z.string().max(LINK_MAX),
});

const followUpReminderVariablesSchema = z.object({
  owner_name: z.string().max(NAME_MAX),
  pet_name: z.string().max(NAME_MAX),
  follow_up_date: z.string().max(DATE_MAX),
  follow_up_reason: z.string().max(REASON_MAX).optional(),
});

const vaccineDueVariablesSchema = z.object({
  owner_name: z.string().max(NAME_MAX),
  pet_name: z.string().max(NAME_MAX),
  vaccine_name: z.string().max(NAME_MAX),
  due_date: z.string().max(DATE_MAX),
});

const dewormingDueVariablesSchema = z.object({
  owner_name: z.string().max(NAME_MAX),
  pet_name: z.string().max(NAME_MAX),
  due_date: z.string().max(DATE_MAX),
});

const bookingConfirmationVariablesSchema = z.object({
  owner_name: z.string().max(NAME_MAX),
  pet_name: z.string().max(NAME_MAX),
  slot_label: z.string().max(LABEL_MAX),
  booking_reference: z.string().max(REFERENCE_MAX),
});

/**
 * Phase 8 (D-17, D-18): the appointment ADVANCE/ON_DATE two-touch reminder.
 * `touch` selects which of the two copies `render` below emits — the
 * ADVANCE touch invites a KEEP/MOVE/CANCEL reply, the ON_DATE touch does
 * not (D-33's owner replies are still accepted on either touch by the
 * inbound router, which does not care which touch a reply arrived on).
 */
const appointmentReminderVariablesSchema = z.object({
  owner_name: z.string().max(NAME_MAX),
  pet_name: z.string().max(NAME_MAX),
  appointment_date: z.string().max(DATE_MAX),
  appointment_time: z.string().max(DATE_MAX),
  touch: z.enum(['ADVANCE', 'ON_DATE']),
});

/**
 * WHA-02, WHA-05: the single source of truth for every template's variable
 * shape. A param mismatch is a `400` at this boundary rather than a Cloud
 * API `132000` failure later (07-RESEARCH § Pattern 3).
 */
export const WA_TEMPLATE_VARIABLE_SCHEMAS: Readonly<Record<WaTemplateKey, z.ZodObject<z.ZodRawShape>>> = {
  invoice_delivery: invoiceDeliveryVariablesSchema,
  payment_reminder: paymentReminderVariablesSchema,
  follow_up_reminder: followUpReminderVariablesSchema,
  vaccine_due: vaccineDueVariablesSchema,
  deworming_due: dewormingDueVariablesSchema,
  booking_confirmation: bookingConfirmationVariablesSchema,
  appointment_reminder: appointmentReminderVariablesSchema,
};

// ─── Request schemas ─────────────────────────────────────────────────────────

export const sendTemplateSchema = z.object({
  ownerId: z.string().uuid(),
  waPhone: z.string().regex(WA_PHONE_REGEX, 'waPhone must be E.164 with a leading +'),
  templateKey: templateKeySchema,
  variables: z.record(z.string()),
  contextType: z.enum(['REMINDER', 'INVOICE', 'BOOKING', 'GENERAL']),
  contextId: z.string().uuid().optional(),
  petId: z.string().uuid().optional(),
  staffNote: z.string().max(500).optional(),
});

export const retryMessageSchema = z.object({
  messageId: z.string().uuid(),
});

/** D-11: single global per-owner reminder opt-out toggle. */
export const ownerPreferenceSchema = z.object({
  remindersOptedOut: z.boolean(),
  source: z.enum(['OWNER_STOP', 'STAFF']),
  numberStatus: z.enum(['UNKNOWN', 'VALID', 'INVALID']).optional(),
});

/** D-12: explicit opt-in/withdrawal against the shared `ConsentRecord` model. */
export const consentSchema = z.object({
  action: z.enum(['grant', 'withdraw']),
  purposeText: z.string().max(500),
});

/** D-14, D-16: per-clinic provider and simulator configuration. */
export const clinicConfigSchema = z.object({
  provider: z.enum(['simulator', 'cloud-api']).default('simulator'),
  deliveryMode: z.enum(['NORMAL', 'DELAYED', 'FAIL', 'INVALID_NUMBER']),
  autoReplyEnabled: z.boolean(),
  autoReplyDelaySeconds: z.number().int().min(3).max(60),
  allowFreeformOutsideWindow: z.boolean().default(false),
  slotDurationMinutes: z.number().int().min(10).max(120),
});

/** D-09: staff-only booking move. */
export const bookingMoveSchema = z.object({
  slotDate: z.string().date(),
  slotStartMinutes: z.number().int().min(0).max(1439),
  slotDurationMinutes: z.number().int().positive(),
});

/** D-09: staff-only booking cancel; UI-SPEC saves the reason to the thread. */
export const bookingCancelSchema = z.object({
  reason: z.string().min(1).max(300),
});

/** UI-SPEC inbox filter chips; defaults to `all`, caps `limit` at 50 (DoS mitigation). */
export const inboxQuerySchema = z.object({
  filter: z.enum(WA_INBOX_FILTERS as [string, ...string[]]).default('all'),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().positive().max(50).default(25),
  cursor: z.string().optional(),
});

/** Paginated thread message history query. */
export const threadQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * A permissive-but-shaped Meta webhook envelope, validated before any
 * routing per the security domain's input-validation control (T-07-02-03).
 * The webhook handler (07-09) parses through this schema after HMAC
 * signature verification and before dispatching to `InboundRouter`.
 */
const webhookChangeSchema = z.object({
  field: z.string(),
  value: z.unknown(),
});

const webhookEntrySchema = z.object({
  id: z.string(),
  changes: z.array(webhookChangeSchema),
});

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(webhookEntrySchema),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type SendTemplateBody = z.infer<typeof sendTemplateSchema>;
export type RetryMessageBody = z.infer<typeof retryMessageSchema>;
export type OwnerPreferenceBody = z.infer<typeof ownerPreferenceSchema>;
export type ConsentBody = z.infer<typeof consentSchema>;
export type ClinicConfigBody = z.infer<typeof clinicConfigSchema>;
export type BookingMoveBody = z.infer<typeof bookingMoveSchema>;
export type BookingCancelBody = z.infer<typeof bookingCancelSchema>;
export type InboxQuery = z.infer<typeof inboxQuerySchema>;
export type ThreadQuery = z.infer<typeof threadQuerySchema>;
export type WebhookPayloadBody = z.infer<typeof webhookPayloadSchema>;
