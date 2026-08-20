import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_DIR = path.join(process.cwd(), 'e2e', '.auth');

export const TEST_PASSWORD = 'E2ePassw0rd!';

export type TestAccount = {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
};

/** `[a-zA-Z0-9_]{3,20}` is enforced by the signup form's `pattern`, so the
 *  worker index plus a base-36 clock reading has to fit inside 20 characters. */
function makeAccount(workerIndex: number): TestAccount {
  const username = `e2e_${workerIndex}_${Date.now().toString(36)}`;
  return {
    username,
    email: `${username}@example.com`,
    password: TEST_PASSWORD,
    firstName: 'E2E',
    lastName: `Worker${workerIndex}`,
  };
}

/**
 * Drives the real sign-up form rather than calling the Supabase admin API, so
 * the smoke test covers what it is supposed to cover: the client-side signUp,
 * the user_profiles upsert, and the /api/auth cookie sync that the dashboard's
 * server-side guard depends on.
 */
async function signUpStudent(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login?mode=signup');

  await page.getByRole('radio', { name: 'student' }).click();
  await page.getByLabel('First name').fill(account.firstName);
  await page.getByLabel('Last name').fill(account.lastName);
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);

  await page.getByRole('button', { name: 'Sign Up' }).click();

  // The form surfaces setup problems as an inline alert instead of navigating.
  // Confirm-Email-still-enabled is by far the most common one, and failing here
  // with the app's own wording beats a bare navigation timeout 40 seconds later.
  const alert = page.getByRole('alert');
  await expect
    .poll(
      async () => {
        if (/\/onboarding/.test(new URL(page.url()).pathname)) return 'onboarding';
        if (await alert.isVisible().catch(() => false)) return (await alert.textContent()) ?? 'error';
        return 'pending';
      },
      { timeout: 30_000, message: 'sign-up neither navigated to onboarding nor reported an error' }
    )
    .toBe('onboarding');
}

/** Picks a country and lands on the dashboard. UK is deliberate: it has the
 *  deepest seeded curriculum, so downstream specs always have subjects to pick. */
async function completeOnboarding(page: Page): Promise<void> {
  await page.getByLabel('Where are you studying?').selectOption('uk');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

type WorkerFixtures = {
  account: TestAccount;
  workerStorageState: string;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const test = base.extend<{}, WorkerFixtures>({
  account: [
    // Playwright parses the fixture list statically, so the first argument has
    // to be a destructuring pattern even when nothing is destructured from it.
    async ({}, use, workerInfo) => {
      await use(makeAccount(workerInfo.workerIndex));
    },
    { scope: 'worker' },
  ],

  // One sign-up per worker, reused by every test that worker runs. Signing in
  // per test would multiply /api/auth hits by the test count and trip the
  // 20-per-minute-per-IP throttle in src/lib/ipRateLimit.ts.
  workerStorageState: [
    async ({ browser, account }, use, workerInfo) => {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const statePath = path.join(AUTH_DIR, `worker-${workerInfo.workerIndex}.json`);

      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();
      try {
        await signUpStudent(page, account);
        await completeOnboarding(page);
        await context.storageState({ path: statePath });
      } finally {
        await context.close();
      }

      await use(statePath);
    },
    { scope: 'worker' },
  ],

  storageState: ({ workerStorageState }, use) => use(workerStorageState),
});

/**
 * For specs that must start signed out. Playwright resolves fixtures lazily, so
 * using the un-extended base here means those specs never trigger a sign-up at
 * all -- they cost nothing against the /api/auth budget.
 */
export const anonTest = base;

/**
 * The core smoke assertion: the route rendered a real page rather than an error
 * boundary. Next serves a 200 for a client-side crash, so status alone proves
 * nothing -- an `<h1>` plus the absence of the error-boundary copy does.
 */
export async function expectPageHealthy(page: Page): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Application error|Something went wrong|Unhandled Runtime Error/i)).toHaveCount(0);
}

/**
 * Collects uncaught exceptions and console errors for the life of a page.
 * Chunk-load failures are dropped: they fire when a route is navigated away
 * from mid-prefetch, which is a property of the test driving, not of the app.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

export { expect };
export type { Page };
