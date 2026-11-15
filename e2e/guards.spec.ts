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

  // The admin console is gated on role 'school_admin', which only
  // grant_school_admin() can set.
  for (const route of ['/admin']) {
    test(`${route} redirects a student to /dashboard`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL('**/dashboard', { timeout: 20_000 });
      expect(new URL(page.url()).pathname).toBe('/dashboard');
    });
  }
});
