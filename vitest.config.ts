import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    exclude: [
      '**/node_modules/**',
      '.claude/**',
      '.opencode/**',
      '**/smoke.test.ts',
      // Polymarket strategy tests excluded — strategies depend on unimplemented
      // infrastructure (clob-client, order-manager, event-bus, gamma-client).
      // Re-enable when polymarket infra is implemented.
      'tests/strategies/**',
    ],
  },
});
