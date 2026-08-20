import { test, expect, expectPageHealthy, collectPageErrors } from './fixtures/test';

/**
 * Mirrors STUDENT_NAV_GROUPS in src/lib/nav.ts. Deliberately duplicated rather
 * than imported: nav.ts pulls in lucide-react components, and a smoke suite
 * should not depend on the app's module graph resolving under the test runner.
 * `nav routes are all covered` below fails if the two ever drift.
 */
const STUDENT_ROUTES = [
  '/dashboard',
  '/dashboard/subjects',
  '/dashboard/notes',
  '/dashboard/podcasts',
  '/dashboard/flashcards',
  '/dashboard/daily-review',
  '/dashboard/study-sessions',
  '/dashboard/confidence',
  '/dashboard/planner',
  '/dashboard/ai-questions',
  '/dashboard/blurt',
  '/dashboard/exam-coach',
  '/dashboard/classes',
  '/dashboard/family',
  '/dashboard/settings',
] as const;

test.describe('student routes render', () => {
  for (const route of STUDENT_ROUTES) {
    test(`${route} renders without error`, async ({ page }) => {
      const errors = collectPageErrors(page);

      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} returned HTTP ${response?.status()}`).toBeLessThan(400);

      // Every one of these routes reads from Supabase under RLS. A policy that
      // rejects the read shows up as an empty or crashed page, not a bad status.
      await expectPageHealthy(page);
      expect(new URL(page.url()).pathname, `${route} redirected away`).toBe(route);
      expect(errors, `${route} logged page errors`).toEqual([]);
    });
  }
});

test.describe('sidebar navigation', () => {
  // Clicking through the sidebar exercises client-side routing, which is a
  // different code path from the direct `goto` above -- a broken Link or a
  // client component that only crashes on soft navigation is invisible to it.
  test('sidebar links soft-navigate correctly', async ({ page }) => {
    await page.goto('/dashboard');
    await expectPageHealthy(page);

    for (const [label, expected] of [
      ['Subjects', '/dashboard/subjects'],
      ['Flashcards', '/dashboard/flashcards'],
      ['Settings', '/dashboard/settings'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).first().click();
      await page.waitForURL(`**${expected}`);
      await expectPageHealthy(page);
    }
  });
});

test('nav routes are all covered', async ({ page }) => {
  // Reads the sidebar the app actually rendered, so a route added to nav.ts
  // without a matching entry in STUDENT_ROUTES fails here instead of silently
  // going untested.
  await page.goto('/dashboard');
  await expectPageHealthy(page);

  const hrefs = await page
    .getByRole('navigation')
    .first()
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));

  const missing = [...new Set(hrefs)]
    .filter((href) => href.startsWith('/dashboard'))
    .filter((href) => !STUDENT_ROUTES.includes(href as (typeof STUDENT_ROUTES)[number]));

  expect(missing, 'sidebar routes missing from STUDENT_ROUTES in this spec').toEqual([]);
});
