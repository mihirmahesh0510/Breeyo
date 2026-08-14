import { MAX_DOCUMENT_NUMBER_LENGTH } from '@breeyo/types';
import { QueueRepository } from '../queue/queue.repository.js';

/**
 * Gap-free document numbering for invoices and credit notes (D-15, D-19, D-38).
 *
 * ## Why a counter row and not a sequence
 *
 * A PostgreSQL `SEQUENCE` does not roll back. A finalize that allocates a
 * number and then fails burns that number permanently, leaving a hole in what
 * CGST Rule 46(b) requires to be a "consecutive serial number". An auditor
 * reads a hole as a suppressed invoice. So the counter lives in an ordinary
 * row and is bumped with `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
 * inside the *caller's* transaction: the row lock serialises concurrent
 * finalizes for the same clinic-and-period, and the increment dies with the
 * transaction if the finalize fails. The cost is that finalizes for one clinic
 * serialise — irrelevant at solo-vet volume.
 *
 * A transaction-scoped advisory lock is deliberately not used: it would
 * serialise without producing the number, so the counter row would still be
 * needed, and `hashtext` collisions would serialise unrelated clinics against
 * each other.
 *
 * ## Reset scope: financial year, not calendar month (D-38)
 *
 * The rendered number keeps D-15's `INV-YYYYMM-XXXX` shape, but the `XXXX`
 * component resets on 1 April (Indian financial year), not on the 1st of every
 * month. Rule 46(b) requires the serial to be unique *for the financial year*,
 * which a per-month reset does not give you. The month component stays in the
 * string for human readability and simply advances within the year:
 *
 *   INV-202701-0001, INV-202703-0002, then INV-202704-0001 after 1 April.
 *
 * The counter row's `period` column is therefore the financial-year key
 * (`2026-27`), not the month — see the doc comment on
 * `InvoiceNumberCounter.period` in `schema.prisma`, which is typed
 * `VarChar(12)` for exactly this reason.
 */

/**
 * `INV` for tax invoices and bills of supply, `CN` for credit notes (D-19),
 * `RCT` for payment receipts (D-13, added by plan 06-09).
 *
 * The Rule 46(b) reasoning above applies to `INV` and `CN`. `RCT` reuses this
 * allocator not because a receipt is a record of account, but because
 * `payment_receipts.receipt_number` is unique per clinic and this is the
 * project's only allocator that is both collision-free under concurrency and
 * rollback-safe — a receipt number burnt by a payment that rolled back would be
 * merely untidy, but a *duplicate* one violates the constraint and fails the
 * write.
 */
export type DocumentType = 'INV' | 'CN' | 'RCT';

/**
 * The subset of a Prisma transaction handle this module needs.
 *
 * Typed structurally rather than as `Prisma.TransactionClient` because the
 * billing services run on the RLS-scoped tenant client, whose transaction
 * handle is `TenantTransactionClient` and is *not* assignable to
 * `Prisma.TransactionClient` (see the note in `lib/prisma-rls.ts` — casting
 * between them would compile while discarding the isolation typing that D-30
 * exists to enforce). Both handles satisfy this interface, and so does a plain
 * test double.
 */
export interface DocumentNumberTransactionClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Reads back the IST calendar date of an instant as `[year, month]`.
 *
 * `QueueRepository.getTodayIST` is the project's single IST helper and is
 * reused here rather than reimplemented. It returns a `Date` whose *instant*
 * is IST midnight — which means its UTC components are shifted back by 5h30m
 * and are NOT the IST date. At 00:30 IST on 1 June 2026 it returns
 * `2026-05-31T18:30:00Z`, whose `getUTCMonth()` is May. Reading UTC components
 * off it would put a 1 June invoice in the May period and, worse, put a 1 April
 * invoice in the previous financial year — silently defeating the D-38 reset.
 *
 * So the IST-midnight instant is formatted back in `Asia/Kolkata` to recover
 * the date it stands for. IST is a fixed +05:30 offset with no DST, so this
 * round-trip is exact.
 */
function istYearAndMonth(now: Date): { year: number; month: number } {
  const istMidnight = QueueRepository.getTodayIST(now);
  const istDate = istMidnight.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [year, month] = istDate.split('-').map(Number);
  return { year, month };
}

/**
 * The `YYYYMM` display component of a document number, in IST.
 *
 * This is presentation only. It does not scope the counter — see
 * {@link formatISTFinancialYear}.
 */
export function formatISTMonthComponent(now: Date): string {
  const { year, month } = istYearAndMonth(now);
  return `${year}${String(month).padStart(2, '0')}`;
}

/**
 * The Indian financial-year key for an instant, in IST: `2026-27` for
 * 1 April 2026 through 31 March 2027 (D-38).
 *
 * This is the counter's reset scope and the value stored in
 * `invoice_number_counters.period`.
 */
export function formatISTFinancialYear(now: Date): string {
  const { year, month } = istYearAndMonth(now);
  // April (4) starts a new financial year; January–March still belong to the
  // year that began the previous April.
  const startYear = month >= 4 ? year : year - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYY}`;
}

/**
 * Allocates the next document number for a clinic, inside the caller's
 * transaction.
 *
 * Takes `tx` rather than reaching for a client of its own: the allocation must
 * commit or roll back with the invoice finalize it belongs to. A module-level
 * client here would make every allocation independently durable and reintroduce
 * exactly the gaps the counter row exists to prevent.
 */
export async function nextDocumentNumber(
  tx: DocumentNumberTransactionClient,
  clinicId: string,
  docType: DocumentType,
  now: Date,
): Promise<string> {
  const period = formatISTFinancialYear(now);
  const monthComponent = formatISTMonthComponent(now);

  // The ON CONFLICT target is the composite primary key
  // @@id([clinicId, docType, period]). DO UPDATE (not DO NOTHING) is what takes
  // the row lock and makes RETURNING always yield a row.
  const rows = await tx.$queryRaw<Array<{ last_number: number | bigint }>>`
    INSERT INTO invoice_number_counters (clinic_id, doc_type, period, last_number)
    VALUES (${clinicId}::uuid, ${docType}, ${period}, 1)
    ON CONFLICT (clinic_id, doc_type, period)
    DO UPDATE SET last_number = invoice_number_counters.last_number + 1
    RETURNING last_number
  `;

  const row = rows[0];
  if (!row) {
    // Unreachable while DO UPDATE is in place, but an empty RETURNING would
    // otherwise surface downstream as an invoice numbered "INV-202605-NaN".
    throw new Error(
      `Document number allocation returned no row for clinic ${clinicId} (${docType}, ${period})`,
    );
  }

  // The driver may hand back `last_number` as a bigint depending on the column
  // type it infers for the RETURNING expression.
  const sequence = Number(row.last_number);

  const documentNumber = `${docType}-${monthComponent}-${String(sequence).padStart(4, '0')}`;

  // Widen past four digits rather than truncate, then fail loudly if the result
  // would breach Rule 46(b)'s sixteen-character ceiling. A clinic that issues
  // more than 99,999 documents of one type in a financial year needs a format
  // decision, not a silently non-compliant invoice.
  if (documentNumber.length > MAX_DOCUMENT_NUMBER_LENGTH) {
    throw new Error(
      `Generated document number "${documentNumber}" is ${documentNumber.length} characters, ` +
        `exceeding the CGST Rule 46(b) limit of ${MAX_DOCUMENT_NUMBER_LENGTH}. ` +
        `Clinic ${clinicId} has exhausted the ${docType} sequence for ${period}.`,
    );
  }

  return documentNumber;
}
