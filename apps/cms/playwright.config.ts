import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against PRODUCTION builds of the CMS and the example site.
 * Run `npm run test:e2e` from the repo root: it builds both, then starts the CMS on
 * :3300 with a throwaway database (tests/e2e/server.mjs). The example site is
 * started by the tests themselves on :3400, once they have made it a site key.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3300',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://localhost:3300/login',
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
})
