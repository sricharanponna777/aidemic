import { defineConfig, devices } from '@playwright/test';

// Point this at a preview deployment (or leave it unset to run the local
// production build). It must be a deployment wired to a *disposable* Supabase
// branch -- the suite creates real accounts and writes real rows.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Vitest collects src/**/*.test.ts and evals/**/*.test.ts. Keeping E2E on
  // `.spec.ts` means neither runner can ever pick up the other's files.
  testMatch: /.*\.spec\.ts$/,

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // Worker count is a rate-limit budget here, not just a speed dial: every
  // sign-up and sign-in POSTs /api/auth, which throttles at 20 hits/minute
  // *per IP* (src/lib/ipRateLimit.ts), and every worker shares the runner's
  // egress IP. The auth fixture spends one /api/auth hit per worker rather
  // than one per test, which keeps 4 workers well inside the window. Raise
  // this and you are spending that budget, so raise it deliberately.
  workers: 4,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The app ships a strict CSP; running with a real Chrome profile keeps the
    // smoke test honest about anything the CSP would block in production.
    ...devices['Desktop Chrome'],
  },

  projects: [{ name: 'chromium' }],

  // Only used when E2E_BASE_URL is unset. `bun run start` serves the production
  // build, so this exercises the same output a preview deployment would.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'bun run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
