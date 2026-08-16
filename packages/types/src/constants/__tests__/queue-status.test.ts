import { describe, it, expect } from 'vitest';
import { QueueStatus, QUEUE_TRANSITIONS, isValidTransition, QUEUE_STATUS_LABELS } from '../queue-status.js';

describe('EXPECTED transitions', () => {
  it('allows EXPECTED to WAITING (D-11 early check-in)', () => {
    expect(isValidTransition(QueueStatus.EXPECTED, QueueStatus.WAITING)).toBe(true);
  });

  it('allows EXPECTED to NO_SHOW (D-09 grace expiry)', () => {
    expect(isValidTransition(QueueStatus.EXPECTED, QueueStatus.NO_SHOW)).toBe(true);
  });

  it('rejects EXPECTED to IN_CONSULT (must become WAITING first)', () => {
    expect(isValidTransition(QueueStatus.EXPECTED, QueueStatus.IN_CONSULT)).toBe(false);
  });

  it('rejects EXPECTED to DONE', () => {
    expect(isValidTransition(QueueStatus.EXPECTED, QueueStatus.DONE)).toBe(false);
  });

  it('rejects WAITING back to EXPECTED', () => {
    expect(isValidTransition(QueueStatus.WAITING, QueueStatus.EXPECTED)).toBe(false);
  });
});

describe('EXPECTED has a label', () => {
  it('QUEUE_STATUS_LABELS[EXPECTED] is "Expected"', () => {
    expect(QUEUE_STATUS_LABELS[QueueStatus.EXPECTED]).toBe('Expected');
  });
});

describe('existing transitions unchanged', () => {
  it('WAITING to IN_CONSULT remains true', () => {
    expect(isValidTransition(QueueStatus.WAITING, QueueStatus.IN_CONSULT)).toBe(true);
  });

  it('IN_CONSULT to DONE remains true', () => {
    expect(isValidTransition(QueueStatus.IN_CONSULT, QueueStatus.DONE)).toBe(true);
  });

  it('WAITING to NO_SHOW remains true', () => {
    expect(isValidTransition(QueueStatus.WAITING, QueueStatus.NO_SHOW)).toBe(true);
  });

  it('IN_CONSULT to NO_SHOW remains true', () => {
    expect(isValidTransition(QueueStatus.IN_CONSULT, QueueStatus.NO_SHOW)).toBe(true);
  });

  it('DONE has no valid outgoing transitions', () => {
    for (const target of Object.values(QueueStatus)) {
      expect(isValidTransition(QueueStatus.DONE, target)).toBe(false);
    }
  });
});
