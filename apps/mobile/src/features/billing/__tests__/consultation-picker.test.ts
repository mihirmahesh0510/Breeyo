import { describe, it, expect } from 'vitest';
import type { InvoiceListItem } from '@breeyo/types';
import { PICKER_COPY, pickerState, toPickerRow } from '../lib/consultation-picker';

const DRAFT: InvoiceListItem = {
  id: 'inv-1',
  invoiceNumber: null,
  status: 'DRAFT',
  grandTotalPaise: 106_200,
  balancePaise: 106_200,
  createdAt: new Date('2026-08-13T09:30:00.000Z'),
  dueDate: null,
  petName: 'Bruno',
  ownerName: 'Anita Rao',
  exceptionFlag: null,
} as InvoiceListItem;

describe('the D-06 picker state', () => {
  it('renders skeletons rather than the empty state while loading', () => {
    // Showing "nothing to bill" to someone about to bill is a false statement.
    expect(pickerState({ isLoading: true, isError: false, items: undefined })).toBe('loading');
    expect(pickerState({ isLoading: true, isError: false, items: [] })).toBe('loading');
  });

  it('prefers the error state over the empty state', () => {
    // A failed request is not evidence of an empty list.
    expect(pickerState({ isLoading: false, isError: true, items: [] })).toBe('error');
  });

  it('is empty only once a successful response really carried no drafts', () => {
    expect(pickerState({ isLoading: false, isError: false, items: [] })).toBe('empty');
    expect(pickerState({ isLoading: false, isError: false, items: undefined })).toBe('empty');
  });

  it('is populated when drafts arrive', () => {
    expect(pickerState({ isLoading: false, isError: false, items: [DRAFT] })).toBe('populated');
  });
});

describe('a picker row', () => {
  const formatDate = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

  it('shows the pet, the owner and the date', () => {
    const row = toPickerRow(DRAFT, formatDate);
    expect(row.id).toBe('inv-1');
    expect(row.title).toBe('Bruno — Anita Rao');
    expect(row.subtitle).toBe('2026-08-13');
  });

  it('names the gap rather than rendering a blank for a counter sale', () => {
    const row = toPickerRow({ ...DRAFT, petName: null, ownerName: null }, formatDate);
    expect(row.title).toBe(`${PICKER_COPY.unknownPet} — ${PICKER_COPY.unknownOwner}`);
    expect(row.title).not.toContain('null');
  });
});

describe('the picker copy', () => {
  it('states where drafts come from rather than only that there are none', () => {
    expect(PICKER_COPY.emptyTitle).toBe('No drafts to bill');
    expect(PICKER_COPY.emptyBody).toBe('Drafts appear here when a vet ends a consultation.');
    expect(PICKER_COPY.errorRetry).toBe('Try again');
  });
});
