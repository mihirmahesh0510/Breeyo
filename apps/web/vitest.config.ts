import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Plan 09-02 Task 2: `apps/web` previously only ran pure-logic tests
// (`week-grid.test.ts`) under a bare 'node' environment. Phase 9's dashboard
// components need a DOM (`@testing-library/react` renders into it) and a JSX
// transform, so this now installs `@vitejs/plugin-react` and switches to
// `happy-dom` -- a lighter DOM implementation than `jsdom`, sufficient for
// Testing Library's queries/events. `happy-dom` is a superset environment for
// the existing pure-logic tests too, so nothing before this plan regresses.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    testTimeout: 15000,
  },
});
