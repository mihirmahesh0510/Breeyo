import { describe, it, expect } from 'vitest';
import { QueueStatus, isValidTransition, QUEUE_TRANSITIONS } from '@breeyo/types';

describe('Queue State Machine (QUE-04)', () => {
  describe('valid transitions', () => {
    it('allows WAITING -> IN_CONSULT', () => {
      expect(isValidTransition(QueueStatus.WAITING, QueueStatus.IN_CONSULT)).toBe(true);
    });

    it('allows WAITING -> NO_SHOW', () => {
      expect(isValidTransition(QueueStatus.WAITING, QueueStatus.NO_SHOW)).toBe(true);
    });

    it('allows IN_CONSULT -> DONE', () => {
      expect(isValidTransition(QueueStatus.IN_CONSULT, QueueStatus.DONE)).toBe(true);
    });

    it('allows IN_CONSULT -> NO_SHOW', () => {
      expect(isValidTransition(QueueStatus.IN_CONSULT, QueueStatus.NO_SHOW)).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('rejects WAITING -> DONE (must go through IN_CONSULT)', () => {
      expect(isValidTransition(QueueStatus.WAITING, QueueStatus.DONE)).toBe(false);
    });

    it('rejects DONE -> WAITING (terminal state)', () => {
      expect(isValidTransition(QueueStatus.DONE, QueueStatus.WAITING)).toBe(false);
    });

    it('rejects DONE -> IN_CONSULT (terminal state)', () => {
      expect(isValidTransition(QueueStatus.DONE, QueueStatus.IN_CONSULT)).toBe(false);
    });

    it('rejects NO_SHOW -> WAITING (terminal state)', () => {
      expect(isValidTransition(QueueStatus.NO_SHOW, QueueStatus.WAITING)).toBe(false);
    });

    it('rejects NO_SHOW -> IN_CONSULT (terminal state)', () => {
      expect(isValidTransition(QueueStatus.NO_SHOW, QueueStatus.IN_CONSULT)).toBe(false);
    });

    it('rejects IN_CONSULT -> WAITING (cannot go backwards)', () => {
      expect(isValidTransition(QueueStatus.IN_CONSULT, QueueStatus.WAITING)).toBe(false);
    });
  });

  describe('terminal states have no transitions', () => {
    it('DONE has empty transition list', () => {
      expect(QUEUE_TRANSITIONS[QueueStatus.DONE]).toEqual([]);
    });

    it('NO_SHOW has empty transition list', () => {
      expect(QUEUE_TRANSITIONS[QueueStatus.NO_SHOW]).toEqual([]);
    });
  });
});
