import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Root-level config used only to run Phase 9 verify commands that span
// workspace packages in a single `vitest run` invocation from the repo root
// (see .planning/phases/09-web-dashboard-owner-portal/09-01-PLAN.md Task 1's
// and 09-02-PLAN.md Task 2's <verify> commands). Package-local test runs
// (`pnpm --filter <pkg> test`) continue to use each package's own
// vitest.config.ts, which takes precedence over this file for any run whose
// cwd is inside that package.
//
// `apps/web`'s dashboard component test needs a DOM and a JSX transform,
// neither of which the api/validators suites use -- `environmentMatchGlobs`
// scopes `happy-dom` to just that path so the default stays plain `node` for
// everything else, and the `react` plugin only touches `.tsx`/`.jsx` files.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['apps/web/**', 'happy-dom']],
    // Plan 10-06 Task 1: `apps/api/tests/integration/*.e2e.test.ts` are the
    // first root-included files that hit a REAL Postgres/Redis via
    // `buildTestApp()` (every other file in this list uses a mocked Prisma
    // delegate) -- they need the same env bootstrap
    // (`DATABASE_URL`/`JWT_SECRET`/etc.) `apps/api/vitest.config.ts` already
    // wires up via this exact file. Harmless no-op for every other suite
    // in this list (it only loads dotenv + sets a few env vars).
    setupFiles: ['apps/api/tests/helpers/setup.ts'],
    // Same reason `apps/api/vitest.config.ts` sets this: the new
    // integration suites share one real database and each test's
    // `beforeEach` runs a blanket `cleanupTestData()` truncate -- running
    // those files concurrently in separate workers would let one file's
    // cleanup race another file's still-in-progress fixtures.
    fileParallelism: false,
    include: [
      'packages/validators/src/__tests__/web-dashboard.test.ts',
      'packages/validators/src/__tests__/owner-portal.test.ts',
      'apps/api/src/modules/web-dashboard/**/__tests__/*.test.ts',
      'apps/api/src/modules/owner-portal/**/__tests__/*.test.ts',
      'apps/web/src/features/dashboard/**/__tests__/*.test.tsx',
      // Plan 09-03: browser inventory workbench verify commands.
      'apps/api/src/modules/inventory/**/__tests__/*.test.ts',
      'apps/web/src/features/inventory/**/__tests__/*.test.tsx',
      // Plan 09-04: browser queue/billing workbench + browser-sync verify commands.
      'apps/api/src/modules/queue/**/__tests__/*.test.ts',
      'apps/api/src/modules/billing/**/__tests__/*.test.ts',
      'apps/api/src/realtime/**/__tests__/*.test.ts',
      'apps/web/src/features/queue/**/__tests__/*.test.tsx',
      'apps/web/src/features/billing/**/__tests__/*.test.tsx',
      // Plan 09-06: owner-portal web shell, records, and invoice/checkout flow.
      'apps/web/src/features/owner-portal/**/__tests__/*.test.tsx',
      // Plan 10-01 Task 1: shared offline-sync contract schema tests.
      'packages/validators/src/offline-sync/__tests__/schemas.test.ts',
      // Plan 10-01 Task 2: mobile sync coordinator + API replay-ingress tests.
      'apps/mobile/src/features/offline-sync/**/__tests__/*.test.ts',
      'apps/api/src/modules/sync/**/__tests__/*.test.ts',
      // Plan 10-02: offline queue actions/store (mobile) and queue replay/
      // preemption reconciliation (API).
      'apps/mobile/src/features/queue/**/__tests__/*.test.ts',
      // Plan 10-03: offline consultation draft persistence, clinical
      // conflict classification, and clinical conflict resolution sheet.
      'apps/mobile/src/features/consultation/**/__tests__/*.test.ts',
      'apps/mobile/src/features/consultation/**/__tests__/*.test.tsx',
      'apps/api/src/modules/emr/**/__tests__/*.test.ts',
      // Plan 10-04: offline stock actions (mobile) and inventory replay/
      // operational-review reconciliation (API, already covered by the
      // Plan 09-03 apps/api/src/modules/inventory glob above).
      'apps/mobile/src/features/inventory/**/__tests__/*.test.ts',
      // Plan 10-05: sync visibility UX (mobile, needs .tsx for the
      // component-source-assertion screen test). Retry-escalation +
      // replay-broadcast services and the browser-sync version-check
      // extension are already covered by the apps/api/src/modules/sync and
      // apps/api/src/realtime globs above; the web replay-stale-state test
      // (driving the existing StaleStateBanner) is already covered by the
      // apps/web/src/features/dashboard .test.tsx glob above.
      'apps/mobile/src/features/offline-sync/**/__tests__/*.test.tsx',
      // Plan 10-06 Task 1: the final Phase 10 integration proof harnesses --
      // offline recovery across repeated drop/recover cycles, the
      // walk-in-to-payment golden path, the WhatsApp-triggered flow (all
      // three real-Postgres API integration tests), and the browser
      // reconnect/stale-state proof.
      'apps/api/tests/integration/*.e2e.test.ts',
      'apps/web/tests/integration/*.test.ts',
      // Plan 10-07 (PLT-07): API p95 and queue real-time latency
      // performance benchmarks -- `.bench.ts` rather than `.test.ts` because
      // these assert measured timings, not just pass/fail behavior, but they
      // still run through vitest per the plan's verify commands.
      'apps/api/tests/performance/*.bench.ts',
    ],
  },
});
