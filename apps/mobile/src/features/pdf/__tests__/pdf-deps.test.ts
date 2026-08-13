import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
import type { Clinic, Consultation, Owner, Pet, PrescriptionItem } from '@breeyo/types';

/**
 * Resolution smoke test for the PDF dependency chain (06-RESEARCH.md Pitfall 9).
 *
 * The point of this file is that the module specifiers `expo-print`,
 * `expo-sharing` and `expo-file-system` RESOLVE and that the shipped template
 * functions are callable. It deliberately does not exercise the native bridge -
 * the native modules are mocked below. A resolution failure here means plan
 * 06-15's three new billing templates would be written against a broken
 * dependency chain, which is exactly what happened to Phase 4's consultation
 * screen.
 */

vi.mock('expo-print', () => ({
  printToFileAsync: vi.fn(async () => ({ uri: 'file:///mock/print.pdf' })),
  printAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => true),
  shareAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock/documents/',
  cacheDirectory: 'file:///mock/cache/',
  moveAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async () => ({ exists: true, uri: 'file:///mock/print.pdf' })),
}));

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { buildOwnerSummaryHtml } from '../templates/consultation-summary';

const clinic = {
  name: 'Breeyo Test Clinic',
  address: '12 MG Road, Bengaluru 560001',
  contactPhone: '+91 98765 43210',
} as unknown as Clinic;

const consultation = {
  startedAt: '2026-08-13T09:30:00.000Z',
  assessment: 'Mild dermatitis on the left flank.',
  followUpDate: null,
  followUpReason: null,
} as unknown as Consultation;

const pet = {
  name: 'Bruno',
  species: 'DOG',
  breed: 'Indie',
} as unknown as Pet;

const owner = {
  name: 'Asha Menon',
  mobile: '+91 91234 56789',
} as unknown as Owner;

const prescriptions: PrescriptionItem[] = [];

/**
 * `vi.mock(spec, factory)` short-circuits module resolution entirely - it will
 * happily satisfy an import of a package that is not installed at all. So the
 * mocked imports above CANNOT prove the dependency chain resolves. Real
 * resolution is asserted separately with `require.resolve`, which runs Node's
 * resolution algorithm from this file's location and throws MODULE_NOT_FOUND
 * when a package is missing from apps/mobile's dependencies.
 */
const requireFromHere = createRequire(import.meta.url);

const REQUIRED_NATIVE_MODULES = [
  'expo-print',
  'expo-sharing',
  'expo-file-system',
  'react-native-svg',
  'react-native-qrcode-svg',
] as const;

describe('PDF dependency chain', () => {
  it('resolves every native module the PDF and QR pipelines import', () => {
    // Negative control: proves this assertion style actually detects absence.
    expect(() => requireFromHere.resolve('expo-print-definitely-not-real')).toThrow();

    for (const specifier of REQUIRED_NATIVE_MODULES) {
      expect(
        () => requireFromHere.resolve(specifier),
        `${specifier} must be a declared dependency of @breeyo/mobile`,
      ).not.toThrow();
    }

    // The mocked imports still exercise the import path itself.
    expect(typeof Print.printToFileAsync).toBe('function');
    expect(typeof Sharing.shareAsync).toBe('function');
    expect(FileSystem.documentDirectory).toBeTruthy();
  });

  it('renders the shipped owner summary template to non-empty HTML', () => {
    const html = buildOwnerSummaryHtml(clinic, consultation, prescriptions, pet, owner);

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<html');
    expect(html).toContain('Breeyo Test Clinic');
  });

  it('escapes HTML in interpolated clinic data', () => {
    const hostileClinic = {
      ...clinic,
      name: '<script>alert(1)</script>',
    } as unknown as Clinic;

    const html = buildOwnerSummaryHtml(hostileClinic, consultation, prescriptions, pet, owner);

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
