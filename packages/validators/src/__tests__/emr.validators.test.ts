import { describe, it, expect } from 'vitest';
import { createConsultationSchema, saveDraftSchema, addendumSchema } from '../emr.js';

describe('createConsultationSchema', () => {
  it('accepts valid general consultation input', () => {
    const result = createConsultationSchema.safeParse({
      petId: 'pet-123',
      visitType: 'general',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with queueEntryId', () => {
    const result = createConsultationSchema.safeParse({
      petId: 'pet-123',
      queueEntryId: 'queue-456',
      visitType: 'surgery',
    });
    expect(result.success).toBe(true);
  });

  it('accepts vaccination visit type', () => {
    const result = createConsultationSchema.safeParse({
      petId: 'pet-123',
      visitType: 'vaccination',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown visitType', () => {
    const result = createConsultationSchema.safeParse({
      petId: 'pet-123',
      visitType: 'emergency',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing petId', () => {
    const result = createConsultationSchema.safeParse({
      visitType: 'general',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty petId', () => {
    const result = createConsultationSchema.safeParse({
      petId: '',
      visitType: 'general',
    });
    expect(result.success).toBe(false);
  });
});

describe('saveDraftSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = saveDraftSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial vitals', () => {
    const result = saveDraftSchema.safeParse({
      vitals: { weightKg: 25.5 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts full SOAP data', () => {
    const result = saveDraftSchema.safeParse({
      vitals: { weightKg: 25.5, temperatureC: 38.5, heartRateBpm: 80, respiratoryRate: 20 },
      subjective: { ownerReports: 'Vomiting since morning', chips: ['Vomiting'] },
      objective: { bodySystems: [{ system: 'eyes', status: 'normal', findings: [], notes: '' }] },
      assessment: 'Gastroenteritis',
      plan: { actionItems: ['Follow-up'], freeText: 'Recheck in 3 days' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts referral data', () => {
    const result = saveDraftSchema.safeParse({
      referral: { specialistType: 'Surgeon', reason: 'Mass removal needed', urgency: 'routine' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts null referral', () => {
    const result = saveDraftSchema.safeParse({
      referral: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('addendumSchema', () => {
  it('accepts valid addendum text', () => {
    const result = addendumSchema.safeParse({ text: 'Patient improved after medication' });
    expect(result.success).toBe(true);
  });

  it('rejects empty text', () => {
    const result = addendumSchema.safeParse({ text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing text', () => {
    const result = addendumSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
