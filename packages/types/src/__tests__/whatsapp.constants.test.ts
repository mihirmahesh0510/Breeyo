import { describe, it, expect } from 'vitest';
import {
  WA_TEMPLATE_KEYS,
  WA_TEMPLATE_STAFF_NAMES,
  WA_TEMPLATE_CATEGORIES,
  WA_CAPABILITY_LIMITS,
  WA_STATUS_RANK,
  WA_REMINDER_LEAD_DAYS,
  WA_ESCALATION,
  WA_BOOKING_TRANSITIONS,
  isValidBookingTransition,
  WA_INBOX_FILTERS,
  WA_BUTTON_PAYLOAD_PATTERN,
} from '../constants/whatsapp.constants.js';
import { SOCKET_EVENTS } from '../constants/socket-events.js';

// ─── WA_TEMPLATE_KEYS (WHA-04) ───────────────────────────────────────────────

describe('WA_TEMPLATE_KEYS', () => {
  it('has exactly the six Beta template keys', () => {
    expect(WA_TEMPLATE_KEYS).toEqual([
      'invoice_delivery',
      'payment_reminder',
      'follow_up_reminder',
      'vaccine_due',
      'deworming_due',
      'booking_confirmation',
    ]);
    expect(WA_TEMPLATE_KEYS).toHaveLength(6);
  });
});

// ─── WA_TEMPLATE_STAFF_NAMES — exact UI-SPEC strings ─────────────────────────

describe('WA_TEMPLATE_STAFF_NAMES', () => {
  it('maps every key to its exact UI-SPEC staff-facing name', () => {
    expect(WA_TEMPLATE_STAFF_NAMES).toEqual({
      invoice_delivery: 'Invoice delivery',
      payment_reminder: 'Payment reminder',
      follow_up_reminder: 'Follow-up reminder',
      vaccine_due: 'Vaccine due',
      deworming_due: 'Deworming due',
      booking_confirmation: 'Booking confirmation',
    });
  });

  it('has an entry for every WA_TEMPLATE_KEYS member', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(typeof WA_TEMPLATE_STAFF_NAMES[key]).toBe('string');
    }
  });
});

// ─── WA_TEMPLATE_CATEGORIES — D-10 split ─────────────────────────────────────

describe('WA_TEMPLATE_CATEGORIES — D-10', () => {
  it('marks invoice_delivery and booking_confirmation as TRANSACTIONAL', () => {
    expect(WA_TEMPLATE_CATEGORIES.invoice_delivery).toBe('TRANSACTIONAL');
    expect(WA_TEMPLATE_CATEGORIES.booking_confirmation).toBe('TRANSACTIONAL');
  });

  it('marks payment_reminder, follow_up_reminder, vaccine_due and deworming_due as REMINDER', () => {
    expect(WA_TEMPLATE_CATEGORIES.payment_reminder).toBe('REMINDER');
    expect(WA_TEMPLATE_CATEGORIES.follow_up_reminder).toBe('REMINDER');
    expect(WA_TEMPLATE_CATEGORIES.vaccine_due).toBe('REMINDER');
    expect(WA_TEMPLATE_CATEGORIES.deworming_due).toBe('REMINDER');
  });
});

// ─── WA_CAPABILITY_LIMITS — real Cloud API limits (WHA-04) ───────────────────

describe('WA_CAPABILITY_LIMITS', () => {
  it('equals the exact Cloud API hard limits', () => {
    expect(WA_CAPABILITY_LIMITS).toEqual({
      maxQuickReplyButtons: 3,
      maxButtonTitleChars: 20,
      maxListRows: 10,
      maxListRowTitleChars: 24,
      maxListRowIdChars: 200,
      maxButtonIdChars: 256,
      maxInteractiveBodyChars: 1024,
      maxTextBodyChars: 4096,
      serviceWindowHours: 24,
      mediaMaxBytes: 104857600,
    });
  });
});

// ─── WA_STATUS_RANK — monotonic status application (WHA-05) ─────────────────

describe('WA_STATUS_RANK', () => {
  it('ranks QUEUED < SENT < DELIVERED < READ < REPLIED', () => {
    expect(WA_STATUS_RANK.QUEUED).toBeLessThan(WA_STATUS_RANK.SENT);
    expect(WA_STATUS_RANK.SENT).toBeLessThan(WA_STATUS_RANK.DELIVERED);
    expect(WA_STATUS_RANK.DELIVERED).toBeLessThan(WA_STATUS_RANK.READ);
    expect(WA_STATUS_RANK.READ).toBeLessThan(WA_STATUS_RANK.REPLIED);
  });
});

// ─── WA_REMINDER_LEAD_DAYS / WA_ESCALATION (D-01, D-02, D-03) ────────────────

describe('WA_REMINDER_LEAD_DAYS — D-01, D-02', () => {
  it('equals { FOLLOW_UP: 1, VACCINE_DUE: 3, DEWORMING_DUE: 3 }', () => {
    expect(WA_REMINDER_LEAD_DAYS).toEqual({
      FOLLOW_UP: 1,
      VACCINE_DUE: 3,
      DEWORMING_DUE: 3,
    });
  });
});

describe('WA_ESCALATION — D-03', () => {
  it('equals { maxAttempts: 2, intervalDays: 3 }', () => {
    expect(WA_ESCALATION).toEqual({ maxAttempts: 2, intervalDays: 3 });
  });
});

// ─── WA_BOOKING_TRANSITIONS / isValidBookingTransition (D-06, D-09) ──────────

describe('isValidBookingTransition — D-06 auto-confirm', () => {
  it('permits AWAITING_SLOT_CHOICE -> CONFIRMED', () => {
    expect(isValidBookingTransition('AWAITING_SLOT_CHOICE', 'CONFIRMED')).toBe(true);
  });
});

describe('isValidBookingTransition — D-09 staff-only move/cancel', () => {
  it('permits CONFIRMED -> CANCELLED and CONFIRMED -> MOVED', () => {
    expect(isValidBookingTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(isValidBookingTransition('CONFIRMED', 'MOVED')).toBe(true);
  });
});

describe('isValidBookingTransition — no reverse transitions', () => {
  it('rejects CANCELLED -> CONFIRMED and EXPIRED -> CONFIRMED', () => {
    expect(isValidBookingTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(isValidBookingTransition('EXPIRED', 'CONFIRMED')).toBe(false);
  });

  it('declares CANCELLED, MOVED and EXPIRED as terminal (no outgoing transitions)', () => {
    expect(WA_BOOKING_TRANSITIONS.CANCELLED).toEqual([]);
    expect(WA_BOOKING_TRANSITIONS.MOVED).toEqual([]);
    expect(WA_BOOKING_TRANSITIONS.EXPIRED).toEqual([]);
  });
});

// ─── WA_INBOX_FILTERS — UI-SPEC chips ────────────────────────────────────────

describe('WA_INBOX_FILTERS', () => {
  it('has exactly the six UI-SPEC filter chips', () => {
    expect(WA_INBOX_FILTERS).toEqual([
      'all',
      'invoices',
      'reminders',
      'bookings',
      'failed',
      'needs_action',
    ]);
    expect(WA_INBOX_FILTERS).toHaveLength(6);
  });
});

// ─── WA_BUTTON_PAYLOAD_PATTERN — D-09 structural enforcement ─────────────────

describe('WA_BUTTON_PAYLOAD_PATTERN — D-09', () => {
  it('matches a well-formed booking:confirm:<uuid> payload', () => {
    expect(
      WA_BUTTON_PAYLOAD_PATTERN.test('booking:confirm:3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    ).toBe(true);
  });

  it('matches a well-formed booking:slot:<uuid> payload', () => {
    expect(
      WA_BUTTON_PAYLOAD_PATTERN.test('booking:slot:3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    ).toBe(true);
  });

  it('matches a well-formed booking:pet:<uuid> payload (D-21 pet selection)', () => {
    expect(
      WA_BUTTON_PAYLOAD_PATTERN.test('booking:pet:3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    ).toBe(true);
  });

  it('matches the bare book:start / STOP / BOOK keywords', () => {
    expect(WA_BUTTON_PAYLOAD_PATTERN.test('book:start')).toBe(true);
    expect(WA_BUTTON_PAYLOAD_PATTERN.test('STOP')).toBe(true);
    expect(WA_BUTTON_PAYLOAD_PATTERN.test('BOOK')).toBe(true);
  });

  it('does NOT match booking:cancel:<uuid> — cancel is not a registered inbound payload', () => {
    expect(
      WA_BUTTON_PAYLOAD_PATTERN.test('booking:cancel:3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    ).toBe(false);
  });

  it('does NOT match booking:move:<uuid> — move is not a registered inbound payload', () => {
    expect(
      WA_BUTTON_PAYLOAD_PATTERN.test('booking:move:3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    ).toBe(false);
  });
});

// ─── SOCKET_EVENTS — additive extension ──────────────────────────────────────

describe('SOCKET_EVENTS — Phase 7 additions', () => {
  it('retains QUEUE_UPDATED unchanged', () => {
    expect(SOCKET_EVENTS.QUEUE_UPDATED).toBe('queue:updated');
  });

  it('adds the three WhatsApp events with the exact values', () => {
    expect(SOCKET_EVENTS.WHATSAPP_MESSAGE_CREATED).toBe('whatsapp:message-created');
    expect(SOCKET_EVENTS.WHATSAPP_MESSAGE_STATUS_CHANGED).toBe('whatsapp:message-status-changed');
    expect(SOCKET_EVENTS.WHATSAPP_THREAD_UPDATED).toBe('whatsapp:thread-updated');
  });
});
