import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

test('loads, creates a record, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  await expect(page.getByRole('heading', { name: 'Request radar' })).toBeVisible();
  await expect(page.getByTestId('radar-blip').first()).toBeVisible();
  await assertNoHorizontalScroll(page);

  await openApp(page, '/submit');
  await page.getByLabel('Title').fill('Overdue purchase orders by buyer');
  await page.getByLabel('Description').fill('Open purchase orders past their due date, per buyer, refreshed daily.');
  await page.getByRole('combobox', { name: 'Team', exact: true }).fill('Operations');
  await page.getByLabel('Value to your team').selectOption('4');
  await page.getByLabel('Urgency').selectOption('high');
  await page.getByRole('button', { name: 'Submit request' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Overdue purchase orders by buyer' })).toBeVisible();
  await expect(page.getByTestId('timeline')).toContainText('submitted by Jordan Lee');

  await page.goto('/#/?view=list');
  await expect(page.getByTestId('queue-list').getByRole('link', { name: 'Overdue purchase orders by buyer' })).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('every page renders without horizontal scroll', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  for (const path of ['/', '/submit', '/board', '/insights', '/about']) {
    await openApp(page, path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await assertNoHorizontalScroll(page);
  }
  consoleWatch.assertClean();
});

test('submit validates inline with the entity limits', async ({ page }) => {
  await openApp(page, '/submit');
  await page.getByLabel('Title').fill('Abc');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText('Title needs at least 5 characters.')).toBeVisible();
  await expect(page.getByText('Description is required.')).toBeVisible();
  await expect(page.getByText('Team is required.')).toBeVisible();
});
