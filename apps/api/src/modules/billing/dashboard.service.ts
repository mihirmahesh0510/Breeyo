import type { BillingDashboardSummary } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { QueueRepository } from '../queue/queue.repository.js';

/**
 * The Billing tab landing aggregate — D-24's four summary cards plus RPT-01's
 * patients-seen-today (D-33), in two database round trips.
 *
 * ## Everything here is bounded by the IST day, never the UTC day
 *
 * UTC midnight is 05:30 IST. Comparing a day-truncated `paid_at` against the
 * server's notion of the current date — the shape the naive version of this
 * query takes, and the one `06-RESEARCH.md` names as the trap — therefore drops
 * every payment taken and every consultation finalized between midnight and
 * 05:30 IST. On a clinic that opens at 08:00 that is harmless; on the
 * early-morning surgery list it silently under-reports the revenue card, and
 * the error disappears by lunchtime, which makes it close to impossible to
 * notice from the symptom.
 *
 * That truncation is doubly wrong because it happens in the *server's*
 * timezone, so the same query gives different answers on a developer's laptop
 * and on an ap-south-1 container. The boundary is passed in as a parameter
 * instead: `QueueRepository.getTodayIST()`, the helper Phase 3 already uses for
 * the queue board, so "today" means one thing across the whole product.
 *
 * (Both of those anti-patterns are named here in prose only. Phase-level grep
 * gates assert that neither SQL construct appears anywhere under
 * `modules/billing/`, and a gate that trips on the comment explaining the trap
 * is worse than no gate — so the literal tokens are deliberately not written.)
 *
 * ## The aggregate is computed by the database
 *
 * Nothing here reads invoice rows in order to sum them in JavaScript. Doing so
 * would cost one row of transfer per invoice the clinic has ever issued, to
 * produce six integers. The aggregate is the database's job.
 *
 * ## Why not one `invoices LEFT JOIN payments`
 *
 * `06-RESEARCH.md`'s Pattern 6 proposes exactly that join, and it
 * **double-counts**: the join produces one row per payment, so
 * `SUM(i.balance_paise)` adds an invoice's balance once for every payment
 * against it. A D-10 split payment is two rows on one invoice, so the Unpaid
 * Total card would report twice the money actually outstanding. The two
 * aggregates are computed over their own tables in independent sub-selects and
 * combined by a cross join of two single-row results, which is still one round
 * trip and cannot duplicate. A test in `dashboard.test.ts` pins this.
 *
 * ## Indexes this relies on
 *
 * | Query                              | Index                                          | Status |
 * |------------------------------------|------------------------------------------------|--------|
 * | outstanding / overdue / exceptions | `invoices (clinic_id, status)`                 | present (06-03) |
 * | invoice list beside these cards    | `invoices (clinic_id, created_at)`             | present (06-03) |
 * | overdue sweep (D-23)               | `invoices (clinic_id, due_date)`               | present (06-03) |
 * | exception count                    | `invoices (clinic_id, exception_flag)`         | present (06-03) |
 * | today's revenue / payment count    | `payments (clinic_id, status, expires_at)`     | present (06-03), serves the `(clinic_id, status)` prefix |
 * | payment history on one invoice     | `payments (invoice_id, paid_at)`               | present (06-03) |
 * | patients seen today (RPT-01)       | `consultations (clinic_id, status, finalized_at)` | **added by this plan** — see `20260814100000_add_consultation_finalized_at_index` |
 *
 * The last one alters a Phase 4 table. `consultations (clinic_id, status)`
 * already existed but stops one column short, leaving the `finalized_at`
 * predicate to a filter over every consultation the clinic has ever finalized.
 *
 * ## Tenant scoping is explicit as well as enforced
 *
 * Both statements name `clinic_id = ${clinicId}::uuid` even though they run on
 * the RLS-bound tenant handle. Raw SQL is exactly where an RLS assumption is
 * least visible to a reader and least likely to be re-checked, and this is an
 * aggregate over every invoice and consultation a clinic has — the widest read
 * in the billing module (T-06-82). The predicate is defence in depth, not a
 * substitute for the policy.
 */

/**
 * The single row query 1 returns. `bigint` on every count is the driver's
 * doing: PostgreSQL `COUNT` is `int8`, and `node-postgres` surfaces `int8` as a
 * JavaScript `bigint` because it does not fit `number` in general. It is
 * defused with `Number(...)` at the boundary below — a `bigint` that reaches
 * `JSON.stringify` throws `TypeError: Do not know how to serialize a BigInt`,
 * which would surface as a 500 on the Billing tab rather than as a type error
 * anywhere near this file.
 *
 * `SUM` over an `int4` column comes back as `int8` too, hence `bigint` on the
 * money fields as well.
 */
interface InvoicePaymentAggregateRow {
  today_revenue: bigint;
  outstanding: bigint;
  overdue_count: bigint;
  payments_today: bigint;
  exception_count: bigint;
}

interface PatientsSeenRow {
  patients_seen_today: bigint;
}

/**
 * Invoice statuses that represent money the clinic is still waiting to collect.
 *
 * `DRAFT` is excluded because it has not been issued to anyone, and `VOIDED`
 * because it has been withdrawn; counting either would overstate the Unpaid
 * Total card. `PAID` is excluded because its balance is zero by definition.
 */
const OUTSTANDING_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] as const;

/**
 * The `Consultation.status` literal written by `EmrRepository.finalizeConsultation`.
 *
 * Lower-case, and deliberately not assumed: `Consultation.status` is a bare
 * `String` column with a `draft` default rather than a Prisma enum, so nothing
 * in the type system would catch `'FINALIZED'` here. It would simply return
 * zero patients seen, every day, silently.
 */
const CONSULTATION_FINALIZED = 'finalized';

export class DashboardService {
  constructor(private readonly prisma: TenantPrismaClient) {}

  async getSummary(clinicId: string): Promise<BillingDashboardSummary> {
    const todayIST = QueueRepository.getTodayIST();

    // Round trip 1 — invoices and payments, each aggregated over its own table.
    // The cross join is of two guaranteed-single-row sub-selects, so it produces
    // exactly one row and cannot fan out the way a row-level join would.
    const rows = await this.prisma.$queryRaw<InvoicePaymentAggregateRow[]>`
      SELECT
        COALESCE(pay.today_revenue, 0)   AS today_revenue,
        COALESCE(pay.payments_today, 0)  AS payments_today,
        COALESCE(inv.outstanding, 0)     AS outstanding,
        COALESCE(inv.overdue_count, 0)   AS overdue_count,
        COALESCE(inv.exception_count, 0) AS exception_count
      FROM
        (
          SELECT
            SUM(balance_paise) FILTER (
              WHERE status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
            ) AS outstanding,
            COUNT(DISTINCT id) FILTER (WHERE status = 'OVERDUE') AS overdue_count,
            COUNT(DISTINCT id) FILTER (
              WHERE exception_flag IS NOT NULL AND exception_resolved_at IS NULL
            ) AS exception_count
          FROM invoices
          WHERE clinic_id = ${clinicId}::uuid
        ) inv
        CROSS JOIN
        (
          SELECT
            SUM(amount_paise) AS today_revenue,
            COUNT(id)         AS payments_today
          FROM payments
          WHERE clinic_id = ${clinicId}::uuid
            -- Only money actually received. A pending link and a failed
            -- attempt are both intentions, not revenue.
            AND status = 'captured'
            -- Parameterised IST midnight, never a server-timezone date
            -- truncation: see the file header. A D-35 late capture against an
            -- already-voided invoice IS
            -- counted here — the cash did arrive — and is surfaced for manual
            -- resolution through exception_count above rather than by being
            -- quietly dropped from the day's takings.
            AND paid_at >= ${todayIST}
        ) pay
    `;

    const row = rows[0];

    // Round trip 2 — RPT-01, against Phase 4 data. COUNT(DISTINCT pet_id) and
    // not COUNT(*): a pet brought back the same day for a second consultation
    // is one patient seen, not two.
    const seen = await this.prisma.$queryRaw<PatientsSeenRow[]>`
      SELECT COALESCE(COUNT(DISTINCT pet_id), 0) AS patients_seen_today
      FROM consultations
      WHERE clinic_id = ${clinicId}::uuid
        AND status = ${CONSULTATION_FINALIZED}
        AND finalized_at >= ${todayIST}
    `;

    return {
      todayRevenuePaise: Number(row?.today_revenue ?? 0),
      unpaidTotalPaise: Number(row?.outstanding ?? 0),
      overdueCount: Number(row?.overdue_count ?? 0),
      recentPaymentsCount: Number(row?.payments_today ?? 0),
      patientsSeenToday: Number(seen[0]?.patients_seen_today ?? 0),
      billingExceptionCount: Number(row?.exception_count ?? 0),
    };
  }
}

export { OUTSTANDING_STATUSES };
