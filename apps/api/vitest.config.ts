import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./tests/helpers/setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'tests/performance/*.bench.ts'],
    // Run test files sequentially since integration tests share a database
    fileParallelism: false,
  },
});
