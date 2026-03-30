import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Run test files sequentially to avoid DB contention between suites
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});
