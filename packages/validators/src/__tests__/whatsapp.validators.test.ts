import { describe, it, expect } from 'vitest';
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
  webhookPayloadSchema,
  WA_TEMPLATE_VARIABLE_SCHEMAS,
} from '../whatsapp.js';
import { WA_TEMPLATE_KEYS } from '@breeyo/types';

// ─── sendTemplateSchema ───────────────────────────────────────────────────────

describe('sendTemplateSchema', () => {
  it('accepts a valid send-template request', () => {
    const result = sendTemplateSchema.safeParse({
      ownerId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      waPhone: '+919876543210',
      templateKey: 'follow_up_reminder',
      variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
      contextType: 'REMINDER',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown templateKey', () => {
    const result = sendTemplateSchema.safeParse({
      ownerId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      waPhone: '+919876543210',
      templateKey: 'random_template',
      variables: {},
      contextType: 'REMINDER',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a waPhone without a leading +', () => {
    const result = sendTemplateSchema.safeParse({
      ownerId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      waPhone: '919876543210',
      templateKey: 'follow_up_reminder',
      variables: {},
      contextType: 'REMINDER',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a staffNote longer than 500 characters', () => {
    const result = sendTemplateSchema.safeParse({
      ownerId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      waPhone: '+919876543210',
      templateKey: 'follow_up_reminder',
      variables: {},
      contextType: 'REMINDER',
      staffNote: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a staffNote at exactly 500 characters', () => {
    const result = sendTemplateSchema.safeParse({
      ownerId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      waPhone: '+919876543210',
      templateKey: 'follow_up_reminder',
      variables: {},
      contextType: 'REMINDER',
      staffNote: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });
});

// ─── WA_TEMPLATE_VARIABLE_SCHEMAS (WHA-02, D-18) ─────────────────────────────

describe('WA_TEMPLATE_VARIABLE_SCHEMAS', () => {
  it('has an entry for every WA_TEMPLATE_KEYS member', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(WA_TEMPLATE_VARIABLE_SCHEMAS[key]).toBeDefined();
    }
    expect(Object.keys(WA_TEMPLATE_VARIABLE_SCHEMAS)).toHaveLength(6);
  });

  it('invoice_delivery accepts the link-only variable set (D-18)', () => {
    const result = WA_TEMPLATE_VARIABLE_SCHEMAS.invoice_delivery.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      invoice_number: 'INV-202608-0001',
      amount: '₹1,200.00',
      payment_link: 'https://pay.example.com/abc',
    });
    expect(result.success).toBe(true);
  });

  it('invoice_delivery rejects a payload missing invoice_number', () => {
    const result = WA_TEMPLATE_VARIABLE_SCHEMAS.invoice_delivery.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      amount: '₹1,200.00',
      payment_link: 'https://pay.example.com/abc',
    });
    expect(result.success).toBe(false);
  });

  it('invoice_delivery rejects an owner_name of 300 characters', () => {
    const result = WA_TEMPLATE_VARIABLE_SCHEMAS.invoice_delivery.safeParse({
      owner_name: 'a'.repeat(300),
      pet_name: 'Rocky',
      invoice_number: 'INV-202608-0001',
      amount: '₹1,200.00',
      payment_link: 'https://pay.example.com/abc',
    });
    expect(result.success).toBe(false);
  });

  it('vaccine_due accepts its variable set and rejects a missing due_date', () => {
    const ok = WA_TEMPLATE_VARIABLE_SCHEMAS.vaccine_due.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      vaccine_name: 'Rabies',
      due_date: '17 Aug 2026',
    });
    expect(ok.success).toBe(true);

    const missing = WA_TEMPLATE_VARIABLE_SCHEMAS.vaccine_due.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      vaccine_name: 'Rabies',
    });
    expect(missing.success).toBe(false);
  });

  it('booking_confirmation accepts its variable set', () => {
    const result = WA_TEMPLATE_VARIABLE_SCHEMAS.booking_confirmation.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      slot_label: 'Thu 14 Aug, 10:30 AM',
      booking_reference: 'BK-202608-0001',
    });
    expect(result.success).toBe(true);
  });

  it('every string variable is length-capped (deworming_due rejects a 300-char due_date)', () => {
    const result = WA_TEMPLATE_VARIABLE_SCHEMAS.deworming_due.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      due_date: 'd'.repeat(300),
    });
    expect(result.success).toBe(false);
  });

  it('follow_up_reminder accepts an optional follow_up_reason', () => {
    const withReason = WA_TEMPLATE_VARIABLE_SCHEMAS.follow_up_reminder.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      follow_up_date: '14 Aug 2026',
      follow_up_reason: 'Recheck after medication',
    });
    expect(withReason.success).toBe(true);

    const withoutReason = WA_TEMPLATE_VARIABLE_SCHEMAS.follow_up_reminder.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      follow_up_date: '14 Aug 2026',
    });
    expect(withoutReason.success).toBe(true);
  });

  it('payment_reminder accepts its full variable set', () => {
    const result = WA_TEMPLATE_VARIABLE_SCHEMAS.payment_reminder.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      invoice_number: 'INV-202608-0001',
      amount: '₹1,200.00',
      due_date: '20 Aug 2026',
      payment_link: 'https://pay.example.com/abc',
    });
    expect(result.success).toBe(true);
  });
});

// ─── ownerPreferenceSchema (D-11) ─────────────────────────────────────────────

describe('ownerPreferenceSchema', () => {
  it('accepts a staff-initiated opt-out toggle', () => {
    const result = ownerPreferenceSchema.safeParse({ remindersOptedOut: true, source: 'STAFF' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown source', () => {
    const result = ownerPreferenceSchema.safeParse({ remindersOptedOut: true, source: 'ROBOT' });
    expect(result.success).toBe(false);
  });
});

// ─── clinicConfigSchema (D-14, D-16) ──────────────────────────────────────────

describe('clinicConfigSchema', () => {
  it('accepts a valid config with a bounded autoReplyDelaySeconds', () => {
    const result = clinicConfigSchema.safeParse({
      deliveryMode: 'INVALID_NUMBER',
      autoReplyEnabled: true,
      autoReplyDelaySeconds: 10,
      slotDurationMinutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it('rejects autoReplyDelaySeconds of 600 (bounded 3-60 per D-14)', () => {
    const result = clinicConfigSchema.safeParse({
      deliveryMode: 'NORMAL',
      autoReplyEnabled: true,
      autoReplyDelaySeconds: 600,
      slotDurationMinutes: 30,
    });
    expect(result.success).toBe(false);
  });
});

// ─── bookingCancelSchema (D-09) ───────────────────────────────────────────────

describe('bookingCancelSchema', () => {
  it('accepts a reason at or under 300 characters', () => {
    const result = bookingCancelSchema.safeParse({ reason: 'Owner requested a different date' });
    expect(result.success).toBe(true);
  });

  it('rejects a reason longer than 300 characters', () => {
    const result = bookingCancelSchema.safeParse({ reason: 'r'.repeat(301) });
    expect(result.success).toBe(false);
  });
});

// ─── inboxQuerySchema ──────────────────────────────────────────────────────────

describe('inboxQuerySchema', () => {
  it('defaults filter to all and limit to 25 when omitted', () => {
    const result = inboxQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filter).toBe('all');
      expect(result.data.limit).toBe(25);
    }
  });

  it('coerces a string limit to a number', () => {
    const result = inboxQuerySchema.safeParse({ limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it('caps limit at 50', () => {
    const result = inboxQuerySchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown filter chip', () => {
    const result = inboxQuerySchema.safeParse({ filter: 'archived' });
    expect(result.success).toBe(false);
  });
});

// ─── threadQuerySchema ─────────────────────────────────────────────────────────

describe('threadQuerySchema', () => {
  it('accepts an empty query with sensible defaults', () => {
    const result = threadQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('coerces limit and accepts a cursor', () => {
    const result = threadQuerySchema.safeParse({ limit: '20', cursor: 'abc123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });
});

// ─── retryMessageSchema ─────────────────────────────────────────────────────────

describe('retryMessageSchema', () => {
  it('accepts a uuid messageId', () => {
    const result = retryMessageSchema.safeParse({
      messageId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid messageId', () => {
    const result = retryMessageSchema.safeParse({ messageId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

// ─── consentSchema (D-12) ───────────────────────────────────────────────────────

describe('consentSchema', () => {
  it('accepts a grant action with a purposeText', () => {
    const result = consentSchema.safeParse({
      action: 'grant',
      purposeText: 'WhatsApp reminders and invoice delivery',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown action', () => {
    const result = consentSchema.safeParse({ action: 'revoke', purposeText: 'x' });
    expect(result.success).toBe(false);
  });
});

// ─── bookingMoveSchema (D-09) ───────────────────────────────────────────────────

describe('bookingMoveSchema', () => {
  it('accepts a valid slot move', () => {
    const result = bookingMoveSchema.safeParse({
      slotDate: '2026-08-20',
      slotStartMinutes: 630,
      slotDurationMinutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it('rejects slotStartMinutes outside 0-1439', () => {
    const result = bookingMoveSchema.safeParse({
      slotDate: '2026-08-20',
      slotStartMinutes: 1440,
      slotDurationMinutes: 30,
    });
    expect(result.success).toBe(false);
  });
});

// ─── webhookPayloadSchema ────────────────────────────────────────────────────────

describe('webhookPayloadSchema', () => {
  it('accepts a minimal Meta-shaped envelope', () => {
    const result = webhookPayloadSchema.safeParse({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [{ field: 'messages', value: { messaging_product: 'whatsapp' } }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload with no entry array', () => {
    const result = webhookPayloadSchema.safeParse({ object: 'whatsapp_business_account' });
    expect(result.success).toBe(false);
  });
});
