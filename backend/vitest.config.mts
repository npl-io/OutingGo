import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration test files share one test database and truncate it in
    // beforeEach, so files must not run concurrently.
    fileParallelism: false,
  },
});
