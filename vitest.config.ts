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
    include: [
      'packages/validators/src/__tests__/web-dashboard.test.ts',
      'packages/validators/src/__tests__/owner-portal.test.ts',
      'apps/api/src/modules/web-dashboard/**/__tests__/*.test.ts',
      'apps/api/src/modules/owner-portal/**/__tests__/*.test.ts',
      'apps/web/src/features/dashboard/**/__tests__/*.test.tsx',
    ],
  },
});
