import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  createTestInvoice,
  createTestWebhookEvent,
  prisma,
} from '../helpers/factories.js';
import { createTenantClient } from '../../src/lib/prisma-rls.js';

/**
 * Database-shape assertions for the Phase 6 billing schema (plan 06-03).
 *
 * Every assertion below is deliberately made against the DATABASE, not against
 * TypeScript. `information_schema` and `pg_tables` are the only witnesses that
 * can distinguish "the Prisma model says Int" from "the column really is
 * INTEGER", and a type-level assertion would pass even against a database that
 * had never had the migration applied. These are the facts a GST audit, a
 * duplicate webhook delivery and a cross-tenant read actually collide with.
 */

/** The ten tables created by plan 06-03. */
const BILLING_TABLES = [
  'invoices',
  'invoice_line_items',
  'payments',
  'payment_receipts',
  'refunds',
  'credit_notes',
  'credit_note_line_items',
  'invoice_number_counters',
  'webhook_events',
  'billing_audit_log',
] as const;

/** Money-bearing tables — `invoice_number_counters` holds no money. */
const MONEY_TABLES = BILLING_TABLES.filter(
  (t) => t !== 'invoice_number_counters' && t !== 'billing_audit_log',
);

let userA: Awaited<ReturnType<typeof createTestUser>>;
let clinicA: Awaited<ReturnType<typeof createTestClinic>>;
let clinicB: Awaited<ReturnType<typeof createTestClinic>>;

beforeAll(async () => {
  await cleanupTestData();
  userA = await createTestUser();
  clinicA = await createTestClinic(userA.id);
  clinicB = await createTestClinic(userA.id);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('Phase 6 billing schema shape', () => {
  it('stores every money column as integer paise, never a floating or decimal type', async () => {
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string; data_type: string }>
    >`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY(${MONEY_TABLES as unknown as string[]})
        AND column_name LIKE '%\\_paise'
    `;

    // Sanity floor: if the migration silently created no money columns at all,
    // an "every column is integer" assertion would vacuously pass.
    expect(columns.length).toBeGreaterThan(30);

    const nonInteger = columns.filter((c) => c.data_type !== 'integer');
    expect(nonInteger).toEqual([]);

    // Explicitly name the types that would silently corrupt money.
    const forbidden = columns.filter((c) =>
      ['numeric', 'double precision', 'real', 'money'].includes(c.data_type),
    );
    expect(forbidden).toEqual([]);
  });

  it('permits at most one DRAFT invoice per consultation, but allows a VOIDED one alongside it', async () => {
    const owner = await createTestPetOwner(clinicA.id);
    const pet = await createTestPet(clinicA.id, owner.id);
    const consultation = await createTestConsultation(
      clinicA.id,
      pet.id,
      userA.id,
    );

    await createTestInvoice(clinicA.id, userA.id, {
      consultationId: consultation.id,
      status: 'DRAFT',
    });

    // T-06-10: a double tap on "End Consultation", or a client retry after a
    // timeout, must not produce a second draft.
    await expect(
      createTestInvoice(clinicA.id, userA.id, {
        consultationId: consultation.id,
        status: 'DRAFT',
      }),
    ).rejects.toThrow();

    // The index is partial precisely so history still fits: a voided invoice
    // for the same consultation is legitimate.
    const voided = await createTestInvoice(clinicA.id, userA.id, {
      consultationId: consultation.id,
      status: 'VOIDED',
    });
    expect(voided.id).toBeDefined();
  });

  it('rejects a duplicate Razorpay webhook event id', async () => {
    const eventId = `evt_${Date.now()}_dup`;

    await createTestWebhookEvent(clinicA.id, { eventId });

    // T-06-09: Razorpay documents duplicate delivery. Without this constraint a
    // redelivered payment.captured would mark the invoice paid twice.
    await expect(
      createTestWebhookEvent(clinicA.id, { eventId }),
    ).rejects.toThrow();
  });

  it('scopes invoice-number uniqueness to the clinic, not globally', async () => {
    const invoiceNumber = `INV-202608-0001`;

    await createTestInvoice(clinicA.id, userA.id, { invoiceNumber });

    // T-06-12: reusing a number inside one clinic breaks Rule 46(b)
    // consecutiveness.
    await expect(
      createTestInvoice(clinicA.id, userA.id, { invoiceNumber }),
    ).rejects.toThrow();

    // ...but two different clinics both legitimately start at 0001.
    const otherClinic = await createTestInvoice(clinicB.id, userA.id, {
      invoiceNumber,
    });
    expect(otherClinic.invoiceNumber).toBe(invoiceNumber);
  });

  it('has row-level security enabled and FORCEd on all ten billing tables', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ tablename: string; rowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT t.tablename, t.rowsecurity, c.relforcerowsecurity
      FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
      WHERE t.schemaname = 'public'
        AND t.tablename = ANY(${BILLING_TABLES as unknown as string[]})
    `;

    expect(rows).toHaveLength(BILLING_TABLES.length);

    // FORCE matters as much as ENABLE: without it the policies do not apply to
    // the table owner, and the migration role owns every one of these tables.
    const unsecured = rows.filter(
      (r) => !r.rowsecurity || !r.relforcerowsecurity,
    );
    expect(unsecured).toEqual([]);
  });

  it('hides another clinic\'s invoices from a tenant-scoped client', async () => {
    const marker = `CROSS-TENANT-${Date.now()}`;
    await createTestInvoice(clinicB.id, userA.id, { notes: marker });

    // T-06-06: reading another clinic's invoices is reading their books.
    const tenantA = createTenantClient(clinicA.id);
    const visibleToA = await tenantA.invoice.findMany({
      where: { notes: marker },
    });
    expect(visibleToA).toEqual([]);

    const tenantB = createTenantClient(clinicB.id);
    const visibleToB = await tenantB.invoice.findMany({
      where: { notes: marker },
    });
    expect(visibleToB).toHaveLength(1);
  });
});
