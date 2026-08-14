import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InvoiceListItem } from '@breeyo/types';
import {
  VIEW_INVOICES_PERMISSION,
  canViewInvoices,
  petInvoicesSectionState,
  sortInvoicesNewestFirst,
} from '../lib/pet-invoices';

/**
 * The D-25 pet-profile Invoices section.
 *
 * `apps/mobile` cannot render a React Native component under test — the vitest
 * environment is `node` with no Metro transform and `react-test-renderer` is
 * not installed (recorded in `06-14-SUMMARY.md` deviation 1). So this file
 * splits the same way its siblings do: every decision the section makes lives
 * in `lib/pet-invoices.ts`, which imports nothing from `react-native` and is
 * executed directly below, while the composition facts that can only be stated
 * about the component are asserted against its source text.
 *
 * The source-text assertions are not decoration. Two of them carry the plan's
 * security weight:
 *
 *  * T-06-142 — the section must be gated on `VIEW_INVOICES` rather than
 *    rendering an error a user without it would meet on every pet profile.
 *  * T-06-141 — the change to `PatientDetailScreen.tsx` must be additive. That
 *    file is a Phase 3 deliverable, and restructuring it to hang a billing
 *    section off it is how a billing feature breaks patient management.
 */

function readSource(relativePath: string): string {
  // Relative to the vitest root (`apps/mobile`) rather than via
  // `import.meta.url`: this package's tsconfig emits CommonJS, under which
  // `import.meta` is a type error even though vitest runs the file as ESM.
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

const TAB_SOURCE = readSource('src/features/billing/components/PetInvoicesTab.tsx');
const PROFILE_SOURCE = readSource('src/features/patient/screens/PatientDetailScreen.tsx');

function invoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    invoiceNumber: 'INV-202608-0001',
    status: 'PAID',
    grandTotalPaise: 125_000,
    balancePaise: 0,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    dueDate: null,
    petName: 'Bruno',
    ownerName: 'A. Sharma',
    exceptionFlag: null,
    ...overrides,
  };
}

describe('canViewInvoices (T-06-142)', () => {
  it('admits a user holding VIEW_INVOICES', () => {
    expect(canViewInvoices([VIEW_INVOICES_PERMISSION, 'RECORD_PAYMENT'])).toBe(true);
  });

  it('refuses a user without it, and an unresolved permission list', () => {
    expect(canViewInvoices(['RECORD_PAYMENT'])).toBe(false);
    expect(canViewInvoices(undefined)).toBe(false);
    expect(canViewInvoices([])).toBe(false);
  });
});

describe('sortInvoicesNewestFirst', () => {
  it('puts the most recent invoice first', () => {
    const older = invoice({ id: 'a', createdAt: new Date('2026-07-01T10:00:00Z') });
    const newer = invoice({ id: 'b', createdAt: new Date('2026-08-01T10:00:00Z') });

    expect(sortInvoicesNewestFirst([older, newer]).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('accepts ISO strings, which is how dates actually arrive over the wire', () => {
    const older = invoice({ id: 'a', createdAt: '2026-07-01T10:00:00Z' as unknown as Date });
    const newer = invoice({ id: 'b', createdAt: '2026-08-01T10:00:00Z' as unknown as Date });

    expect(sortInvoicesNewestFirst([older, newer]).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the array it was given', () => {
    const list = [
      invoice({ id: 'a', createdAt: new Date('2026-07-01T10:00:00Z') }),
      invoice({ id: 'b', createdAt: new Date('2026-08-01T10:00:00Z') }),
    ];

    sortInvoicesNewestFirst(list);

    // React Query hands back its cached array; sorting it in place would
    // reorder the cache under every other consumer of the same key.
    expect(list.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('petInvoicesSectionState', () => {
  const base = {
    canView: true,
    isPermissionLoading: false,
    isLoading: false,
    isError: false,
    count: 0,
  };

  it('is hidden for a user without VIEW_INVOICES', () => {
    expect(petInvoicesSectionState({ ...base, canView: false, count: 3 })).toBe('hidden');
  });

  it('is hidden while the permission check is still resolving', () => {
    // Rendering the section and then removing it would show one pet profile a
    // list it is not entitled to, however briefly.
    expect(petInvoicesSectionState({ ...base, canView: false, isPermissionLoading: true })).toBe(
      'hidden',
    );
  });

  it('is loading before data arrives, never empty', () => {
    // Showing "no invoices" before the query resolves is a false statement
    // about a pet's billing history, on the screen where staff check it.
    expect(petInvoicesSectionState({ ...base, isLoading: true })).toBe('loading');
  });

  it('is error when the query failed', () => {
    expect(petInvoicesSectionState({ ...base, isError: true })).toBe('error');
  });

  it('prefers the error state over a misleading empty state', () => {
    expect(petInvoicesSectionState({ ...base, isError: true, count: 0 })).toBe('error');
  });

  it('is empty only once a successful query returned nothing', () => {
    expect(petInvoicesSectionState(base)).toBe('empty');
  });

  it('is populated when rows came back', () => {
    expect(petInvoicesSectionState({ ...base, count: 2 })).toBe('populated');
  });
});

describe('the component (source-level)', () => {
  it('renders the empty state with the pet name interpolated', () => {
    expect(TAB_SOURCE).toContain('No invoices for');
    // The literal must carry the pet's actual name, not a generic noun — the
    // UI-SPEC copy is "No invoices for [Pet Name] yet."
    expect(TAB_SOURCE).toMatch(/No invoices for \$\{petName\} yet\./);
  });

  it('reuses the dashboard invoice card rather than building a second one', () => {
    expect(TAB_SOURCE).toContain('InvoiceListCard');
  });

  it('renders skeletons while loading', () => {
    expect(TAB_SOURCE).toContain('SkeletonLoader');
  });

  it('gates the section on VIEW_INVOICES', () => {
    expect(TAB_SOURCE).toContain('VIEW_INVOICES');
  });

  it('offers a retry affordance on the error state', () => {
    expect(TAB_SOURCE).toMatch(/retry|Retry/);
  });
});

describe('the pet profile change is additive (T-06-141)', () => {
  it('imports and renders PetInvoicesTab', () => {
    expect(PROFILE_SOURCE).toContain('PetInvoicesTab');
    // Import plus usage.
    expect(PROFILE_SOURCE.match(/PetInvoicesTab/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('leaves every pre-existing profile section in place', () => {
    // The Phase 3 and Phase 4 composition, named piece by piece. If a future
    // edit restructures this screen to make room for billing, this fails
    // rather than the patient team discovering it.
    for (const section of [
      'PetProfileCard',
      'PreventiveCareCard',
      'WeightTrendChart',
      'MedicalTimeline',
      'Visit History',
      'EditPetForm',
    ]) {
      expect(PROFILE_SOURCE).toContain(section);
    }
  });

  it('keeps the existing style keys the screen already had', () => {
    for (const style of ['scrollContent', 'quickStats', 'statDivider', 'sectionTitle']) {
      expect(PROFILE_SOURCE).toContain(style);
    }
  });
});
