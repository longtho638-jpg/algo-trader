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
    ],
  },
});
