import { defineConfig } from 'vitest/config';

// Root-level config used only to run Phase 9 Wave 0 verify commands that
// span two workspace packages in a single `vitest run` invocation (see
// .planning/phases/09-web-dashboard-owner-portal/09-01-PLAN.md Task 1's
// <verify> command). Package-local test runs (`pnpm --filter <pkg> test`)
// continue to use each package's own vitest.config.ts, which takes
// precedence over this file for any run whose cwd is inside that package.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/shared/src/**/__tests__/*.test.ts',
      'apps/api/src/modules/web-dashboard/**/__tests__/*.test.ts',
      'apps/api/src/modules/owner-portal/**/__tests__/*.test.ts',
    ],
  },
});
