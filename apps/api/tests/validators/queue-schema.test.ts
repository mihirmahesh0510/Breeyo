import { describe, it, expect } from 'vitest';
import { checkInSchema, queueStatusUpdateSchema } from '@breeyo/validators';
import { randomUUID } from 'crypto';

describe('Queue Validation Schemas', () => {
  describe('checkInSchema', () => {
    it('accepts valid petId with defaults', () => {
      const petId = randomUUID();
      const result = checkInSchema.parse({ petId });
      expect(result.petId).toBe(petId);
      expect(result.isEmergency).toBe(false);
    });

    it('accepts optional visit reason', () => {
      const result = checkInSchema.parse({
        petId: randomUUID(),
        visitReason: 'vaccination',
      });
      expect(result.visitReason).toBe('vaccination');
    });

    it('accepts emergency flag', () => {
      const result = checkInSchema.parse({
        petId: randomUUID(),
        isEmergency: true,
      });
      expect(result.isEmergency).toBe(true);
    });

    it('rejects invalid UUID for petId', () => {
      expect(() =>
        checkInSchema.parse({ petId: 'not-a-uuid' }),
      ).toThrow();
    });

    it('rejects visit reason longer than 100 chars', () => {
      expect(() =>
        checkInSchema.parse({
          petId: randomUUID(),
          visitReason: 'a'.repeat(101),
        }),
      ).toThrow();
    });
  });

  describe('queueStatusUpdateSchema', () => {
    it('accepts WAITING', () => {
      const result = queueStatusUpdateSchema.parse({ status: 'WAITING' });
      expect(result.status).toBe('WAITING');
    });

    it('accepts IN_CONSULT', () => {
      const result = queueStatusUpdateSchema.parse({ status: 'IN_CONSULT' });
      expect(result.status).toBe('IN_CONSULT');
    });

    it('accepts DONE', () => {
      const result = queueStatusUpdateSchema.parse({ status: 'DONE' });
      expect(result.status).toBe('DONE');
    });

    it('accepts NO_SHOW', () => {
      const result = queueStatusUpdateSchema.parse({ status: 'NO_SHOW' });
      expect(result.status).toBe('NO_SHOW');
    });

    it('rejects CANCELLED (not a valid status)', () => {
      expect(() =>
        queueStatusUpdateSchema.parse({ status: 'CANCELLED' }),
      ).toThrow();
    });

    it('rejects empty status', () => {
      expect(() =>
        queueStatusUpdateSchema.parse({ status: '' }),
      ).toThrow();
    });
  });
});
