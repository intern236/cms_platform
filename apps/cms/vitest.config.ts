import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'tests/unit/empty.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    /* Every test file gets its own fresh database on the backend TEST_DB names. */
    globalSetup: ['tests/unit/global-setup.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
