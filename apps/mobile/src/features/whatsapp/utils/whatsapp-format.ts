import { WA_INBOX_FILTER_LABELS } from '@breeyo/types';
import type {
  WaContextType,
  WaDeliveryStatus,
  WaDirection,
  WaFailureCode,
  WaInboxFilter,
} from '@breeyo/types';

/**
 * WHA-05 / D-04, D-16: every presentation decision for the WhatsApp staff
 * surfaces lives here as a pure function, because `apps/mobile/vitest.config.ts`
 * runs with `environment: 'node'` and no React Native renderer -- components
 * cannot be unit-tested, so all decision logic is pushed into this tested
 * module and components stay declarative (07-06-PLAN.md objective).
 */

/** The five badge variants a message status can render as (UI-SPEC Component Inventory). */
export type WaStatusVariant = 'queued' | 'sent' | 'delivered' | 'failed' | 'replied';

/**
 * WHA-05 / UI-SPEC Color: the phase's palette as named constants, so no
 * component hardcodes a hex twice. Keys match the plan's artifact contract
 * exactly (delivered/queued/failed/needsAction/outgoingBubble/incomingBubble/background).
 */
export const WA_COLORS = {
  /** Primary green -- delivered/success status, outgoing bubbles, primary CTAs, active filter chip. */
  delivered: '#2E7D32',
  /** Orange -- queued/pending badge, delayed delivery, needs-action dot (shares the accent with needsAction). */
  queued: '#E65100',
  /** Destructive red -- failed status, invalid number, opt-out, cancel booking. */
  failed: '#BA1A1A',
  /** Orange -- unread/needs-action dot and pill (D-04). */
  needsAction: '#E65100',
  /** Secondary green-tinted surface for outgoing (staff/system) bubbles. */
  outgoingBubble: '#C8E6C9',
  /** Secondary surface for incoming (simulated owner) bubbles. */
  incomingBubble: '#F5F0EB',
  /** Dominant warm-white screen/thread background. */
  background: '#FFFBF5',
  /** Neutral for the in-flight "Sent" status (no dedicated UI-SPEC accent). */
  sent: '#5D4037',
  /** Green -- a replied thread has progressed successfully. */
  replied: '#2E7D32',
} as const;

const STATUS_VARIANT_MAP: Record<WaDeliveryStatus, WaStatusVariant> = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'delivered',
  FAILED: 'failed',
  REPLIED: 'replied',
};

/**
 * WHA-05: maps a delivery status to its badge variant/color key.
 * `statusToVariant('DELIVERED') === 'delivered'` (green #2E7D32),
 * `statusToVariant('QUEUED') === 'queued'` (orange #E65100),
 * `statusToVariant('FAILED') === 'failed'` (red #BA1A1A).
 */
export function statusToVariant(status: WaDeliveryStatus): WaStatusVariant {
  return STATUS_VARIANT_MAP[status];
}

const STATUS_LABEL_MAP: Record<WaDeliveryStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Delivered',
  FAILED: 'Failed',
  REPLIED: 'Replied',
};

/**
 * WHA-05 / UI-SPEC Accessibility Contract: "Status must never rely on color
 * alone; pair color with text and icon." Returns exactly the five UI-SPEC
 * labels -- READ folds into 'Delivered' because UI-SPEC exposes five labels only.
 */
export function statusLabel(status: WaDeliveryStatus): string {
  return STATUS_LABEL_MAP[status];
}

/**
 * WHA-05: en-IN 12-hour message timestamp, copying the `formatTime` idiom
 * from `QueueCardItem.tsx:1093-1096`.
 */
export function formatMessageTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatted = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  // Node's ICU renders the en-IN meridiem lowercase ("10:30 am"); normalize
  // to uppercase so the displayed string is stable across the Vitest `node`
  // environment and the on-device Hermes/JSC Intl implementation.
  return formatted.replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM');
}

/**
 * WHA-05 / UI-SPEC Inbox interaction contract: a thread row's timestamp is a
 * time for today, 'Yesterday' for yesterday, and a short en-IN date otherwise.
 */
export function formatThreadTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);

  if (diffDays <= 0) return formatMessageTime(d);
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const PREVIEW_MAX_CHARS = 80;

/**
 * WHA-05 / UI-SPEC ThreadListItem empty-preview state: caps a preview at 80
 * characters ending with an ellipsis, and returns the UI-SPEC empty-state
 * string for a blank preview so an unbounded/blank string cannot break the
 * inbox layout (T-07-06-05).
 */
export function truncatePreview(preview: string | null | undefined): string {
  if (!preview) return 'No messages yet';
  if (preview.length <= PREVIEW_MAX_CHARS) return preview;
  return `${preview.slice(0, PREVIEW_MAX_CHARS - 1)}…`;
}

/** Superset of `WaContextType` accepted by `contextTypeLabel`: forward-compatible
 * with the UI-SPEC's document context card and the explicit "no context" case. */
export type WaContextLabelInput = WaContextType | 'DOCUMENT' | 'NONE';

const CONTEXT_TYPE_LABEL_MAP: Record<WaContextLabelInput, string> = {
  INVOICE: 'Invoice',
  REMINDER: 'Reminder',
  BOOKING: 'Booking',
  DOCUMENT: 'Document',
  GENERAL: '',
  NONE: '',
};

/**
 * WHA-05 / UI-SPEC Interaction Contract: "Context cards appear inline inside
 * the thread for invoice, pet, reminder, booking, and document references."
 * Returns '' for GENERAL/NONE/null/undefined so no inline chip is rendered
 * for messages without a specific context.
 */
export function contextTypeLabel(contextType: WaContextLabelInput | null | undefined): string {
  if (!contextType) return '';
  return CONTEXT_TYPE_LABEL_MAP[contextType] ?? '';
}

/**
 * WHA-05: exact UI-SPEC filter chip labels for the six `WA_INBOX_FILTERS`
 * entries, delegating to the shared `WA_INBOX_FILTER_LABELS` constant so the
 * mobile UI and any future server-rendered surface cannot drift.
 */
export function inboxFilterLabel(filter: WaInboxFilter): string {
  return WA_INBOX_FILTER_LABELS[filter];
}

const NOT_ON_WHATSAPP_COPY =
  'This mobile number may not be on WhatsApp. Correct the number before retrying.';
const GENERIC_FAILURE_COPY = 'Message failed. Check the reason and retry when ready.';

/**
 * WHA-05 / T-07-06-04 (Repudiation): maps a normalized `WaFailureCode` to its
 * exact UI-SPEC inline failure copy, with a TOTAL fallback so no code
 * path -- including an unmapped or null/undefined code -- can render
 * `undefined` and make a failed message look like it succeeded.
 */
export function failureCopy(code: WaFailureCode | null | undefined): string {
  if (code === 'NOT_ON_WHATSAPP') return NOT_ON_WHATSAPP_COPY;
  return GENERIC_FAILURE_COPY;
}

export interface BubbleAccessibilityInput {
  direction: WaDirection;
  body: string;
  status: WaDeliveryStatus;
  createdAt: Date | string;
  contextType?: WaContextLabelInput | null;
}

/**
 * WHA-05 / UI-SPEC Accessibility Contract: "Message bubbles expose screen
 * reader labels: direction, sender, time, status, and attachment/context."
 * Composes direction + time + status + context into one label.
 */
export function bubbleAccessibilityLabel(input: BubbleAccessibilityInput): string {
  const directionWord = input.direction === 'OUTBOUND' ? 'Sent' : 'Received';
  const time = formatMessageTime(input.createdAt);
  const status = statusLabel(input.status);
  const context = contextTypeLabel(input.contextType);

  const parts = [`${directionWord} ${time}`, status];
  if (context) parts.push(context);
  return parts.join(', ');
}
