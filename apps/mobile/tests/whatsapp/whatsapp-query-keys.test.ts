import { describe, it, expect } from 'vitest';
import { whatsappKeys } from '../../src/features/whatsapp/hooks/whatsapp-query-keys';

/**
 * WHA-05: the key factory is pure and therefore testable in the Vitest
 * `node` environment. Its prefix design is the load-bearing property --
 * `threadsRoot(clinicId)` must be a strict prefix of every `threads(...)`
 * variant for that clinic so a single `invalidateQueries({ queryKey })` call
 * clears every filter/search combination at once.
 */

function isStrictPrefix(prefix: readonly unknown[], key: readonly unknown[]): boolean {
  if (prefix.length >= key.length) return false;
  return prefix.every((segment, index) => segment === key[index]);
}

describe('whatsappKeys.threads', () => {
  it("returns ['whatsapp', clinicId, 'threads', filter, search]", () => {
    expect(whatsappKeys.threads('clinic-1', 'all', '')).toEqual([
      'whatsapp',
      'clinic-1',
      'threads',
      'all',
      '',
    ]);
  });

  it('produces a different key array for a different filter', () => {
    const all = whatsappKeys.threads('clinic-1', 'all', '');
    const failed = whatsappKeys.threads('clinic-1', 'failed', '');
    expect(all).not.toEqual(failed);
  });

  it('produces a different key array for a different search term', () => {
    const empty = whatsappKeys.threads('clinic-1', 'all', '');
    const searched = whatsappKeys.threads('clinic-1', 'all', 'sharma');
    expect(empty).not.toEqual(searched);
  });
});

describe('whatsappKeys.threadsRoot', () => {
  it('is a strict prefix of threads(...) for the same clinic, across filter/search variants', () => {
    const root = whatsappKeys.threadsRoot('clinic-1');
    const variants = [
      whatsappKeys.threads('clinic-1', 'all', ''),
      whatsappKeys.threads('clinic-1', 'failed', ''),
      whatsappKeys.threads('clinic-1', 'needs_action', 'sharma'),
      whatsappKeys.threads('clinic-1', 'bookings', 'ravi kumar'),
    ];

    for (const variant of variants) {
      expect(isStrictPrefix(root, variant)).toBe(true);
    }
  });

  it('is scoped per clinic -- another clinic\'s root is not a prefix of this clinic\'s threads', () => {
    const otherRoot = whatsappKeys.threadsRoot('clinic-2');
    const thisClinicThreads = whatsappKeys.threads('clinic-1', 'all', '');
    expect(isStrictPrefix(otherRoot, thisClinicThreads)).toBe(false);
  });
});

describe('whatsappKeys.thread', () => {
  it("returns ['whatsapp', clinicId, 'thread', threadId]", () => {
    expect(whatsappKeys.thread('clinic-1', 'thread-9')).toEqual([
      'whatsapp',
      'clinic-1',
      'thread',
      'thread-9',
    ]);
  });
});

describe('whatsappKeys clinic-scoped roots', () => {
  it('bookings, booking, slots, and config all start with [\'whatsapp\', clinicId]', () => {
    const clinicId = 'clinic-1';
    const prefix = ['whatsapp', clinicId];

    expect(whatsappKeys.bookings(clinicId).slice(0, 2)).toEqual(prefix);
    expect(whatsappKeys.booking(clinicId, 'booking-1').slice(0, 2)).toEqual(prefix);
    expect(whatsappKeys.slots(clinicId, '2026-08-14').slice(0, 2)).toEqual(prefix);
    expect(whatsappKeys.config(clinicId).slice(0, 2)).toEqual(prefix);
  });
});

describe('whatsappKeys.slots', () => {
  it('differs by date for the same clinic', () => {
    const day1 = whatsappKeys.slots('clinic-1', '2026-08-14');
    const day2 = whatsappKeys.slots('clinic-1', '2026-08-15');
    expect(day1).not.toEqual(day2);
  });
});

describe('whatsappKeys immutability', () => {
  it('returns a new array every call and never mutates a shared array', () => {
    const first = whatsappKeys.threads('clinic-1', 'all', '');
    const second = whatsappKeys.threads('clinic-1', 'all', '');
    expect(first).toEqual(second);
    expect(first).not.toBe(second);

    // Mutating a returned array must not leak into the next call's result.
    (first as unknown as unknown[]).push('mutated');
    const third = whatsappKeys.threads('clinic-1', 'all', '');
    expect(third).toEqual(second);
  });

  it('root is a fresh array on every access and cannot be corrupted by a caller', () => {
    const rootA = whatsappKeys.root;
    (rootA as unknown as unknown[]).push('mutated');
    const rootB = whatsappKeys.root;
    expect(rootB).toEqual(['whatsapp']);
  });
});
