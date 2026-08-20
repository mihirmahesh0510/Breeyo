/**
 * Shared WhatsApp domain vocabulary (WHA-04).
 *
 * Plain types only — no Zod, no runtime values, `Date` for timestamps —
 * mirroring `packages/types/src/queue.ts`. Both `@breeyo/api` and the mobile
 * app import from here so they speak the same language.
 *
 * Anti-Pattern A1: no provider-specific (Meta Cloud API) JSON shape may
 * appear in this file. The on-the-wire vocabulary of the real provider lives
 * only inside the API's provider adapters (`apps/api/src/modules/whatsapp/
 * providers/`) and is translated into these domain types at the boundary, so
 * swapping the simulator for the real API is configuration, not a rewrite.
 */

/** Which adapter backs the `WaProvider` port for a clinic. */
export type WaProviderId = 'simulator' | 'cloud-api';

/**
 * The Beta message templates (WHA-04, D-10). `appointment_reminder` is
 * Phase 8's addition (D-17, D-18) to Phase 7's existing template set --
 * added here rather than in a new file, per D-17's ban on a parallel
 * messaging mechanism. `owner_portal_link` is Phase 9's addition (09-05
 * Task 2, OWN-04, D-67, D-82): the owner-portal magic-link reissue flow
 * delegates to this SAME template pipeline rather than inventing a second
 * one, and this is the template key it sends.
 */
export type WaTemplateKey =
  | 'invoice_delivery'
  | 'payment_reminder'
  | 'follow_up_reminder'
  | 'vaccine_due'
  | 'deworming_due'
  | 'booking_confirmation'
  | 'appointment_reminder'
  | 'owner_portal_link';

/** D-10: reminder-category templates are STOP-silenceable; transactional are not. */
export type WaTemplateCategory = 'REMINDER' | 'TRANSACTIONAL';

/** D-16: the channel label a message row was actually sent through. */
export type WaChannel = 'SIMULATOR' | 'CLOUD_API';

export type WaDirection = 'OUTBOUND' | 'INBOUND';

/**
 * WHA-05: the append-only status ladder. `FAILED` is terminal-by-precedence
 * (never downgraded, never upgraded except via an explicit staff Retry that
 * creates a new message row — see WA_STATUS_RANK for the monotonic ranks
 * of the non-terminal statuses).
 */
export type WaDeliveryStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'REPLIED';

/** D-16: whether the owner's number is known-valid, known-invalid, or unchecked. */
export type WaNumberStatus = 'UNKNOWN' | 'VALID' | 'INVALID';

/** What a thread's most recent activity, or a message's send, was about. */
export type WaContextType = 'REMINDER' | 'INVOICE' | 'BOOKING' | 'GENERAL';

/** D-01, D-02, D-17, D-18: the four automated reminder sources. Deliberately
 * excludes payment reminders (D-05 manual-only) so a payment reminder is not
 * even representable as a `WhatsAppReminderTask`. `APPOINTMENT_REMINDER` is
 * Phase 8's addition, riding this same enum/table/pipeline. */
export type WaReminderKind = 'FOLLOW_UP' | 'VACCINE_DUE' | 'DEWORMING_DUE' | 'APPOINTMENT_REMINDER';

/** D-01, D-02: the "before" and "on the date" two-touch reminder pattern. */
export type WaReminderTouch = 'ADVANCE' | 'ON_DATE';

/** D-03, D-04: bounded escalation state machine for automated reminders. */
export type WaReminderState = 'PENDING' | 'SENT' | 'REPLIED' | 'CAPPED_NEEDS_ACTION' | 'CANCELLED';

/** WHA-03, D-06, D-09: the booking conversation state machine. */
export type WaBookingState = 'AWAITING_SLOT_CHOICE' | 'CONFIRMED' | 'MOVED' | 'CANCELLED' | 'EXPIRED';

/** D-16: the simulator's deterministic global delivery-behavior toggle. */
export type WaDeliveryMode = 'NORMAL' | 'DELAYED' | 'FAIL' | 'INVALID_NUMBER';

/**
 * Normalized failure codes (WHA-04). Every Meta Cloud API error code is
 * mapped down to one of these at the provider adapter boundary — callers
 * never see a raw Meta error code.
 */
export type WaFailureCode =
  | 'NOT_ON_WHATSAPP'
  | 'INVALID_NUMBER_FORMAT'
  | 'OUTSIDE_SERVICE_WINDOW'
  | 'TEMPLATE_NOT_AVAILABLE'
  | 'TEMPLATE_PARAM_MISMATCH'
  | 'RATE_LIMITED'
  | 'SUPPRESSED_BY_META'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN';

/**
 * A provider's declared constraints, expressed as data rather than an
 * identity switch. Application code reads capabilities and adapts; it never
 * branches on `provider.id === 'simulator'`. The simulator declares the SAME
 * constraints as the real Cloud API in Beta so the template registry and
 * send path are exercised against real limits before any real traffic flows.
 */
export interface WaCapabilities {
  /** Cloud API: true. Simulator MUST also be true in Beta. */
  requiresTemplateOutsideServiceWindow: boolean;
  /** Cloud API: 24. */
  serviceWindowHours: number | null;
  /** Cloud API: templates must be pre-registered/approved. */
  requiresRegisteredTemplates: boolean;
  maxQuickReplyButtons: number;
  maxButtonTitleChars: number;
  maxListRows: number;
  maxListRowTitleChars: number;
  maxBodyChars: number;
  supportsInteractiveList: boolean;
  mediaMaxBytes: number;
  /** Media must be uploaded to the provider before it can be referenced. */
  mediaRequiresUpload: boolean;
}

/** A WhatsApp interactive reply button — max 20-char title, 256-char id on Cloud API. */
export interface WaButtonSpec {
  id: string;
  title: string;
}

/** A row in a WhatsApp interactive list message — max 24-char title on Cloud API. */
export interface WaListRow {
  id: string;
  title: string;
  description?: string;
}

/** A single bookable clinic-hours slot offered to an owner (WHA-03). */
export interface WaSlotOption {
  slotDate: string;
  slotStartMinutes: number;
  slotDurationMinutes: number;
  label: string;
}

/** Mobile inbox row (WHA-05). */
export interface WhatsAppThreadSummary {
  id: string;
  clinicId: string;
  ownerId: string;
  ownerName: string;
  waPhone: string;
  numberStatus: WaNumberStatus;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastContextType: WaContextType | null;
  unreadCount: number;
  /** D-04: set when a reminder's escalation cap is reached with no reply. */
  needsAction: boolean;
  needsActionReason: string | null;
}

/** Thread detail read model, joined with owner and pet context. */
export interface WhatsAppThreadWithOwner extends WhatsAppThreadSummary {
  owner: {
    id: string;
    name: string;
    mobile: string;
  };
  pets: { id: string; name: string; species: string }[];
}

/** A single rendered message bubble in a thread (WHA-05). */
export interface WhatsAppMessageView {
  id: string;
  direction: WaDirection;
  channel: WaChannel;
  templateKey: WaTemplateKey | null;
  templateCategory: WaTemplateCategory | null;
  body: string;
  status: WaDeliveryStatus;
  failureCode: WaFailureCode | null;
  failureReason: string | null;
  contextType: WaContextType | null;
  contextId: string | null;
  interactiveOptions: (WaButtonSpec | WaListRow)[] | null;
  mediaFilename: string | null;
  staffNote: string | null;
  sentByUserId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
}

/** UI-SPEC inbox filter chip values. */
export type WaInboxFilter = 'all' | 'invoices' | 'reminders' | 'bookings' | 'failed' | 'needs_action';

/** Paginated inbox response. */
export interface WhatsAppInbox {
  threads: WhatsAppThreadSummary[];
  nextCursor: string | null;
}

/** `POST /whatsapp/send` request body (WHA-02, WHA-03, WHA-05). */
export interface SendTemplateInput {
  ownerId: string;
  waPhone: string;
  templateKey: WaTemplateKey;
  variables: Record<string, string>;
  contextType: WaContextType;
  contextId?: string;
  petId?: string;
  staffNote?: string;
}

/** D-11: single global per-owner reminder opt-out toggle. */
export interface OwnerPreferenceInput {
  remindersOptedOut: boolean;
  source: 'OWNER_STOP' | 'STAFF';
  numberStatus?: WaNumberStatus;
}

/** D-09: staff-only booking move. */
export interface BookingMoveInput {
  slotDate: string;
  slotStartMinutes: number;
  slotDurationMinutes: number;
}

/** D-09: staff-only booking cancel; UI-SPEC saves the reason to the thread. */
export interface BookingCancelInput {
  reason: string;
}

/** D-16: per-clinic simulator/provider configuration. */
export interface ClinicConfigInput {
  provider: WaProviderId;
  deliveryMode: WaDeliveryMode;
  autoReplyEnabled: boolean;
  autoReplyDelaySeconds: number;
  allowFreeformOutsideWindow: boolean;
  slotDurationMinutes: number;
}
