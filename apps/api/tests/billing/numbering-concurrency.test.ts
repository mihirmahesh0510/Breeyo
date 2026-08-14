import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, createTestUser, createTestClinic, cleanupTestData } from '../helpers/factories.js';
import { nextDocumentNumber, formatISTFinancialYear } from '../../src/modules/billing/numbering.service.js';

/**
 * Real-database behaviour of the counter row. The unit suite proves the
 * formatting; this file proves the two properties that only a real
 * PostgreSQL can demonstrate: that the allocation rolls back with its
 * transaction, and that concurrent allocations serialise on the row lock
 * rather than colliding.
 *
 * `apps/api/vitest.config.ts` sets `fileParallelism: false`, so the
 * concurrency here must come from `Promise.all` inside a single test.
 */
describe('document numbering against a real database', () => {
  let clinicId: string;
  let otherClinicId: string;

  const MAY_2026 = new Date('2026-05-15T06:00:00Z');

  beforeAll(async () => {
    await cleanupTestData();
    const owner = await createTestUser();
    const clinic = await createTestClinic(owner.id);
    const otherClinic = await createTestClinic(owner.id);
    clinicId = clinic.id;
    otherClinicId = otherClinic.id;
  });

  beforeEach(async () => {
    await prisma.invoiceNumberCounter.deleteMany();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it('allocates consecutively within one financial year', async () => {
    const first = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026));
    const second = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026));
    expect(first).toBe('INV-202605-0001');
    expect(second).toBe('INV-202605-0002');
  });

  it('persists the counter row keyed on the financial year (D-38)', async () => {
    await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026));
    const rows = await prisma.invoiceNumberCounter.findMany({ where: { clinicId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].period).toBe('2026-27');
    expect(rows[0].docType).toBe('INV');
    expect(rows[0].lastNumber).toBe(1);
  });

  it('rollback of the allocating transaction leaves the counter unchanged', async () => {
    const first = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026));
    expect(first).toBe('INV-202605-0001');

    // Allocate inside a transaction that then throws — the counter increment
    // must die with it, otherwise the next finalize would leave a gap that a
    // GST auditor reads as a suppressed invoice (Rule 46(b)).
    await expect(
      prisma.$transaction(async (tx) => {
        const doomed = await nextDocumentNumber(tx, clinicId, 'INV', MAY_2026);
        expect(doomed).toBe('INV-202605-0002');
        throw new Error('simulated finalize failure');
      }),
    ).rejects.toThrow('simulated finalize failure');

    const persisted = await prisma.invoiceNumberCounter.findFirst({ where: { clinicId } });
    expect(persisted?.lastNumber).toBe(1);

    // The rolled-back number is reused, not skipped — gap-free.
    const reused = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026));
    expect(reused).toBe('INV-202605-0002');
  });

  it('ten concurrent allocations produce 0001..0010 with no duplicate and no gap', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026), {
          timeout: 20000,
          maxWait: 20000,
        }),
      ),
    );

    const sorted = [...results].sort();
    const expected = Array.from(
      { length: 10 },
      (_, i) => `INV-202605-${String(i + 1).padStart(4, '0')}`,
    );

    expect(sorted).toEqual(expected);
    expect(new Set(results).size).toBe(10);

    const counter = await prisma.invoiceNumberCounter.findFirst({ where: { clinicId } });
    expect(counter?.lastNumber).toBe(10);
  });

  it('keeps counters independent per clinic', async () => {
    const a = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026));
    const b = await prisma.$transaction((tx) =>
      nextDocumentNumber(tx, otherClinicId, 'INV', MAY_2026),
    );
    expect(a).toBe('INV-202605-0001');
    expect(b).toBe('INV-202605-0001');
  });

  it('keeps counters independent per document type', async () => {
    const inv = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', MAY_2026));
    const cn = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'CN', MAY_2026));
    expect(inv).toBe('INV-202605-0001');
    expect(cn).toBe('CN-202605-0001');
  });

  /**
   * D-38: the sequence resets on 1 April, not on the 1st of every month. Two
   * assertions in one: the sequence *continues* across a calendar-month
   * boundary inside a financial year, and *resets* across the April boundary.
   */
  it('continues across a month boundary but resets across 1 April IST (D-38)', async () => {
    const jan2027 = new Date('2027-01-10T06:00:00Z'); // FY 2026-27
    const mar2027 = new Date('2027-03-31T10:00:00Z'); // 15:30 IST 31 Mar — still FY 2026-27
    const apr2027 = new Date('2027-03-31T19:00:00Z'); // 00:30 IST 1 Apr — FY 2027-28

    const a = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', jan2027));
    const b = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', mar2027));
    const c = await prisma.$transaction((tx) => nextDocumentNumber(tx, clinicId, 'INV', apr2027));

    // Month component advances; sequence does NOT reset within the FY.
    expect(a).toBe('INV-202701-0001');
    expect(b).toBe('INV-202703-0002');
    // New financial year — sequence restarts at 0001 under a new counter row.
    expect(c).toBe('INV-202704-0001');

    expect(formatISTFinancialYear(mar2027)).toBe('2026-27');
    expect(formatISTFinancialYear(apr2027)).toBe('2027-28');

    const periods = (
      await prisma.invoiceNumberCounter.findMany({ where: { clinicId }, orderBy: { period: 'asc' } })
    ).map((r) => ({ period: r.period, lastNumber: r.lastNumber }));
    expect(periods).toEqual([
      { period: '2026-27', lastNumber: 2 },
      { period: '2027-28', lastNumber: 1 },
    ]);
  });
});
