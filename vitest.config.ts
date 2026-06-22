import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/orphaned-routers-integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/**/*.d.ts'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 65,
        branches: 50,
        functions: 55,
        lines: 65,
      },
    },
  },
});
