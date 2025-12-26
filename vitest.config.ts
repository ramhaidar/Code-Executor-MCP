import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'build', 'servers'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        // CLI entry points that execute immediately - exclude from coverage
        'src/generate.ts',
        'src/server.ts',
        'src/run.ts',
      ],
      // Coverage thresholds - enforcing 100% across all metrics
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Setup file for global mocks and utilities
    setupFiles: ['./tests/setup.ts'],
    // Pool configuration for better isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});