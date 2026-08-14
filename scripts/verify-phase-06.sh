#!/usr/bin/env bash
#
# verify-phase-06.sh -- the Phase 6 (Invoicing & Payments) close-out gate.
#
# Three classes of failure survive per-plan verification, and this script exists
# for exactly those three:
#
#   1. A requirement with tests in two plans and coverage in neither. Every one
#      of the eight Phase 6 requirements (plus the inherited PLT-04) is named
#      here and mapped to the specific test invocation that proves it. A
#      requirement with no passing named test is reported FAIL, not "assumed".
#
#   2. A phase-wide invariant that no single plan owns -- "no float money
#      anywhere", "no route uses the admin client", "every billing table has
#      RLS". Each is asserted here over the whole tree rather than piecemeal.
#
#   3. A gate that cannot fail. Every grep-based invariant below strips comment
#      lines before counting, so neither this script's prose nor an explanatory
#      comment in the scanned source can satisfy or break it. The float-money
#      gate is demonstrated to actually fail -- see 06-19-VERIFICATION.md, which
#      records the observed output of introducing `(1.5).toFixed(2)` into
#      money.ts.
#
# Usage:
#   bash scripts/verify-phase-06.sh                 # requirements + invariants, stop at first failure
#   bash scripts/verify-phase-06.sh --all           # run every check, then report
#   bash scripts/verify-phase-06.sh --static-only   # skip everything needing a database or a network
#   bash scripts/verify-phase-06.sh --skip-suite    # skip only the `pnpm test` step (CI already runs it)
#
# Environment:
#   DATABASE_URL          Postgres URL for the migrated + RLS-configured
#                         database. Read from apps/api/.env when unset.
#   SHADOW_DATABASE_URL   A SEPARATE, disposable database. Required for
#                         INV-SYNC, which replays the migration set into it --
#                         Prisma RESETS whatever it is given, so this must
#                         never point at a database you care about. INV-SYNC
#                         is skipped rather than guessed when it is unset.
#   PGCONTAINER    Docker container running Postgres, used only when `psql` is
#                  not on PATH (local development). Default: breeyo-postgres-1.
#
# Exit: 0 when every requirement and every invariant passes, 1 otherwise.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FAIL_FAST=1
STATIC_ONLY=0
SKIP_SUITE=0

for arg in "$@"; do
  case "$arg" in
    --all) FAIL_FAST=0 ;;
    --static-only) STATIC_ONLY=1 ;;
    --skip-suite) SKIP_SUITE=1 ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

PGCONTAINER="${PGCONTAINER:-breeyo-postgres-1}"

# ─── Result accounting ──────────────────────────────────────────────────────

RESULT_IDS=()
RESULT_STATES=()
RESULT_NOTES=()
FAILURES=0

record() { # record <id> <PASS|FAIL|SKIP> <note>
  RESULT_IDS+=("$1")
  RESULT_STATES+=("$2")
  RESULT_NOTES+=("$3")
  if [ "$2" = "FAIL" ]; then
    FAILURES=$((FAILURES + 1))
    echo
    echo "!!! FAILED: $1 -- $3"
    echo
    if [ "$FAIL_FAST" -eq 1 ]; then
      summary
      exit 1
    fi
  fi
}

summary() {
  echo
  echo "════════════════════════════════════════════════════════════════════════"
  echo " Phase 06 -- Invoicing & Payments : gate summary"
  echo "════════════════════════════════════════════════════════════════════════"
  printf ' %-20s %-6s %s\n' "CHECK" "RESULT" "EVIDENCE"
  printf ' %-20s %-6s %s\n' "--------------------" "------" "--------------------------------------"
  local i
  for i in "${!RESULT_IDS[@]}"; do
    printf ' %-20s %-6s %s\n' "${RESULT_IDS[$i]}" "${RESULT_STATES[$i]}" "${RESULT_NOTES[$i]}"
  done
  echo "════════════════════════════════════════════════════════════════════════"
  if [ "$FAILURES" -eq 0 ]; then
    echo " ALL CHECKS PASSED"
  else
    echo " $FAILURES CHECK(S) FAILED"
  fi
  echo
}

section() {
  echo
  echo "── $* ──────────────────────────────────────────" | cut -c1-78
}

# ─── Helpers ────────────────────────────────────────────────────────────────

# Strip comment-only hits from `grep -rn` output (`path:line:code`). Without
# this, a gate whose forbidden token appears in its own explanatory comment --
# or in a test asserting the token's absence -- reports a violation that is not
# one, and the usual response is to weaken the gate. T-06-125.
strip_comment_hits() {
  grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*|#)' || true
}

# Same idea for a plain file stream (no path:line prefix), used on schema.prisma.
strip_comment_lines() {
  grep -vE '^[[:space:]]*(//|\*|/\*|#)' || true
}

run_psql() { # run_psql <sql> -> prints the single scalar result
  local sql="$1"
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -tAc "$sql"
  else
    # Local development: no libpq client on the host, Postgres in a container.
    docker exec "$PGCONTAINER" psql -U "$PGUSER_FALLBACK" -d "$PGDB_FALLBACK" -tAc "$sql"
  fi
}

API_TEST=(pnpm --filter @breeyo/api exec vitest run)
MOBILE_TEST=(pnpm --filter @breeyo/mobile exec vitest run)

# `apps/api`'s package `test` script is bare `vitest`, i.e. watch mode, so
# `pnpm --filter @breeyo/api test -- <file>` never exits (deferred item 7).
# Invoking `vitest run` directly is the same suite with a terminating runner.
api_test() { # api_test <file> [-t <name>]
  "${API_TEST[@]}" "$@"
}
mobile_test() {
  "${MOBILE_TEST[@]}" "$@"
}

# Run a requirement's test invocations. Every invocation must exit 0 AND report
# at least one passing test -- a filter that matches nothing exits 0 in some
# runner configurations, which would make the named `-t` sub-checks vacuous.
LAST_TEST_COUNT=0
run_named() { # run_named <label> <runner-fn> <args...>
  local label="$1"; shift
  local runner="$1"; shift
  local out rc
  echo "  -> $label"
  out="$("$runner" "$@" 2>&1)"
  rc=$?
  # "Tests  123 passed (123)" / "Tests  4 passed | 1 skipped (5)"
  # Vitest emits ANSI color codes even when stdout is captured (observed on
  # GitHub Actions runners), which land between "Tests" and the count and
  # break a plain-text match. Strip them before applying the regex.
  local plain
  plain="$(printf '%s\n' "$out" | sed -E $'s/\x1b\\[[0-9;]*[a-zA-Z]//g')"
  LAST_TEST_COUNT="$(printf '%s\n' "$plain" | grep -oE '^[[:space:]]*Tests[[:space:]]+[0-9]+ passed' | grep -oE '[0-9]+' | tail -1)"
  LAST_TEST_COUNT="${LAST_TEST_COUNT:-0}"
  if [ "$rc" -ne 0 ]; then
    printf '%s\n' "$out" | tail -40
    return 1
  fi
  if [ "$LAST_TEST_COUNT" -eq 0 ]; then
    echo "     no test matched -- a filter that selects nothing proves nothing"
    printf '%s\n' "$out" | tail -20
    return 1
  fi
  echo "     $LAST_TEST_COUNT passing"
  return 0
}

# ─── Environment ────────────────────────────────────────────────────────────

if [ "$STATIC_ONLY" -eq 0 ]; then
  if [ -z "${DATABASE_URL:-}" ] && [ -f apps/api/.env ]; then
    # shellcheck disable=SC2046
    export $(grep -E '^(DATABASE_URL|DATABASE_URL_APP|SHADOW_DATABASE_URL)=' apps/api/.env | xargs -0 echo | tr '\n' ' ') 2>/dev/null || true
    DATABASE_URL="$(grep -E '^DATABASE_URL=' apps/api/.env | head -1 | cut -d= -f2-)"
    export DATABASE_URL
  fi
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is unset and apps/api/.env has none." >&2
    echo "Set it, or re-run with --static-only to skip the database-backed checks." >&2
    exit 2
  fi
  # Parse user/database out of the URL for the docker-exec fallback path.
  PGUSER_FALLBACK="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://([^:]+):.*#\1#')"
  PGDB_FALLBACK="$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"

  # The API runs two connections: DATABASE_URL (breeyo_admin, migrations and
  # the invariant queries below) and DATABASE_URL_APP (breeyo_app, the
  # RLS-enforced handle every request uses). They must name the SAME database.
  #
  # Overriding only DATABASE_URL on the command line -- the natural thing to do
  # when pointing the gate at a scratch database -- leaves DATABASE_URL_APP on
  # whatever `apps/api/.env` says. The invariant gates then pass against the
  # scratch database while every request-path test runs against the old one,
  # and seven requirements fail with errors that look like product bugs. Caught
  # once while building this gate; checked here so nobody has to diagnose it.
  if [ -z "${DATABASE_URL_APP:-}" ] && [ -f apps/api/.env ]; then
    DATABASE_URL_APP="$(grep -E '^DATABASE_URL_APP=' apps/api/.env | head -1 | cut -d= -f2-)"
    export DATABASE_URL_APP
  fi
  if [ -n "${DATABASE_URL_APP:-}" ]; then
    APPDB="$(printf '%s' "$DATABASE_URL_APP" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
    if [ "$APPDB" != "$PGDB_FALLBACK" ]; then
      echo "DATABASE_URL and DATABASE_URL_APP name different databases:" >&2
      echo "  DATABASE_URL     -> $PGDB_FALLBACK" >&2
      echo "  DATABASE_URL_APP -> $APPDB" >&2
      echo "The invariant gates would check one database while the request-path" >&2
      echo "tests run against the other. Export both, or neither." >&2
      exit 2
    fi
  fi
fi

echo "Phase 06 gate -- repo: $REPO_ROOT"
[ "$STATIC_ONLY" -eq 0 ] && echo "               db:   ${PGDB_FALLBACK:-?}"

# ════════════════════════════════════════════════════════════════════════════
# PART 1 -- Requirements. One named test invocation per requirement.
# ════════════════════════════════════════════════════════════════════════════

if [ "$STATIC_ONLY" -eq 1 ]; then
  for req in BIL-01 BIL-02 BIL-03 BIL-04 BIL-05 BIL-06 BIL-07 RPT-01 PLT-04; do
    record "$req" SKIP "--static-only: requirement tests need a database"
  done
else

section "BIL-01  invoice generated from consultation services + dispensed items"
n=0
ok=1
run_named "invoice-create.test.ts" api_test tests/billing/invoice-create.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
run_named "invoice-create.test.ts -t 'idempotent'" api_test tests/billing/invoice-create.test.ts -t "idempotent" || ok=0
run_named "consultation-draft-hook.test.ts" api_test tests/billing/consultation-draft-hook.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
[ "$ok" -eq 1 ] && record BIL-01 PASS "$n tests" || record BIL-01 FAIL "named test failed or matched nothing"

section "BIL-02  real-time stock validation before finalizing (and no double deduction)"
n=0
ok=1
run_named "finalize-stock.test.ts" api_test tests/billing/finalize-stock.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
# The three sub-filters are not decoration. `concurrent` is the oversell guard;
# `does not deduct` and `mixed provenance` are the no-double-deduction
# guarantee on the phase's primary invoice path (T-06-143). A BIL-02 that
# passes `concurrent` but fails `does not deduct` means inventory is silently
# corrupted every time a consultation is billed, so their absence is a FAIL
# rather than a coverage gap.
run_named "finalize-stock.test.ts -t 'concurrent'" api_test tests/billing/finalize-stock.test.ts -t "concurrent" || ok=0
run_named "finalize-stock.test.ts -t 'does not deduct'" api_test tests/billing/finalize-stock.test.ts -t "does not deduct" || ok=0
run_named "finalize-stock.test.ts -t 'mixed provenance'" api_test tests/billing/finalize-stock.test.ts -t "mixed provenance" || ok=0
run_named "quick-sale.test.ts" api_test tests/billing/quick-sale.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
run_named "invoice.service.test.ts -t 'stock plan'" api_test src/modules/billing/__tests__/invoice.service.test.ts -t "stock plan" || ok=0
[ "$ok" -eq 1 ] && record BIL-02 PASS "$n tests (incl. concurrent / does-not-deduct / mixed-provenance)" || record BIL-02 FAIL "stock validation or no-double-deduction test failed"

section "BIL-03  mark invoices paid or unpaid"
n=0
ok=1
run_named "invoice-state.test.ts" api_test src/modules/billing/__tests__/invoice-state.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
run_named "invoice-lock.test.ts" api_test tests/billing/invoice-lock.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
[ "$ok" -eq 1 ] && record BIL-03 PASS "$n tests" || record BIL-03 FAIL "state machine or D-21 immutability test failed"

section "BIL-04  print or export invoice as PDF"
n=0
ok=1
run_named "invoice-template.test.ts" mobile_test src/features/pdf/__tests__/invoice-template.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
run_named "receipt-credit-note-template.test.ts" mobile_test src/features/pdf/__tests__/receipt-credit-note-template.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
[ "$ok" -eq 1 ] && record BIL-04 PASS "$n tests" || record BIL-04 FAIL "PDF template test failed"

section "BIL-05  accept payment via Razorpay (UPI and card)"
n=0
ok=1
run_named "payment.service.test.ts" api_test src/modules/billing/__tests__/payment.service.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
run_named "payment.test.ts" api_test tests/billing/payment.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
[ "$ok" -eq 1 ] && record BIL-05 PASS "$n tests (SDK mocked -- see 06-19-VERIFICATION.md flow 5)" || record BIL-05 FAIL "payment link test failed"

section "BIL-06  payment confirmation updates invoice status via webhook"
n=0
ok=1
run_named "webhook.test.ts" api_test tests/billing/webhook.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
run_named "webhook.test.ts -t 'invalid signature'" api_test tests/billing/webhook.test.ts -t "invalid signature" || ok=0
run_named "webhook.test.ts -t 'idempotent'" api_test tests/billing/webhook.test.ts -t "idempotent" || ok=0
run_named "webhook.test.ts -t 'latency'" api_test tests/billing/webhook.test.ts -t "latency" || ok=0
[ "$ok" -eq 1 ] && record BIL-06 PASS "$n tests (incl. invalid-signature / idempotent / latency)" || record BIL-06 FAIL "webhook signature, idempotency or latency test failed"

section "BIL-07  GST-compliant invoicing (CGST/SGST/IGST + HSN/SAC)"
n=0
ok=1
run_named "gst.service.test.ts" api_test src/modules/billing/__tests__/gst.service.test.ts || ok=0
n=$((n + LAST_TEST_COUNT))
for filter in "inter-state" "rounding" "document type" "unregistered" "pro-rata"; do
  run_named "gst.service.test.ts -t '$filter'" api_test src/modules/billing/__tests__/gst.service.test.ts -t "$filter" || ok=0
done
[ "$ok" -eq 1 ] && record BIL-07 PASS "$n tests (incl. inter-state / rounding / document-type / unregistered / pro-rata)" || record BIL-07 FAIL "GST engine test failed"

section "RPT-01  billing dashboard daily summary"
ok=1
run_named "dashboard.test.ts" api_test tests/billing/dashboard.test.ts || ok=0
[ "$ok" -eq 1 ] && record RPT-01 PASS "$LAST_TEST_COUNT tests" || record RPT-01 FAIL "dashboard test failed"

section "PLT-04  (inherited) clinic A cannot read clinic B's billing data"
ok=1
run_named "tenant-isolation.test.ts" api_test tests/tenant-isolation.test.ts || ok=0
[ "$ok" -eq 1 ] && record PLT-04 PASS "$LAST_TEST_COUNT tests" || record PLT-04 FAIL "cross-tenant isolation test failed"

fi # STATIC_ONLY

# ════════════════════════════════════════════════════════════════════════════
# PART 2 -- Phase-wide invariants.
# ════════════════════════════════════════════════════════════════════════════

section "INV-MONEY  no float money in the billing surface"
# Comment-stripped: `money.ts` and `gst.service.ts` both discuss floats at
# length in their headers, and an unfiltered grep would trip on the very
# documentation that explains why the rule exists.
hits="$(grep -rn 'toFixed' apps/api/src/modules/billing/ packages/types/src/billing.ts 2>/dev/null | strip_comment_hits)"
hits2="$(grep -rnE 'parseFloat|Number\(.*Paise' apps/api/src/modules/billing/gst.service.ts apps/api/src/modules/billing/money.ts 2>/dev/null | strip_comment_hits)"
if [ -n "$hits$hits2" ]; then
  printf '%s\n%s\n' "$hits" "$hits2" | grep -v '^$'
  record INV-MONEY FAIL "toFixed / parseFloat / Number(...Paise) in money-carrying code"
else
  record INV-MONEY PASS "no toFixed, parseFloat or Number(...Paise) outside comments"
fi

section "INV-SCHEMA-MONEY  no Decimal or Float money column in the Phase 6 models"
# The range is anchored on the *models* banner, not the Clinic model's
# "Phase 6 billing settings" sub-heading: anchoring on the earlier marker sweeps
# in Phase 3's `Pet.weight Float?`, which is a body weight, not money, and would
# fail this gate forever for the wrong reason.
# Decimal survives in the Phase 6 range only as a tax *rate*
# (`gstRatePercent Decimal(5,2)`), which the `[Pp]aise` qualifier excludes.
if ! grep -q '─── Phase 6: Invoicing & Payments' apps/api/prisma/schema.prisma; then
  record INV-SCHEMA-MONEY FAIL "the Phase 6 models banner is gone from schema.prisma -- the range anchor is broken and this gate would scan nothing"
else
  count="$(awk '/─── Phase 6: Invoicing & Payments/,0' apps/api/prisma/schema.prisma | strip_comment_lines | grep -Ec 'Decimal.*[Pp]aise|Float')"
  if [ "$count" -ne 0 ]; then
    awk '/─── Phase 6: Invoicing & Payments/,0' apps/api/prisma/schema.prisma | strip_comment_lines | grep -nE 'Decimal.*[Pp]aise|Float'
    record INV-SCHEMA-MONEY FAIL "$count Decimal-paise or Float column(s) in the Phase 6 models"
  else
    record INV-SCHEMA-MONEY PASS "0 Decimal-paise / Float columns in the Phase 6 models"
  fi
fi

section "INV-NO-CLIENT-TOTAL  no client-supplied total on the wire"
# A schema that accepts a total is a schema that lets a client set the price.
hits="$(grep -rnE '(subtotalPaise|grandTotalPaise|cgstPaise|sgstPaise|igstPaise|taxableValuePaise)' packages/validators/src/billing.ts 2>/dev/null | strip_comment_hits)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  record INV-NO-CLIENT-TOTAL FAIL "a request schema accepts a server-computed money field"
else
  record INV-NO-CLIENT-TOTAL PASS "no total, tax or taxable-value field in any request schema"
fi

section "INV-TENANT  no admin Prisma client in a clinic-scoped route"
if bash scripts/check-tenant-client.sh; then
  record INV-TENANT PASS "check-tenant-client.sh (D-30) clean"
else
  record INV-TENANT FAIL "a clinic-scoped route or controller builds from the RLS-bypassing admin client"
fi

section "INV-SOCKET  no global Socket.IO emit on billing data"
# `io.emit` broadcasts to every connected socket regardless of clinic room, so
# one clinic's invoice total would land on another clinic's device.
hits="$(grep -rnE '\bio\.emit\(' apps/api/src/modules/billing/ apps/api/src/jobs/expire-payment-links.ts 2>/dev/null | strip_comment_hits)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  record INV-SOCKET FAIL "an ungated io.emit() on billing data"
else
  record INV-SOCKET PASS "every billing emit is room-scoped"
fi

section "INV-SECRET  no Razorpay credential in client-shipped code"
# T-06-129. Test files are excluded because the two matches there are
# `expect(...).not.toMatch(/key_secret/)` -- assertions that the credential is
# absent. Including them would make the gate trip on the very tests that
# enforce it. Everything a device actually ships is scanned.
hits="$(grep -rnE 'rzp_(test|live)|razorpayKeySecretEnc|key_secret' \
          apps/mobile/src/ packages/types/src/ \
          --include='*.ts' --include='*.tsx' \
          --exclude-dir=__tests__ --exclude='*.test.ts' --exclude='*.test.tsx' \
          2>/dev/null | strip_comment_hits)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  record INV-SECRET FAIL "a Razorpay credential identifier reaches client-shipped code"
else
  record INV-SECRET PASS "apps/mobile/src and packages/types carry no credential identifier"
fi

section "INV-GST-SLABS  GST 2.0 slabs are exactly 0 / 5 / 18 / 40"
# The retired 12% and 28% slabs are deliberately absent (GST 2.0, 22 Sep 2025).
# A stale slab list would let a clinic charge a rate that no longer exists.
if ! grep -q 'GST_RATE_SLABS' packages/types/src/constants/gst.ts; then
  record INV-GST-SLABS FAIL "GST_RATE_SLABS is not exported from packages/types/src/constants/gst.ts"
else
  tuple="$(grep -oE '\[[[:space:]]*0[^]]*\][[:space:]]*as const' packages/types/src/constants/gst.ts | head -1 | tr -d ' ')"
  if [ "$tuple" = "[0,5,18,40]asconst" ]; then
    record INV-GST-SLABS PASS "[0, 5, 18, 40]"
  else
    echo "observed: $tuple"
    record INV-GST-SLABS FAIL "slab tuple is not [0, 5, 18, 40]"
  fi
fi

if [ "$STATIC_ONLY" -eq 1 ]; then
  record INV-SYNC SKIP "--static-only"
  record INV-TRGM SKIP "--static-only"
  record INV-RLS  SKIP "--static-only"
else

section "INV-SYNC  the migration set alone reproduces schema.prisma"
# Deliberately NOT `prisma db push`.
#
# `post-migrate.sql` creates four pg_trgm GIN indexes that are intentionally
# absent from schema.prisma. `prisma db push` reads them as drift and DROPS
# them -- observed directly while building this gate: one `db push` against a
# correctly-provisioned database took `pg_indexes WHERE indexname LIKE '%trgm%'`
# from 4 to 0, silently removing the patient- and inventory-search indexes. The
# second `db push` then printed "The database is already in sync", which is how
# a destructive run can be mistaken for a clean bill of health.
#
# `migrate diff --exit-code` is read-only and asserts the stronger, correct
# claim: that the migration set ALONE reproduces schema.prisma from empty. This
# is the same claim CI makes, and for the same reason.
#
# `--from-migrations` replays the migration set into a shadow database, and
# Prisma RESETS whatever it is pointed at to do so. Defaulting the shadow URL to
# DATABASE_URL -- the obvious-looking fallback -- would therefore drop every
# table in the database being verified, mid-run. There is no safe default, so
# an absent or identical shadow URL is a SKIP with instructions, never a
# silent substitution.
if [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  record INV-SYNC SKIP "SHADOW_DATABASE_URL unset -- --from-migrations RESETS the database it is given, so there is no safe default (INV-TRGM still covers live-db drift)"
elif [ "${SHADOW_DATABASE_URL}" = "${DATABASE_URL}" ]; then
  record INV-SYNC FAIL "SHADOW_DATABASE_URL equals DATABASE_URL -- running this check would reset the database under verification"
elif ( cd apps/api && npx --no-install prisma migrate diff \
        --from-migrations prisma/migrations \
        --to-schema-datamodel prisma/schema.prisma \
        --shadow-database-url "$SHADOW_DATABASE_URL" \
        --exit-code ); then
  record INV-SYNC PASS "migrations reproduce schema.prisma exactly"
else
  record INV-SYNC FAIL "the migration set does not reproduce schema.prisma"
fi

section "INV-TRGM  the live database differs from schema.prisma ONLY by the four pg_trgm indexes"
# The live-database direction cannot simply be `--exit-code`, because a properly
# provisioned database HAS the four unmodelled GIN indexes and therefore always
# reports drift. Asserting "no drift" here would mean asserting that
# post-migrate.sql was never run.
#
# So the assertion is exact instead of absent: the drift must be precisely those
# four indexes and nothing else. That fails in both directions -- a real schema
# change shows up as an extra line, and a `db push` that dropped the indexes
# shows up as missing lines plus a zero index count below.
drift="$( cd apps/api && npx --no-install prisma migrate diff \
            --from-schema-datasource prisma/schema.prisma \
            --to-schema-datamodel prisma/schema.prisma 2>&1 )"
unexplained="$(printf '%s\n' "$drift" \
  | grep -vE '^[[:space:]]*$' \
  | grep -vE '^\[\*\] Changed the `(pet_owners|pets|inventory_items)` table$' \
  | grep -vE '^[[:space:]]+\[-\] Removed index on columns \((name|mobile)\)$' \
  | grep -vE '^No difference detected\.$' || true)"
trgm_count="$(run_psql "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_pet_owner_name_trgm','idx_pet_owner_mobile_trgm','idx_pet_name_trgm','idx_inventory_item_name_trgm')" | tr -d '[:space:]')"
if [ -n "$unexplained" ]; then
  printf '%s\n' "$unexplained"
  record INV-TRGM FAIL "the live database differs from schema.prisma by something other than the four pg_trgm indexes"
elif [ "$trgm_count" != "4" ]; then
  record INV-TRGM FAIL "only $trgm_count of 4 pg_trgm GIN indexes exist -- run apps/api/prisma/post-migrate.sql (a prior \`prisma db push\` drops them)"
else
  record INV-TRGM PASS "4/4 pg_trgm indexes present; no other drift"
fi

section "INV-RLS  every billing table has row-level security enabled"
BILLING_TABLES="'invoices','invoice_line_items','payments','payment_receipts','refunds','credit_notes','credit_note_line_items','invoice_number_counters','webhook_events','billing_audit_log'"
present="$(run_psql "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ($BILLING_TABLES)" | tr -d '[:space:]')"
unprotected="$(run_psql "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity=false AND tablename IN ($BILLING_TABLES)" | tr -d '[:space:]')"
# A gate that scans nothing always passes: assert all ten tables are present
# before believing that zero of them are unprotected.
if [ "$present" != "10" ]; then
  record INV-RLS FAIL "only $present of 10 billing tables exist in the database"
elif [ "$unprotected" != "0" ]; then
  run_psql "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false AND tablename IN ($BILLING_TABLES)"
  record INV-RLS FAIL "$unprotected billing table(s) without RLS"
else
  record INV-RLS PASS "10/10 billing tables with rowsecurity=true"
fi

fi # STATIC_ONLY

# ════════════════════════════════════════════════════════════════════════════
# PART 3 -- Whole-workspace gates.
# ════════════════════════════════════════════════════════════════════════════

if [ "$SKIP_SUITE" -eq 1 ] || [ "$STATIC_ONLY" -eq 1 ]; then
  record SUITE SKIP "--skip-suite / --static-only (CI runs the same suite in its own step)"
else

section "SUITE  pnpm test across the workspace"
# `CI=true` is a guard, not a preference. Vitest only runs one-shot when it
# believes it is in CI or is told `run`; a package whose `test` script is bare
# `vitest` starts an interactive watch session that never exits, and turbo
# happily waits for it forever. `apps/api` was exactly that outlier until this
# plan fixed it (deferred item 7). Setting CI here means a future regression to
# a bare `vitest` script degrades to "runs once" rather than "the phase gate
# hangs and someone kills it after ten minutes and calls the suite flaky".
if CI=true pnpm test; then
  record SUITE PASS "every workspace suite green"
else
  record SUITE FAIL "pnpm test is red"
fi

fi # SKIP_SUITE (the workspace suite only -- the typechecks below always run)

# The typechecks and the Expo dependency check are seconds each, and the mobile
# baseline is the only place a new Phase 6 typecheck error is caught at all, so
# they are not covered by --skip-suite.
if [ "$STATIC_ONLY" -eq 1 ]; then
  record TSC-API    SKIP "--static-only"
  record TSC-MOBILE SKIP "--static-only"
  record EXPO-DEPS  SKIP "--static-only"
else

section "TSC-API  apps/api typecheck"
if pnpm --filter @breeyo/api exec tsc --noEmit; then
  record TSC-API PASS "0 errors"
else
  record TSC-API FAIL "apps/api does not typecheck"
fi

section "TSC-MOBILE  apps/mobile typecheck, Phase 6 surface"
# The whole-app mobile typecheck has never exited 0. It carries ~60 errors owned
# by Phases 1-5 and by `packages/ui` (deferred-items.md, "apps/mobile typecheck
# does not exit 0"), none of which this phase introduced or may fix under the
# executor scope boundary. Asserting the whole-app count here would produce a
# gate that can only ever be red, which is the same as no gate.
#
# What is asserted instead is falsifiable in both directions: the number of
# errors inside the Phase 6 mobile surface must equal the recorded baseline.
# A new Phase 6 error pushes it above the baseline and fails; fixing the known
# one pushes it below and fails too, telling you to lower the baseline rather
# than letting the allowance rot.
#
# Baseline 1, and the single error is named:
#   src/features/pdf/__tests__/pdf-deps.test.ts(74,39) TS1470
#   `import.meta` in a file the NodeNext resolver treats as CJS because
#   apps/mobile/package.json has no `"type": "module"`. Test-file only; the
#   test itself passes under Vitest, which is ESM. Carried forward.
PHASE6_MOBILE_BASELINE=1
PHASE6_MOBILE_PATHS='^(src/features/billing/|src/features/pdf/|app/\(app\)/billing/|app/\(app\)/\(tabs\)/billing\.tsx)'
tsc_out="$(pnpm --filter @breeyo/mobile exec tsc --noEmit 2>&1)"
phase6_errors="$(printf '%s\n' "$tsc_out" | grep -E 'error TS' | grep -E "$PHASE6_MOBILE_PATHS" || true)"
phase6_count="$(printf '%s\n' "$phase6_errors" | grep -c 'error TS' || true)"
total_count="$(printf '%s\n' "$tsc_out" | grep -c 'error TS' || true)"
echo "  whole-app errors: $total_count (pre-existing, owned by Phases 1-5 and packages/ui)"
echo "  Phase 6 errors:   $phase6_count (baseline $PHASE6_MOBILE_BASELINE)"
[ -n "$phase6_errors" ] && printf '%s\n' "$phase6_errors" | sed 's/^/    /'
if [ "$phase6_count" -eq "$PHASE6_MOBILE_BASELINE" ]; then
  record TSC-MOBILE PASS "$phase6_count Phase 6 error(s) = baseline; $total_count pre-existing app-wide"
elif [ "$phase6_count" -lt "$PHASE6_MOBILE_BASELINE" ]; then
  record TSC-MOBILE FAIL "$phase6_count Phase 6 errors is BELOW the baseline of $PHASE6_MOBILE_BASELINE -- a known error was fixed; lower PHASE6_MOBILE_BASELINE in this script"
else
  record TSC-MOBILE FAIL "$phase6_count Phase 6 errors exceeds the baseline of $PHASE6_MOBILE_BASELINE -- a new one was introduced"
fi

section "EXPO-DEPS  native modules match the installed Expo SDK"
if ( cd apps/mobile && npx --no-install expo install --check ); then
  record EXPO-DEPS PASS "dependencies up to date"
else
  record EXPO-DEPS FAIL "an Expo native module has drifted from the SDK's expected range"
fi

fi # STATIC_ONLY (typechecks + Expo)

summary
[ "$FAILURES" -eq 0 ] && exit 0 || exit 1
