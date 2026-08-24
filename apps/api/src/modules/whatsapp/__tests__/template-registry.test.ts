import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  WA_TEMPLATE_KEYS,
  WA_TEMPLATE_STAFF_NAMES,
  WA_TEMPLATE_CATEGORIES,
  WA_CAPABILITY_LIMITS,
  type WaTemplateKey,
  type WaReminderKind,
} from '@breeyo/types';
import {
  WA_TEMPLATES,
  WA_REMINDER_KIND_TO_TEMPLATE,
  getTemplate,
  renderTemplate,
} from '../template-registry.js';

describe('template-registry (WHA-02/WHA-05, D-05, D-10, D-18, D-23)', () => {
  it('has exactly eight entries, one per WA_TEMPLATE_KEYS value (Phase 8 adds appointment_reminder D-17/D-18; Phase 9 adds owner_portal_link OWN-04/D-67/D-82)', () => {
    const keys = Object.keys(WA_TEMPLATES);
    expect(keys).toHaveLength(8);
    for (const key of WA_TEMPLATE_KEYS) {
      expect(WA_TEMPLATES[key]).toBeDefined();
      expect(WA_TEMPLATES[key].key).toBe(key);
    }
  });

  it("each entry's staffName equals the corresponding WA_TEMPLATE_STAFF_NAMES value exactly", () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(WA_TEMPLATES[key].staffName).toBe(WA_TEMPLATE_STAFF_NAMES[key]);
    }
    // Exact strings locked by UI-SPEC — regression guard beyond the loop above.
    expect(WA_TEMPLATES.invoice_delivery.staffName).toBe('Invoice delivery');
    expect(WA_TEMPLATES.payment_reminder.staffName).toBe('Payment reminder');
    expect(WA_TEMPLATES.follow_up_reminder.staffName).toBe('Follow-up reminder');
    expect(WA_TEMPLATES.vaccine_due.staffName).toBe('Vaccine due');
    expect(WA_TEMPLATES.deworming_due.staffName).toBe('Deworming due');
    expect(WA_TEMPLATES.booking_confirmation.staffName).toBe('Booking confirmation');
    expect(WA_TEMPLATES.appointment_reminder.staffName).toBe('Appointment reminder');
    expect(WA_TEMPLATES.owner_portal_link.staffName).toBe('Owner portal link');
  });

  it("each entry's category equals the corresponding WA_TEMPLATE_CATEGORIES value (D-10)", () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(WA_TEMPLATES[key].category).toBe(WA_TEMPLATE_CATEGORIES[key]);
    }
  });

  it('each entry has cloud metadata with a name, languageCode "en" and metaCategory UTILITY for every template', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      const def = WA_TEMPLATES[key];
      expect(typeof def.cloud.name).toBe('string');
      expect(def.cloud.name.length).toBeGreaterThan(0);
      expect(def.cloud.languageCode).toBe('en');
      expect(def.cloud.metaCategory).toBe('UTILITY');
    }
  });

  describe('getTemplate', () => {
    it("getTemplate('vaccine_due') returns the definition", () => {
      const def = getTemplate('vaccine_due');
      expect(def.key).toBe('vaccine_due');
    });

    it("getTemplate('nope') throws a 400 TEMPLATE_UNKNOWN error", () => {
      expect(() => getTemplate('nope' as WaTemplateKey)).toThrowError();
      try {
        getTemplate('nope' as WaTemplateKey);
        expect.unreachable('getTemplate should have thrown');
      } catch (err) {
        const e = err as Error & { statusCode?: number; code?: string };
        expect(e.statusCode).toBe(400);
        expect(e.code).toBe('TEMPLATE_UNKNOWN');
      }
    });
  });

  describe('renderTemplate', () => {
    it('renders follow_up_reminder with owner_name, pet_name and follow_up_date present in the output', () => {
      const body = renderTemplate('follow_up_reminder', {
        owner_name: 'Asha',
        pet_name: 'Rocky',
        follow_up_date: '14 Aug 2026',
      });
      expect(body).toContain('Asha');
      expect(body).toContain('Rocky');
      expect(body).toContain('14 Aug 2026');
    });

    it('throws a ZodError-derived 400 when a required variable is missing, before any rendering happens', () => {
      let threw = false;
      try {
        renderTemplate('follow_up_reminder', {
          owner_name: 'Asha',
          // pet_name missing
          follow_up_date: '14 Aug 2026',
        } as any);
        threw = false;
      } catch (err) {
        threw = true;
        // Duck-typed rather than `instanceof z.ZodError` — see the comment
        // in template-registry.ts's `renderTemplate` for why a cross-package
        // `instanceof` is unreliable in this monorepo even at matching
        // `zod` versions.
        const zodLike = err as Error & { statusCode?: number; issues?: unknown[] };
        expect(zodLike.name).toBe('ZodError');
        expect(Array.isArray(zodLike.issues)).toBe(true);
        expect(zodLike.statusCode).toBe(400);
      }
      expect(threw).toBe(true);
    });

    it('renders output for every template at most WA_CAPABILITY_LIMITS.maxTextBodyChars characters for representative inputs', () => {
      const sampleVariables: Record<WaTemplateKey, Record<string, string>> = {
        invoice_delivery: {
          owner_name: 'Asha Kapoor',
          pet_name: 'Rocky',
          invoice_number: 'INV-2026-0042',
          amount: '1,250.00',
          payment_link: 'https://pay.example.com/abc123',
        },
        payment_reminder: {
          owner_name: 'Asha Kapoor',
          pet_name: 'Rocky',
          invoice_number: 'INV-2026-0042',
          amount: '1,250.00',
          due_date: '10 Aug 2026',
          payment_link: 'https://pay.example.com/abc123',
        },
        follow_up_reminder: {
          owner_name: 'Asha Kapoor',
          pet_name: 'Rocky',
          follow_up_date: '14 Aug 2026',
        },
        vaccine_due: {
          owner_name: 'Asha Kapoor',
          pet_name: 'Rocky',
          vaccine_name: 'Rabies',
          due_date: '20 Aug 2026',
        },
        deworming_due: {
          owner_name: 'Asha Kapoor',
          pet_name: 'Rocky',
          due_date: '20 Aug 2026',
        },
        booking_confirmation: {
          owner_name: 'Asha Kapoor',
          pet_name: 'Rocky',
          slot_label: 'Tomorrow, 10:00 AM - 10:30 AM',
          booking_reference: 'BK-202608-1234',
        },
        appointment_reminder: {
          owner_name: 'Asha Kapoor',
          pet_name: 'Rocky',
          appointment_date: '20 Aug 2026',
          appointment_time: '10:00 AM',
          touch: 'ADVANCE',
        },
        owner_portal_link: {
          owner_name: 'Asha Kapoor',
          portal_link: 'https://portal.breeyo.app/abc123def456',
        },
      };

      for (const key of WA_TEMPLATE_KEYS) {
        const body = renderTemplate(key, sampleVariables[key]);
        expect(body.length).toBeLessThanOrEqual(WA_CAPABILITY_LIMITS.maxTextBodyChars);
      }
    });

    it('D-23: invoice_delivery render includes a "Pay now" line with the payment link when payment_link is present', () => {
      const body = renderTemplate('invoice_delivery', {
        owner_name: 'Asha',
        pet_name: 'Rocky',
        invoice_number: 'INV-1',
        amount: '500.00',
        payment_link: 'https://pay.example.com/xyz',
      });
      expect(body).toContain('Pay now');
      expect(body).toContain('https://pay.example.com/xyz');
    });

    it('D-23: invoice_delivery render omits the "Pay now" line entirely when payment_link is absent (paid invoice)', () => {
      const body = renderTemplate('invoice_delivery', {
        owner_name: 'Asha',
        pet_name: 'Rocky',
        invoice_number: 'INV-1',
        amount: '500.00',
      });
      expect(body).not.toContain('Pay now');
      expect(body).not.toContain('undefined');
    });
  });

  it('invoice_delivery has supportsMedia true, and its variable schema has no pdf/media variable (D-18)', () => {
    const def = WA_TEMPLATES.invoice_delivery;
    expect(def.supportsMedia).toBe(true);
    const shape = (def.variables as z.ZodObject<z.ZodRawShape>).shape;
    expect(Object.keys(shape)).not.toContain('pdf');
    expect(Object.keys(shape)).not.toContain('media');
    expect(Object.keys(shape)).not.toContain('media_url');
  });

  it('invoice_delivery variable schema treats payment_link as optional (D-23)', () => {
    const def = WA_TEMPLATES.invoice_delivery;
    const result = def.variables.safeParse({
      owner_name: 'Asha',
      pet_name: 'Rocky',
      invoice_number: 'INV-1',
      amount: '500.00',
    });
    expect(result.success).toBe(true);
  });

  it('booking_confirmation declares at most 3 buttons, each title at most 20 characters', () => {
    const def = WA_TEMPLATES.booking_confirmation;
    expect((def.buttons ?? []).length).toBeLessThanOrEqual(3);
    for (const button of def.buttons ?? []) {
      expect(button.title.length).toBeLessThanOrEqual(20);
    }
  });

  it('no template button declares a cancel or move payload (D-09)', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      for (const button of WA_TEMPLATES[key].buttons ?? []) {
        expect(button.id.toLowerCase()).not.toContain('cancel');
        expect(button.id.toLowerCase()).not.toContain('move');
      }
    }
  });

  it('WA_REMINDER_KIND_TO_TEMPLATE maps only the four automated reminder kinds, never payment_reminder (D-05, D-17/D-18)', () => {
    const expected: Record<WaReminderKind, WaTemplateKey> = {
      FOLLOW_UP: 'follow_up_reminder',
      VACCINE_DUE: 'vaccine_due',
      DEWORMING_DUE: 'deworming_due',
      APPOINTMENT_REMINDER: 'appointment_reminder',
    };
    expect(WA_REMINDER_KIND_TO_TEMPLATE).toEqual(expected);
    expect(Object.keys(WA_REMINDER_KIND_TO_TEMPLATE)).toHaveLength(4);
    expect(Object.values(WA_REMINDER_KIND_TO_TEMPLATE)).not.toContain('payment_reminder');
  });

  it('WA_TEMPLATES is a frozen in-code constant with no runtime import of Prisma', () => {
    expect(Object.isFrozen(WA_TEMPLATES)).toBe(true);
  });
});
