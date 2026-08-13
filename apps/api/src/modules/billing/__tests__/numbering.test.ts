import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_DOCUMENT_NUMBER_LENGTH } from '@breeyo/types';
import {
  formatISTFinancialYear,
  formatISTMonthComponent,
  nextDocumentNumber,
  type DocumentNumberTransactionClient,
} from '../numbering.service.js';

/**
 * A stand-in for the caller's transaction handle. `nextDocumentNumber` only
 * ever touches `$queryRaw`, which is exactly why it is typed structurally —
 * this object satisfies the contract with no Prisma machinery at all.
 */
function mockTx(lastNumber: number | bigint) {
  const $queryRaw = vi.fn().mockResolvedValue([{ last_number: lastNumber }]);
  return { tx: { $queryRaw } as unknown as DocumentNumberTransactionClient, $queryRaw };
}

const CLINIC = '11111111-1111-1111-1111-111111111111';

describe('formatISTMonthComponent', () => {
  it('renders the IST calendar month as YYYYMM', () => {
    expect(formatISTMonthComponent(new Date('2026-05-15T06:00:00Z'))).toBe('202605');
  });

  it('zero-pads single-digit months', () => {
    expect(formatISTMonthComponent(new Date('2026-04-10T06:00:00Z'))).toBe('202604');
  });

  /**
   * The Pattern 6 timezone trap. 19:00Z on 31 May is 00:30 IST on 1 June, so
   * an invoice finalized then belongs to June. Reading the UTC month of the
   * instant — or of `getTodayIST`'s IST-midnight return value, whose UTC
   * components are deliberately shifted back by 5h30m — yields May.
   */
  it('treats 00:30 IST on the 1st as the new month, not the old one', () => {
    expect(formatISTMonthComponent(new Date('2026-05-31T19:00:00Z'))).toBe('202606');
  });

  it('treats 09:30 IST on the 1st as the new month', () => {
    expect(formatISTMonthComponent(new Date('2026-06-01T04:00:00Z'))).toBe('202606');
  });

  it('keeps 23:00 IST on the last day in the old month', () => {
    // 17:30Z on 31 May is 23:00 IST on 31 May — still May.
    expect(formatISTMonthComponent(new Date('2026-05-31T17:30:00Z'))).toBe('202605');
  });
});

describe('formatISTFinancialYear (D-38)', () => {
  it('maps an April date to the financial year starting that April', () => {
    expect(formatISTFinancialYear(new Date('2026-04-01T06:00:00Z'))).toBe('2026-27');
  });

  it('maps a December date to the financial year that began the previous April', () => {
    expect(formatISTFinancialYear(new Date('2026-12-25T06:00:00Z'))).toBe('2026-27');
  });

  it('maps a January-to-March date back to the previous calendar year', () => {
    expect(formatISTFinancialYear(new Date('2027-01-05T06:00:00Z'))).toBe('2026-27');
    expect(formatISTFinancialYear(new Date('2027-03-31T10:00:00Z'))).toBe('2026-27');
  });

  /**
   * D-38's reset instant. 19:00Z on 31 March is 00:30 IST on 1 April, which is
   * the first moment of the new financial year — the sequence must reset here.
   */
  it('rolls to the next financial year at 00:30 IST on 1 April', () => {
    expect(formatISTFinancialYear(new Date('2027-03-31T19:00:00Z'))).toBe('2027-28');
    expect(formatISTMonthComponent(new Date('2027-03-31T19:00:00Z'))).toBe('202704');
  });

  it('pads the second component across a century boundary', () => {
    expect(formatISTFinancialYear(new Date('2099-06-01T06:00:00Z'))).toBe('2099-00');
  });
});

describe('nextDocumentNumber', () => {
  beforeEach(() => vi.clearAllMocks());

  it('formats the first invoice of the financial year as INV-YYYYMM-0001', async () => {
    const { tx } = mockTx(1);
    const n = await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'));
    expect(n).toBe('INV-202605-0001');
    expect(n.length).toBeLessThanOrEqual(MAX_DOCUMENT_NUMBER_LENGTH);
  });

  it('formats a credit note with the CN prefix', async () => {
    const { tx } = mockTx(1);
    expect(await nextDocumentNumber(tx, CLINIC, 'CN', new Date('2026-05-15T06:00:00Z'))).toBe(
      'CN-202605-0001',
    );
  });

  it('zero-pads to four digits', async () => {
    const { tx } = mockTx(42);
    expect(await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'))).toBe(
      'INV-202605-0042',
    );
  });

  it('stays within the Rule 46(b) 16-character limit at sequence 9999', async () => {
    const { tx } = mockTx(9999);
    const n = await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'));
    expect(n).toBe('INV-202605-9999');
    expect(n).toHaveLength(15);
    expect(n.length).toBeLessThanOrEqual(MAX_DOCUMENT_NUMBER_LENGTH);
  });

  it('widens past four digits rather than truncating, at exactly the 16-char limit', async () => {
    const { tx } = mockTx(10000);
    const n = await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'));
    expect(n).toBe('INV-202605-10000');
    expect(n).toHaveLength(MAX_DOCUMENT_NUMBER_LENGTH);
  });

  it('throws rather than emitting a non-compliant number beyond 16 characters', async () => {
    const { tx } = mockTx(100000);
    await expect(
      nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z')),
    ).rejects.toThrow(/16|length|exceed/i);
  });

  it('coerces a bigint last_number from the driver', async () => {
    const { tx } = mockTx(7n);
    expect(await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'))).toBe(
      'INV-202605-0007',
    );
  });

  it('throws when the upsert returns no row', async () => {
    const $queryRaw = vi.fn().mockResolvedValue([]);
    const tx = { $queryRaw } as unknown as DocumentNumberTransactionClient;
    await expect(
      nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z')),
    ).rejects.toThrow();
  });

  it('keys the counter row on the financial year, not the calendar month (D-38)', async () => {
    const { tx, $queryRaw } = mockTx(1);
    await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'));
    const [, clinicId, docType, period] = $queryRaw.mock.calls[0];
    expect(clinicId).toBe(CLINIC);
    expect(docType).toBe('INV');
    expect(period).toBe('2026-27');
    expect(period).not.toBe('202605');
  });

  it('issues an ON CONFLICT upsert against the composite primary key', async () => {
    const { tx, $queryRaw } = mockTx(1);
    await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'));
    const sql = ($queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toMatch(/ON CONFLICT \(clinic_id, doc_type, period\)/);
    expect(sql).toMatch(/DO UPDATE/);
    expect(sql).toMatch(/RETURNING/);
    expect(sql).not.toMatch(/nextval|CREATE SEQUENCE|pg_advisory/i);
  });

  it('advances INV and CN independently for the same clinic and period', async () => {
    const { tx, $queryRaw } = mockTx(1);
    await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'));
    await nextDocumentNumber(tx, CLINIC, 'CN', new Date('2026-05-15T06:00:00Z'));
    expect($queryRaw.mock.calls[0][2]).toBe('INV');
    expect($queryRaw.mock.calls[1][2]).toBe('CN');
  });

  it('scopes the counter row per clinic', async () => {
    const other = '22222222-2222-2222-2222-222222222222';
    const { tx, $queryRaw } = mockTx(1);
    await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-15T06:00:00Z'));
    await nextDocumentNumber(tx, other, 'INV', new Date('2026-05-15T06:00:00Z'));
    expect($queryRaw.mock.calls[0][1]).toBe(CLINIC);
    expect($queryRaw.mock.calls[1][1]).toBe(other);
  });

  it('renders the month component from IST at the month boundary', async () => {
    const { tx } = mockTx(1);
    expect(await nextDocumentNumber(tx, CLINIC, 'INV', new Date('2026-05-31T19:00:00Z'))).toBe(
      'INV-202606-0001',
    );
  });
});
