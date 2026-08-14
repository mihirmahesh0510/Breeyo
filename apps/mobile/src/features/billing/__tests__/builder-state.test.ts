import { describe, it, expect } from 'vitest';
import { ApiClientError } from '../../../lib/api';
import {
  CATALOG_SEARCH_DEBOUNCE_MS,
  CATALOG_SEARCH_MIN_CHARS,
  PREVIEW_TOTALS_DEBOUNCE_MS,
  dueDateFromOffset,
  lineGrossPaise,
  offsetFromDueDate,
  shouldPreviewTotals,
  stockShortfallsFrom,
} from '../lib/builder-state';

/**
 * The builder's React-Native-free decision logic.
 *
 * `apps/mobile` cannot render a React Native component under test (vitest runs
 * the `node` environment with no Metro transform and `react-test-renderer` is
 * not installed) — the same constraint 06-14 hit and resolved the same way. The
 * consequence is that anything falsifiable has to live outside a `.tsx`, so
 * this module holds the builder's decisions and the components stay thin.
 */

describe('search and preview contracts', () => {
  it('matches 06-UI-SPEC "Search Behavior": 300ms, two characters', () => {
    expect(CATALOG_SEARCH_DEBOUNCE_MS).toBe(300);
    expect(CATALOG_SEARCH_MIN_CHARS).toBe(2);
  });

  it('debounces the totals preview at 400ms', () => {
    expect(PREVIEW_TOTALS_DEBOUNCE_MS).toBe(400);
  });
});

describe('shouldPreviewTotals', () => {
  it('is false with no persisted draft yet', () => {
    expect(shouldPreviewTotals(null, 3)).toBe(false);
    expect(shouldPreviewTotals(undefined, 3)).toBe(false);
  });

  it('is false for an empty line list', () => {
    expect(shouldPreviewTotals('inv-1', 0)).toBe(false);
  });

  it('is true once a draft exists and carries at least one line', () => {
    expect(shouldPreviewTotals('inv-1', 1)).toBe(true);
  });
});

describe('stockShortfallsFrom (BIL-02, T-06-106)', () => {
  const shortfalls = [
    {
      inventoryItemId: '22222222-2222-4222-8222-222222222222',
      description: 'Amoxicillin 250mg',
      requested: 10,
      available: 3,
    },
  ];

  it('returns the structured list from an INSUFFICIENT_STOCK 409', () => {
    const error = new ApiClientError('Insufficient stock', 'INSUFFICIENT_STOCK', 409, {
      shortfalls,
    });

    expect(stockShortfallsFrom(error)).toEqual(shortfalls);
  });

  it('returns an empty list for any other API error', () => {
    const error = new ApiClientError('Nope', 'INVOICE_NOT_DRAFT', 409, {});

    expect(stockShortfallsFrom(error)).toEqual([]);
  });

  it('returns an empty list for a non-API error, a null, and a malformed payload', () => {
    expect(stockShortfallsFrom(new Error('network down'))).toEqual([]);
    expect(stockShortfallsFrom(null)).toEqual([]);
    expect(
      stockShortfallsFrom(
        new ApiClientError('Insufficient stock', 'INSUFFICIENT_STOCK', 409, {
          shortfalls: 'not-an-array' as unknown as never,
        }),
      ),
    ).toEqual([]);
  });

  it('drops an entry missing the numbers the banner has to render', () => {
    const error = new ApiClientError('Insufficient stock', 'INSUFFICIENT_STOCK', 409, {
      shortfalls: [...shortfalls, { inventoryItemId: 'x', description: 'Broken' }],
    });

    expect(stockShortfallsFrom(error)).toEqual(shortfalls);
  });
});

describe('lineGrossPaise', () => {
  it('multiplies two integers and stays an integer', () => {
    expect(lineGrossPaise({ unitPricePaise: 12_500, quantity: 3 })).toBe(37_500);
    expect(Number.isInteger(lineGrossPaise({ unitPricePaise: 7, quantity: 3 }))).toBe(true);
  });

  it('is zero for a free line', () => {
    expect(lineGrossPaise({ unitPricePaise: 0, quantity: 4 })).toBe(0);
  });

  it('ignores the discount — the server applies discounts, this is gross only', () => {
    expect(
      lineGrossPaise({
        unitPricePaise: 50_000,
        quantity: 1,
        discountType: 'percent',
        discountValue: 50,
      } as never),
    ).toBe(50_000);
  });
});

describe('due date offset', () => {
  const today = new Date('2026-08-14T09:30:00.000Z');

  it('resolves an offset in days to an ISO instant', () => {
    expect(dueDateFromOffset(7, today)).toBe('2026-08-21T00:00:00.000Z');
  });

  it('treats a zero offset as due today', () => {
    expect(dueDateFromOffset(0, today)).toBe('2026-08-14T00:00:00.000Z');
  });

  it('crosses a month boundary', () => {
    expect(dueDateFromOffset(30, new Date('2026-08-20T23:00:00.000Z'))).toBe(
      '2026-09-19T00:00:00.000Z',
    );
  });

  it('round-trips back to the same offset', () => {
    expect(offsetFromDueDate(dueDateFromOffset(15, today), today)).toBe(15);
    expect(offsetFromDueDate(dueDateFromOffset(0, today), today)).toBe(0);
  });

  it('returns null for an absent or unparseable due date', () => {
    expect(offsetFromDueDate(null, today)).toBeNull();
    expect(offsetFromDueDate('not a date', today)).toBeNull();
  });

  it('refuses a negative offset — an invoice cannot fall due before it exists', () => {
    expect(dueDateFromOffset(-1, today)).toBe('2026-08-14T00:00:00.000Z');
  });
});
