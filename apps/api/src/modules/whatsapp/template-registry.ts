/**
 * WHA-02/WHA-05 — the six-template registry (07-RESEARCH § Pattern 3).
 *
 * One in-code registry is the single source of truth for every Beta
 * template: staff-facing name, D-10 category, Zod variable schema, local
 * render function, Cloud API metadata and allowed buttons. `staffName` and
 * `category` are SOURCED from `@breeyo/types`' `WA_TEMPLATE_STAFF_NAMES` /
 * `WA_TEMPLATE_CATEGORIES` rather than re-typed, so this file and the shared
 * constants can never drift; `variables` is sourced from
 * `@breeyo/validators`' `WA_TEMPLATE_VARIABLE_SCHEMAS` for the same reason.
 *
 * D-05: the reminder-kind-to-template lookup exported near the bottom of
 * this file has exactly three entries. There is structurally no path from a
 * `WaReminderKind` to the manual-only sixth template — the automated
 * reminder sweep (07-11) can only ever look up one of the three mapped
 * keys, so a bug there cannot reach that template even by accident.
 *
 * D-18/D-23: `invoice_delivery` is link-only. `payment_link` is an OPTIONAL
 * template variable (packages/validators/src/whatsapp.ts) — present when the
 * invoice is unpaid, omitted when it is already paid — and `render` below
 * emits a "Pay now: <link>" line only when the variable is present. There is
 * no PDF/media variable on this template in Beta.
 *
 * No template body is loaded from the database. In production, Meta owns
 * approved template content; a DB-backed template editor would create a
 * divergence to unwind at swap time, which is exactly the cost this frozen
 * in-code registry avoids paying later.
 */

import { z } from 'zod';
import {
  WA_TEMPLATE_STAFF_NAMES,
  WA_TEMPLATE_CATEGORIES,
  type WaButtonSpec,
  type WaReminderKind,
  type WaTemplateCategory,
  type WaTemplateKey,
} from '@breeyo/types';
import { WA_TEMPLATE_VARIABLE_SCHEMAS } from '@breeyo/validators';

export interface WaTemplateDefinition {
  key: WaTemplateKey;
  /** Exact UI-SPEC staff-facing name — sourced from WA_TEMPLATE_STAFF_NAMES. */
  staffName: string;
  /** D-10 category — sourced from WA_TEMPLATE_CATEGORIES. */
  category: WaTemplateCategory;
  /** Sourced from WA_TEMPLATE_VARIABLE_SCHEMAS. */
  variables: z.ZodObject<z.ZodRawShape>;
  /** Local render for the simulator bubble and the mobile variables preview. */
  render: (v: Record<string, string>) => string;
  /** Cloud API mapping — unused in Beta, present so the future swap is config, not code. */
  cloud: { name: string; languageCode: string; metaCategory: 'UTILITY' | 'MARKETING' };
  buttons?: WaButtonSpec[];
  supportsMedia: boolean;
}

function templateUnknownError(key: string) {
  const error = new Error(`Unknown WhatsApp template: ${key}`) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 400;
  error.code = 'TEMPLATE_UNKNOWN';
  return error;
}

// ─── Render functions ────────────────────────────────────────────────────
//
// Short, warm English, matching UI-SPEC's owner-copy tone: short paragraphs,
// one clear next action, no jargon. `render` never reaches into the
// database or a request object — its only inputs are the already-Zod-parsed
// variables passed by the caller.

function renderInvoiceDelivery(v: Record<string, string>): string {
  // D-23: payment_link is optional — a paid invoice omits the CTA line
  // entirely rather than leaving a dangling "Pay now:" with nothing after it.
  const payLine = v.payment_link ? `\n\nPay now: ${v.payment_link}` : '';
  return (
    `Hi ${v.owner_name}, here's the invoice for ${v.pet_name}'s visit.\n\n` +
    `Invoice #${v.invoice_number}: ₹${v.amount}` +
    payLine
  );
}

function renderPaymentReminder(v: Record<string, string>): string {
  return (
    `Hi ${v.owner_name}, a quick reminder that invoice #${v.invoice_number} for ` +
    `${v.pet_name} (₹${v.amount}) was due on ${v.due_date}.\n\n` +
    `Pay now: ${v.payment_link}`
  );
}

function renderFollowUpReminder(v: Record<string, string>): string {
  const reasonClause = v.follow_up_reason ? ` (${v.follow_up_reason})` : '';
  return (
    `Hi ${v.owner_name}, it's time for ${v.pet_name}'s follow-up${reasonClause} ` +
    `on ${v.follow_up_date}. Please visit the clinic or reply to book a time.`
  );
}

function renderVaccineDue(v: Record<string, string>): string {
  return (
    `Hi ${v.owner_name}, ${v.pet_name}'s ${v.vaccine_name} vaccine is due on ` +
    `${v.due_date}. Reply to book a visit.`
  );
}

function renderDewormingDue(v: Record<string, string>): string {
  return (
    `Hi ${v.owner_name}, ${v.pet_name} is due for deworming on ${v.due_date}. ` +
    `Reply to book a visit.`
  );
}

function renderBookingConfirmation(v: Record<string, string>): string {
  return (
    `Hi ${v.owner_name}, ${v.pet_name}'s appointment is confirmed for ` +
    `${v.slot_label}. Booking reference: ${v.booking_reference}.`
  );
}

// ─── The registry ─────────────────────────────────────────────────────────

export const WA_TEMPLATES: Readonly<Record<WaTemplateKey, WaTemplateDefinition>> = Object.freeze({
  invoice_delivery: {
    key: 'invoice_delivery',
    staffName: WA_TEMPLATE_STAFF_NAMES.invoice_delivery,
    category: WA_TEMPLATE_CATEGORIES.invoice_delivery,
    variables: WA_TEMPLATE_VARIABLE_SCHEMAS.invoice_delivery,
    render: renderInvoiceDelivery,
    cloud: { name: 'invoice_delivery', languageCode: 'en', metaCategory: 'UTILITY' },
    supportsMedia: true,
  },
  payment_reminder: {
    key: 'payment_reminder',
    staffName: WA_TEMPLATE_STAFF_NAMES.payment_reminder,
    category: WA_TEMPLATE_CATEGORIES.payment_reminder,
    variables: WA_TEMPLATE_VARIABLE_SCHEMAS.payment_reminder,
    render: renderPaymentReminder,
    cloud: { name: 'payment_reminder', languageCode: 'en', metaCategory: 'UTILITY' },
    supportsMedia: false,
  },
  follow_up_reminder: {
    key: 'follow_up_reminder',
    staffName: WA_TEMPLATE_STAFF_NAMES.follow_up_reminder,
    category: WA_TEMPLATE_CATEGORIES.follow_up_reminder,
    variables: WA_TEMPLATE_VARIABLE_SCHEMAS.follow_up_reminder,
    render: renderFollowUpReminder,
    cloud: { name: 'follow_up_reminder', languageCode: 'en', metaCategory: 'UTILITY' },
    supportsMedia: false,
  },
  vaccine_due: {
    key: 'vaccine_due',
    staffName: WA_TEMPLATE_STAFF_NAMES.vaccine_due,
    category: WA_TEMPLATE_CATEGORIES.vaccine_due,
    variables: WA_TEMPLATE_VARIABLE_SCHEMAS.vaccine_due,
    render: renderVaccineDue,
    cloud: { name: 'vaccine_due', languageCode: 'en', metaCategory: 'UTILITY' },
    supportsMedia: false,
  },
  deworming_due: {
    key: 'deworming_due',
    staffName: WA_TEMPLATE_STAFF_NAMES.deworming_due,
    category: WA_TEMPLATE_CATEGORIES.deworming_due,
    variables: WA_TEMPLATE_VARIABLE_SCHEMAS.deworming_due,
    render: renderDewormingDue,
    cloud: { name: 'deworming_due', languageCode: 'en', metaCategory: 'UTILITY' },
    supportsMedia: false,
  },
  booking_confirmation: {
    key: 'booking_confirmation',
    staffName: WA_TEMPLATE_STAFF_NAMES.booking_confirmation,
    category: WA_TEMPLATE_CATEGORIES.booking_confirmation,
    variables: WA_TEMPLATE_VARIABLE_SCHEMAS.booking_confirmation,
    render: renderBookingConfirmation,
    cloud: { name: 'booking_confirmation', languageCode: 'en', metaCategory: 'UTILITY' },
    // D-09: only an acknowledgement — never a cancel or move quick-reply.
    // Moving/cancelling a confirmed booking is staff-only via authenticated
    // API endpoints, not an owner quick-reply.
    buttons: [{ id: 'booking:confirm', title: 'Got it, thanks' }],
    supportsMedia: false,
  },
} satisfies Record<WaTemplateKey, WaTemplateDefinition>);

/**
 * D-05: the ONLY map from an automated reminder kind to a template. Exactly
 * three entries — the automated sweep (07-11) can never reach
 * `payment_reminder` through this map, structurally, because it is not a
 * key in it.
 */
export const WA_REMINDER_KIND_TO_TEMPLATE: Readonly<Record<WaReminderKind, WaTemplateKey>> =
  Object.freeze({
    FOLLOW_UP: 'follow_up_reminder',
    VACCINE_DUE: 'vaccine_due',
    DEWORMING_DUE: 'deworming_due',
  });

export function getTemplate(key: WaTemplateKey): WaTemplateDefinition {
  const def = WA_TEMPLATES[key];
  if (!def) {
    throw templateUnknownError(key);
  }
  return def;
}

/**
 * Validates `variables` against the template's Zod schema BEFORE rendering,
 * so a parameter mismatch is a 400 here rather than a Cloud API `132000`
 * failure later (07-RESEARCH § Pattern 3). Throws the raw `ZodError` (with a
 * `statusCode: 400` property attached) on mismatch — callers that want a
 * uniform error envelope can inspect `err instanceof z.ZodError`.
 */
export function renderTemplate(key: WaTemplateKey, variables: Record<string, string>): string {
  const def = getTemplate(key);

  let parsed: Record<string, string>;
  try {
    parsed = def.variables.parse(variables);
  } catch (err) {
    // Duck-typed rather than `instanceof z.ZodError`: the monorepo's
    // workspace packages can each resolve their own copy of the `zod`
    // module graph, which makes a cross-package `instanceof` unreliable even
    // when both copies are the same version (verified in this repo). Zod's
    // own error shape (`name === 'ZodError'` with an `issues` array) is
    // stable across module instances.
    if (err instanceof Error && err.name === 'ZodError') {
      (err as Error & { statusCode?: number; code?: string }).statusCode = 400;
      (err as Error & { statusCode?: number; code?: string }).code = 'TEMPLATE_VARIABLES_INVALID';
    }
    throw err;
  }

  return def.render(parsed);
}
