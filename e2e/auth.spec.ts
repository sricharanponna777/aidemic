import { test, anonTest, expect, expectPageHealthy, TEST_PASSWORD } from './fixtures/test';

// These run signed out, so they never touch the worker sign-up fixture.
anonTest.describe('unauthenticated', () => {
  anonTest('landing page renders with sign-in entry points', async ({ page }) => {
    await page.goto('/');
    await expectPageHealthy(page);
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' }).first()).toBeVisible();
  });

  anonTest('login form renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  // The proxy sends unauthenticated dashboard hits to `/` carrying `next`, so
  // the intended destination survives the round trip through sign-in.
  anonTest('dashboard redirects to landing with a next param', async ({ page }) => {
    await page.goto('/dashboard/notes');
    await page.waitForURL(/\/\?next=/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/dashboard/notes');
  });

  anonTest('bad credentials surface an error and stay put', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('definitely-not-a-user@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password-here');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
  });
});

test.describe('authenticated', () => {
  // Reaching the dashboard at all proves the whole sign-up chain the fixture
  // just drove: supabase signUp, the user_profiles upsert, the /api/auth cookie
  // sync, and the proxy's server-side guard accepting those cookies.
  test('signed-up account lands on a working dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expectPageHealthy(page);
    expect(new URL(page.url()).pathname).toBe('/dashboard');
  });

  test('signed-in user visiting /login is bounced to the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL('**/dashboard');
  });

  // `mode=reset` is the one authenticated state that belongs on /login. If the
  // proxy ever stops exempting it, password recovery strands the user.
  test('login?mode=reset is not bounced', async ({ page }) => {
    await page.goto('/login?mode=reset');
    await expect(page.getByLabel('Confirm new password')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('sign out then sign back in', async ({ page, account }) => {
    await page.goto('/dashboard/settings');
    await expectPageHealthy(page);

    await page.getByRole('button', { name: /sign out|log out/i }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 30_000 });

    await page.goto('/login');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await expectPageHealthy(page);
  });
});
