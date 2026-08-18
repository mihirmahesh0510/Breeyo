import type { WaBookingState, WaInboxFilter, WaTemplateCategory, WaTemplateKey } from '../whatsapp.js';

/**
 * WHA-04 / D-10: the six Beta template keys, in the order UI-SPEC lists them.
 * Downstream code (template registry, Zod enum) derives from this constant
 * rather than re-typing the six literals, so the two can never drift.
 */
export const WA_TEMPLATE_KEYS: readonly WaTemplateKey[] = [
  'invoice_delivery',
  'payment_reminder',
  'follow_up_reminder',
  'vaccine_due',
  'deworming_due',
  'booking_confirmation',
  'appointment_reminder',
] as const;

/**
 * WHA-04: exact UI-SPEC staff-facing names. These render verbatim in the
 * mobile TemplateSendSheet — do not "clean up" the casing or hyphenation.
 */
export const WA_TEMPLATE_STAFF_NAMES: Readonly<Record<WaTemplateKey, string>> = {
  invoice_delivery: 'Invoice delivery',
  payment_reminder: 'Payment reminder',
  follow_up_reminder: 'Follow-up reminder',
  vaccine_due: 'Vaccine due',
  deworming_due: 'Deworming due',
  booking_confirmation: 'Booking confirmation',
  appointment_reminder: 'Appointment reminder',
} as const;

/**
 * D-10: template category split. "Invoice delivery" and "Booking
 * confirmation" are transactional and always attempted regardless of STOP
 * status; the other four are reminder-category and silenceable by a global
 * owner opt-out (D-11).
 */
export const WA_TEMPLATE_CATEGORIES: Readonly<Record<WaTemplateKey, WaTemplateCategory>> = {
  invoice_delivery: 'TRANSACTIONAL',
  payment_reminder: 'REMINDER',
  follow_up_reminder: 'REMINDER',
  vaccine_due: 'REMINDER',
  deworming_due: 'REMINDER',
  booking_confirmation: 'TRANSACTIONAL',
  // D-17/D-18: an appointment reminder is silenceable by the same global
  // STOP opt-out as every other reminder-category template.
  appointment_reminder: 'REMINDER',
} as const;

/**
 * WHA-04: the real WhatsApp Business Cloud API hard limits, not clinic
 * preferences. The simulator adapter enforces the exact same numbers so the
 * template registry and booking flow are exercised against real constraints
 * before any real Meta traffic flows (07-RESEARCH § Pattern 1).
 */
export const WA_CAPABILITY_LIMITS = {
  /** Max quick-reply buttons per interactive message. */
  maxQuickReplyButtons: 3,
  /** Max characters in a quick-reply button title. */
  maxButtonTitleChars: 20,
  /** Max rows total across all sections of a list message. */
  maxListRows: 10,
  /** Max characters in a list row title. */
  maxListRowTitleChars: 24,
  /** Max characters in a list row id. */
  maxListRowIdChars: 200,
  /** Max characters in a button id. */
  maxButtonIdChars: 256,
  /** Max characters in an interactive message body. */
  maxInteractiveBodyChars: 1024,
  /** Max characters in a plain text message body. */
  maxTextBodyChars: 4096,
  /** The 24-hour customer service window. */
  serviceWindowHours: 24,
  /** 100 MB media upload cap. */
  mediaMaxBytes: 104857600,
} as const;

/**
 * WHA-05: monotonic status ranks. Meta does not guarantee webhook status
 * ordering (`read` can arrive before `delivered`), so `DeliveryStatusService`
 * applies a status only if its rank exceeds the message's current rank.
 * `FAILED` is terminal-by-precedence and intentionally has no rank here —
 * it is never compared against this table, only ever set directly or
 * superseded by a new message row via staff Retry.
 */
export const WA_STATUS_RANK = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  REPLIED: 4,
} as const;

/**
 * D-01, D-02: fixed Beta lead times for the "before" touch of each automated
 * reminder kind. Not configurable in Beta — see 07-CONTEXT.md deferred ideas.
 */
export const WA_REMINDER_LEAD_DAYS = {
  FOLLOW_UP: 1,
  VACCINE_DUE: 3,
  DEWORMING_DUE: 3,
  // Phase 8 (D-18): unused by `upsertTasksForSource` (no `ReminderSourceRow`
  // is ever produced with this kind -- `AppointmentReminderService` computes
  // its own ADVANCE/ON_DATE days independently, see reminder.service.ts's
  // file header). Present only so `WaReminderKind`-indexed lookups
  // (`reminder-task.service.ts`'s `upsertTasksForSource`) stay exhaustive
  // now that `WaReminderKind` has a fourth value.
  APPOINTMENT_REMINDER: 1,
} as const;

/**
 * D-03: bounded escalation on no-reply. After `maxAttempts` sends with no
 * owner reply, the thread is flagged "Needs action" (D-04) and no further
 * automated sends happen. Excludes `payment_reminder`, which is manual-only
 * (D-05) and never represented as a `WhatsAppReminderTask`.
 */
export const WA_ESCALATION = {
  maxAttempts: 2,
  intervalDays: 3,
} as const;

/** WHA-01: the daily reminder sweep fires once, coordinated via BullMQ's
 * `upsertJobScheduler` so N ECS tasks do not each run a duplicate sweep. */
export const WA_REMINDER_SWEEP_CRON = '0 30 8 * * *';
export const WA_REMINDER_SWEEP_TZ = 'Asia/Kolkata';

/**
 * D-14, D-16: simulator realism defaults. `autoReplyDelaySeconds` is long
 * enough that the Sent -> Delivered ladder is visible in a demo and short
 * enough that a walkthrough does not stall. `normalDeliverMs` / `delayedDeliverMs`
 * back the `NORMAL` / `DELAYED` deterministic delivery modes.
 */
export const WA_SIMULATOR_DEFAULTS = {
  autoReplyDelaySeconds: 10,
  normalDeliverMs: 2000,
  delayedDeliverMs: 60000,
} as const;

/**
 * UI-SPEC inbox filter chips, in display order with `all` selected by
 * default. Mirrors `INVOICE_LIST_FILTERS`' shape in `billing.constants.ts`.
 */
export const WA_INBOX_FILTERS: readonly WaInboxFilter[] = [
  'all',
  'invoices',
  'reminders',
  'bookings',
  'failed',
  'needs_action',
] as const;

/** Display labels for `WA_INBOX_FILTERS`, matching UI-SPEC copy verbatim. */
export const WA_INBOX_FILTER_LABELS: Readonly<Record<WaInboxFilter, string>> = {
  all: 'All',
  invoices: 'Invoices',
  reminders: 'Reminders',
  bookings: 'Bookings',
  failed: 'Failed',
  needs_action: 'Needs action',
} as const;

/**
 * WHA-03, D-06, D-09: the booking conversation transition table. Mirrors the
 * `isValidTransition` precedent in `queue-status.ts`. `MOVED` and `CANCELLED`
 * are terminal on this record — a staff Move creates a NEW `CONFIRMED` row
 * rather than transitioning the old one further (07-RESEARCH § Pattern 7).
 * There is deliberately no path back to `AWAITING_SLOT_CHOICE` or `CONFIRMED`
 * from any terminal state — reversing a cancellation or expiry is a new
 * booking request, not a transition.
 */
export const WA_BOOKING_TRANSITIONS: Readonly<Record<WaBookingState, readonly WaBookingState[]>> = {
  AWAITING_SLOT_CHOICE: ['CONFIRMED', 'EXPIRED'],
  CONFIRMED: ['MOVED', 'CANCELLED'],
  MOVED: [],
  CANCELLED: [],
  EXPIRED: [],
} as const;

export function isValidBookingTransition(from: WaBookingState, to: WaBookingState): boolean {
  return WA_BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

/** RFC 4122-shaped UUID, used to bound the inbound payload grammar below. */
const UUID_SEGMENT = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * D-09: the inbound button/keyword payload allowlist. Deliberately excludes
 * `booking:cancel:*` and `booking:move:*` — moving or cancelling a confirmed
 * booking is staff-only via authenticated API endpoints, never an owner
 * quick-reply, so those actions are not even expressible as an inbound
 * payload. This is the structural enforcement of D-09, not a runtime check
 * that could be bypassed by a crafted payload.
 *
 * D-21: `booking:pet:<uuid>` is also allowed — before offering slots, a
 * multi-pet owner is asked which pet the appointment is for, and their
 * reply is a row payload in this same `booking:<action>:<uuid>` shape.
 *
 * Phase 8 plan 08-10 Task 3 (D-15, D-16, D-33): `appointment:keep|move|
 * cancel:<uuid>` is the inbound payload namespace 07-RESEARCH already
 * reserved for the owner KEEP/MOVE/CANCEL bridge (unlike `booking:cancel|
 * move:*`, an *appointment* (not a provisional booking) IS ownable/
 * actionable by the owner directly — `OwnerActionService` enforces the
 * thread-owner check, not the absence of a payload grammar entry). Added by
 * Task 3, together with `InboundRouterService`'s new dispatch branch --
 * NOT by Task 1 (which only adds the template), so this stays paired with
 * the code that actually consumes it.
 */
export const WA_BUTTON_PAYLOAD_PATTERN = new RegExp(
  `^(?:book:start|STOP|BOOK|booking:(?:confirm|slot|pet):${UUID_SEGMENT}|appointment:(?:keep|move|cancel):${UUID_SEGMENT})$`,
);
