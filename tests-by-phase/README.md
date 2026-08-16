# Tests by Phase (Phase 01–05)

Snapshot copies of every test file introduced in Phases 01–04, grouped by phase.
Original directory structure is preserved under each phase folder so you can
diff against the live source. Mapping was derived from git history (commit
messages tagged `feat(phase-NN): ...`).

**For a plain-English summary of what each phase's tests actually check, read the
`PHASE-0N-TESTS.md` file inside each phase folder** — written for a non-engineer
to skim and understand what's covered:

- [phase-01-foundation-authentication/PHASE-01-TESTS.md](phase-01-foundation-authentication/PHASE-01-TESTS.md)
- [phase-02-ui-ux-design-system/PHASE-02-TESTS.md](phase-02-ui-ux-design-system/PHASE-02-TESTS.md)
- [phase-03-patient-registration-walk-in-queue/PHASE-03-TESTS.md](phase-03-patient-registration-walk-in-queue/PHASE-03-TESTS.md)
- [phase-04-emr-clinical-records/PHASE-04-TESTS.md](phase-04-emr-clinical-records/PHASE-04-TESTS.md)
- [phase-05-inventory-management/PHASE-05-TESTS.md](phase-05-inventory-management/PHASE-05-TESTS.md)

## phase-01-foundation-authentication (19 files)
Auth, clinic profile, config, notifications, tenant isolation, mobile auth/setup-wizard flows.
Run: `pnpm --filter @breeyo/api test tests/auth tests/clinic tests/config tests/notifications tests/tenant-isolation.test.ts && pnpm --filter @breeyo/mobile test`

## phase-02-ui-ux-design-system (14 files)
`@breeyo/ui` atoms/molecules/organisms, theme + design tokens, accessibility.
Run: `pnpm --filter @breeyo/ui test`

## phase-03-patient-registration-walk-in-queue (14 files)
Patient module (repository/service/routes) and Queue module (state machine, board, check-in, realtime, archive), plus shared validators.
Run: `pnpm --filter @breeyo/api test tests/patient tests/queue tests/validators src/modules/patient src/modules/queue`

## phase-04-emr-clinical-records (9 files)
EMR consultation service + locking/hand-off + audit trail, vaccination service, file attachments, billing service-catalog seed, EMR/vitals validators, mobile dosage-input parsing.
Run: `pnpm --filter @breeyo/api test src/modules/emr src/modules/vaccination src/modules/attachment src/modules/billing && pnpm --filter @breeyo/validators test && pnpm --filter @breeyo/mobile test tests/consultation`

## phase-05-inventory-management (20 files, 471 tests)
Stock receipt, FIFO dispensing, manual adjustments, barcode lookup, par-level alerts, expiry cron, offline sync replay + idempotency, CSV export, inventory permissions, shared validators. Also documents a live E2E browser-testing session that found 8 real integration bugs invisible to the unit suite.
Run: `pnpm --filter @breeyo/api test src/modules/inventory src/jobs/__tests__/expiry-cron.test.ts && pnpm --filter @breeyo/validators test && pnpm --filter @breeyo/mobile test tests/inventory`

---
These are point-in-time copies for reference/review — always run the suites
from their original locations (`apps/`, `packages/`) for real results, since
these copies won't pick up later fixes made to the live test files.
