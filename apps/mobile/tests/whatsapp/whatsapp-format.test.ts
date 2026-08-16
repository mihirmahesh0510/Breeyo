import { describe, it, expect } from 'vitest';
import {
  statusToVariant,
  statusLabel,
  formatMessageTime,
  formatThreadTimestamp,
  truncatePreview,
  contextTypeLabel,
  inboxFilterLabel,
  failureCopy,
  bubbleAccessibilityLabel,
  WA_COLORS,
} from '../../src/features/whatsapp/utils/whatsapp-format';

describe('statusToVariant', () => {
  it("maps DELIVERED to 'delivered' (green #2E7D32)", () => {
    expect(statusToVariant('DELIVERED')).toBe('delivered');
    expect(WA_COLORS.delivered).toBe('#2E7D32');
  });

  it("maps QUEUED to a variant colored orange #E65100", () => {
    const variant = statusToVariant('QUEUED');
    expect(variant).toBe('queued');
    expect(WA_COLORS.queued).toBe('#E65100');
  });

  it("maps FAILED to a variant colored red #BA1A1A", () => {
    const variant = statusToVariant('FAILED');
    expect(variant).toBe('failed');
    expect(WA_COLORS.failed).toBe('#BA1A1A');
  });
});

describe('statusLabel', () => {
  it('returns exactly the five UI-SPEC labels', () => {
    expect(statusLabel('QUEUED')).toBe('Queued');
    expect(statusLabel('SENT')).toBe('Sent');
    expect(statusLabel('DELIVERED')).toBe('Delivered');
    expect(statusLabel('FAILED')).toBe('Failed');
    expect(statusLabel('REPLIED')).toBe('Replied');
  });

  it('folds READ into Delivered because UI-SPEC exposes five labels only', () => {
    expect(statusLabel('READ')).toBe('Delivered');
  });
});

describe('formatMessageTime', () => {
  it('returns an en-IN 12-hour string containing a colon and AM/PM', () => {
    const result = formatMessageTime(new Date('2026-08-12T05:00:00Z'));
    expect(result).toContain(':');
    expect(result.includes('AM') || result.includes('PM')).toBe(true);
  });
});

describe('formatThreadTimestamp', () => {
  it('returns a time string for a timestamp earlier today', () => {
    const now = new Date();
    const earlierToday = new Date(now);
    earlierToday.setHours(0, 30, 0, 0);
    // Guard against midnight-rollover flakiness in this test itself.
    if (earlierToday.getTime() > now.getTime()) {
      earlierToday.setTime(now.getTime());
    }
    const result = formatThreadTimestamp(earlierToday);
    expect(result).toContain(':');
  });

  it('returns "Yesterday" for a timestamp from yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatThreadTimestamp(yesterday)).toBe('Yesterday');
  });

  it('returns a short en-IN date for an older timestamp', () => {
    const older = new Date();
    older.setDate(older.getDate() - 10);
    const result = formatThreadTimestamp(older);
    expect(result).not.toBe('Yesterday');
    expect(result).not.toContain(':');
  });
});

describe('truncatePreview', () => {
  it('caps a long preview at 80 characters ending with an ellipsis', () => {
    const result = truncatePreview('a'.repeat(200));
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith('…')).toBe(true);
  });

  it("returns 'No messages yet' for an empty preview (UI-SPEC empty-preview state)", () => {
    expect(truncatePreview('')).toBe('No messages yet');
  });

  it('returns short previews unchanged', () => {
    expect(truncatePreview('Hi there')).toBe('Hi there');
  });
});

describe('contextTypeLabel', () => {
  it('maps every UI-SPEC context type to its label', () => {
    expect(contextTypeLabel('INVOICE')).toBe('Invoice');
    expect(contextTypeLabel('REMINDER')).toBe('Reminder');
    expect(contextTypeLabel('BOOKING')).toBe('Booking');
    expect(contextTypeLabel('DOCUMENT')).toBe('Document');
    expect(contextTypeLabel('NONE')).toBe('');
  });

  it('returns an empty string for null/undefined context', () => {
    expect(contextTypeLabel(null)).toBe('');
    expect(contextTypeLabel(undefined)).toBe('');
  });
});

describe('inboxFilterLabel', () => {
  it('returns exactly the six UI-SPEC filter chip labels', () => {
    expect(inboxFilterLabel('all')).toBe('All');
    expect(inboxFilterLabel('invoices')).toBe('Invoices');
    expect(inboxFilterLabel('reminders')).toBe('Reminders');
    expect(inboxFilterLabel('bookings')).toBe('Bookings');
    expect(inboxFilterLabel('failed')).toBe('Failed');
    expect(inboxFilterLabel('needs_action')).toBe('Needs action');
  });
});

describe('failureCopy', () => {
  it('maps NOT_ON_WHATSAPP to the exact UI-SPEC invalid-number copy', () => {
    expect(failureCopy('NOT_ON_WHATSAPP')).toBe(
      'This mobile number may not be on WhatsApp. Correct the number before retrying.',
    );
  });

  it('maps PROVIDER_UNAVAILABLE to the generic UI-SPEC failure copy', () => {
    expect(failureCopy('PROVIDER_UNAVAILABLE')).toBe(
      'Message failed. Check the reason and retry when ready.',
    );
  });

  it('falls back to the generic failure copy for any unmapped or null code, never undefined', () => {
    expect(failureCopy('UNKNOWN')).toBe(
      'Message failed. Check the reason and retry when ready.',
    );
    expect(failureCopy(null)).toBe(
      'Message failed. Check the reason and retry when ready.',
    );
    expect(failureCopy(undefined)).toBe(
      'Message failed. Check the reason and retry when ready.',
    );
  });
});

describe('bubbleAccessibilityLabel', () => {
  it('composes direction, time, status and context into one screen-reader label', () => {
    const createdAt = new Date('2026-08-12T05:00:00Z');
    const label = bubbleAccessibilityLabel({
      direction: 'OUTBOUND',
      body: 'Reminder text',
      status: 'DELIVERED',
      createdAt,
      contextType: 'REMINDER',
    });

    expect(label).toContain('Sent');
    expect(label).toContain(formatMessageTime(createdAt));
    expect(label).toContain('Delivered');
    expect(label).toContain('Reminder');
  });
});
