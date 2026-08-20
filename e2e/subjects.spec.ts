import type { Locator, Page } from '@playwright/test';
import { test, expect, expectPageHealthy } from './fixtures/test';

/**
 * The add-subject selects carry visible labels but no `for`/`id` pairing, so
 * there is no accessible name to target. Finding a select by an option it is
 * known to contain is stable in a way that `nth()` is not -- the exam-board and
 * tier selects are conditionally rendered, so positional indexes shift.
 */
function selectContainingOption(page: Page, optionText: string): Locator {
  return page.locator('select').filter({ has: page.locator(`option:text-is("${optionText}")`) });
}

/** Chooses the first real option, skipping a leading placeholder if present. */
async function chooseFirstRealOption(select: Locator): Promise<void> {
  const values = await select
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  const value = values.find((candidate) => candidate !== '');
  if (!value) throw new Error('select had no selectable option');
  await select.selectOption(value);
}

/** Sets specification and tier if those selects are currently rendered. */
async function fillSpecAndTier(page: Page): Promise<void> {
  const specSelect = selectContainingOption(page, 'Select specification');
  if (await specSelect.count()) await chooseFirstRealOption(specSelect);

  // GCSE is tiered; the tier select appears once a spec with tiers is selected.
  const tierSelect = selectContainingOption(page, 'Higher');
  if (await tierSelect.count()) await tierSelect.selectOption('Higher');
}

// Serial: the duplicate check below depends on the add above having happened on
// this worker's account. Under `fullyParallel` these would otherwise land on
// different workers, which hold different accounts.
test.describe.serial('subject management', () => {
  // The suite's deepest write path. Adding a subject calls resolveSpecificationId(),
  // which walks qualifications -> exam_boards -> subjects -> specifications in the
  // database, so a pass proves the curriculum tree is genuinely seeded on the
  // target branch rather than merely that the form renders.
  test('add a GCSE subject and it survives a reload', async ({ page }) => {
    await page.goto('/dashboard/subjects');
    await expectPageHealthy(page);

    // The form defaults to GCSE / AQA / Biology for a UK student, so only the
    // specification and tier need choosing. Qualification is a custom
    // button+flyout menu (QualificationPicker), not a native <select>.
    await expect(page.getByRole('button', { name: 'GCSE' })).toBeVisible();
    await fillSpecAndTier(page);

    await page.getByRole('button', { name: 'Add' }).click();

    // An unresolvable specification reports inline rather than throwing, so
    // surface that message instead of a bare "element not found".
    const inlineError = page.locator('p.text-red-600').first();
    await expect
      .poll(
        async () => {
          if (await page.getByLabel('Exam date for Biology').isVisible().catch(() => false)) return 'added';
          if (await inlineError.isVisible().catch(() => false)) return (await inlineError.textContent()) ?? 'error';
          return 'pending';
        },
        { timeout: 20_000, message: 'subject was neither added nor rejected' }
      )
      .toBe('added');

    await page.reload();
    await expectPageHealthy(page);
    await expect(page.getByLabel('Exam date for Biology')).toBeVisible();
  });

  test('adding the same subject twice is rejected', async ({ page }) => {
    await page.goto('/dashboard/subjects');
    await expectPageHealthy(page);
    await expect(page.getByLabel('Exam date for Biology')).toBeVisible();

    await fillSpecAndTier(page);
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByText('That subject is already in your list.')).toBeVisible();
  });
});
