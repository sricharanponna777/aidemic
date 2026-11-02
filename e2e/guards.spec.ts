import { test, expect } from './fixtures/test';

/**
 * The proxy's role gating is defense-in-depth -- RLS is the real backstop -- but
 * it is the layer a user actually experiences, and a regression here silently
 * exposes teacher and parent shells to students.
 */
test.describe('role guards (student account)', () => {
  for (const [route, expectedHome] of [
    ['/dashboard/teacher', '/dashboard'],
    ['/dashboard/teacher/classes', '/dashboard'],
    ['/dashboard/parent', '/dashboard'],
    ['/dashboard/parent/progress', '/dashboard'],
  ] as const) {
    test(`${route} redirects a student to ${expectedHome}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(`**${expectedHome}`, { timeout: 20_000 });
      expect(new URL(page.url()).pathname).toBe(expectedHome);
    });
  }

  // Gated on the platform_admins table rather than the role column, so it is a
  // genuinely separate branch in the proxy. Points at /verification because
  // /dashboard/admin/schools no longer exists -- the old target still redirected
  // (the proxy matches the /dashboard/admin prefix before routing resolves), so
  // this passed while covering nothing an admin could actually reach.
  test('/dashboard/admin/verification redirects a non-admin', async ({ page }) => {
    await page.goto('/dashboard/admin/verification');
    await page.waitForURL('**/dashboard', { timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/dashboard');
  });
});
